import { execFileSync } from "node:child_process";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
const packages = new Map();
const npm = JSON.parse(execFileSync("npm", ["ls", "--all", "--omit=dev", "--json", "--long"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }));
function collect(deps) { for (const [name, dep] of Object.entries(deps ?? {})) {
  if (dep.path && dep.version) packages.set(`npm:${name}@${dep.version}`, { directory: dep.path, license: dep.license ?? "See included licence" });
  collect(dep.dependencies);
} }
collect(npm.dependencies);
const cargo = JSON.parse(execFileSync("cargo", ["metadata", "--manifest-path", "src-tauri/Cargo.toml", "--locked", "--format-version", "1"], { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 }));
for (const pkg of cargo.packages) if (pkg.name !== "orchestrator") packages.set(`cargo:${pkg.name}@${pkg.version}`, { directory: dirname(pkg.manifest_path), license: pkg.license ?? "See included licence", licenseFile: pkg.license_file });
const text = ["# Third-party notices", "Generated from locked dependencies. Includes cross-platform and build-time dependencies for completeness; not every dependency is shipped on macOS."];
const inventory = [];
for (const [name, pkg] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
  const files = (await readdir(pkg.directory)).filter((file) => /^(licen[cs]e|copying|notice)([.-]|$)/i.test(file));
  if (pkg.licenseFile && !files.includes(pkg.licenseFile)) files.push(pkg.licenseFile);
  const notices = [];
  for (const file of files) { try { notices.push(await readFile(join(pkg.directory, file), "utf8")); } catch (error) { if (error.code !== "EISDIR") throw error; } }
  inventory.push({ package: name, license: pkg.license, includedLicenseTexts: notices.length });
  text.push(`\n## ${name}\n\nLicence: ${typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license)}\n`, ...notices);
}
await mkdir("src-tauri/resources/notices", { recursive: true });
await writeFile("src-tauri/resources/notices/THIRD-PARTY-NOTICES.txt", text.join("\n"));
await writeFile("src-tauri/resources/notices/dependency-inventory.json", JSON.stringify(inventory, null, 2));
console.log(`Prepared licence inventory for ${inventory.length} locked dependencies without local build paths.`);
