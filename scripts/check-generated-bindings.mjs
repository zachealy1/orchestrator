import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const generated = join(root, "src", "generated", "tauri.ts");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "orchestrator-bindings-"));
const temporary = join(temporaryDirectory, "tauri.ts");

try {
  const result = spawnSync(
    "cargo",
    [
      "run",
      "--quiet",
      "--no-default-features",
      "--features",
      "dev-tools",
      "--bin",
      "generate-bindings",
      "--",
      temporary,
    ],
    { cwd: join(root, "src-tauri"), encoding: "utf8" },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  const [expected, actual] = await Promise.all([
    readFile(generated, "utf8"),
    readFile(temporary, "utf8"),
  ]);
  if (expected !== actual) {
    console.error(
      "Generated Tauri bindings are stale. Run `npm run generate:bindings`.",
    );
    process.exit(1);
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
