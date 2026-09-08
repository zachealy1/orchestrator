import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

export const engineDigest = (file) => {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > 600 * 1024 * 1024) throw new Error("Expected a regular Codex runtime file.");
  fs.accessSync(file, fs.constants.X_OK);
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
};

export function engineRelease(pin, target) {
  const release = { version: pin.version, target, archiveSha256: pin.archives[target],
    codeModeHostArchiveSha256: pin.codeModeHostArchives?.[target] };
  if (!/^\d+\.\d+\.\d+$/.test(release.version) || !/^(aarch64|x86_64)-apple-darwin$/.test(target)
    || ![release.archiveSha256, release.codeModeHostArchiveSha256].every((hash) => /^[a-f0-9]{64}$/.test(hash ?? ""))) {
    throw new Error("Incomplete pinned Codex runtime metadata.");
  }
  return release;
}

export function engineComponents(release) {
  return [
    { name: "codex", archiveHash: release.archiveSha256, hashKey: "executableSha256" },
    { name: "codex-code-mode-host", archiveHash: release.codeModeHostArchiveSha256, hashKey: "codeModeHostSha256" },
  ];
}

export function verifyRuntimeFiles(directory, release) {
  const record = JSON.parse(fs.readFileSync(path.join(directory, "runtime.json"), "utf8"));
  if (!isDeepStrictEqual(record.release, release)) throw new Error("Codex runtime does not match the app's pin.");
  for (const component of engineComponents(release)) {
    if (engineDigest(path.join(directory, component.name)) !== record[component.hashKey]) {
      throw new Error(`Codex ${component.name} integrity check failed.`);
    }
  }
  return record;
}
