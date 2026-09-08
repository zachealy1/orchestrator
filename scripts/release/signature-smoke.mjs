// Offline signing rehearsal using disposable keys, never the production updater key.
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const directory = await mkdtemp(join(tmpdir(), "orchestrator-signature-smoke-"));
const key = join(directory, "test.key"), payload = join(directory, "test-package"), password = "disposable-test-key-only";
try {
  execFileSync("npx", ["tauri", "signer", "generate", "--ci", "-p", password, "-w", key], { stdio: "pipe" });
  await writeFile(payload, "harmless signature fixture");
  execFileSync("npx", ["tauri", "signer", "sign", "-f", key, "-p", password, payload], { stdio: "pipe" });
  const env = { ...process.env, ORCHESTRATOR_UPDATER_PUBLIC_KEY: (await readFile(`${key}.pub`, "utf8")).trim() };
  const args = ["run", "--quiet", "--manifest-path", "src-tauri/Cargo.toml", "--features", "dev-tools", "--bin", "verify-update-signature", "--", payload, `${payload}.sig`];
  const verify = () => spawnSync("cargo", args, { env, stdio: "pipe", timeout: 300_000 });
  if (verify().status !== 0) throw new Error("Valid updater signature was rejected");
  await writeFile(payload, "tampered fixture");
  if (verify().status === 0) throw new Error("Tampered updater package was accepted");
  console.log("Offline updater signature rehearsal passed: valid package accepted; tampered bytes rejected. Disposable keys removed.");
} finally { await rm(directory, { recursive: true, force: true }); }
