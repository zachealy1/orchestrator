import { readFile, readdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

async function walk(directory) {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map((item) =>
    item.isDirectory() ? walk(join(directory, item.name)) : [join(directory, item.name)]))).flat();
}
function structural(value) {
  if (Array.isArray(value)) return value.map(structural);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !["description", "title", "$schema", "examples", "default"].includes(key)).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, structural(item)]));
}
function reachable(document, shape) {
  const definitions = {};
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.$ref?.startsWith("#/definitions/")) {
      const name = node.$ref.slice(14);
      if (!(name in definitions)) { definitions[name] = document.definitions[name]; visit(definitions[name]); }
    }
    Object.values(node).forEach((value) => { if (value !== node.$ref) visit(value); });
  }
  visit(shape);
  return structural({ ...shape, definitions });
}
export async function contract(binary) {
  const output = await mkdtemp(join(tmpdir(), "orchestrator-release-schema-"));
  try {
    execFileSync(binary, ["app-server", "generate-json-schema", "--experimental", "--out", output], { stdio: "pipe", timeout: 60_000 });
    // Include indirect literals, native helpers and all active production feature modules.
    const source = (await Promise.all([...(await walk("src")), ...(await walk("src-tauri/src"))]
      .filter((path) => /\.(ts|tsx|rs)$/.test(path) && !/test|generated/.test(path))
      .map((path) => readFile(path, "utf8")))).join("\n");
    const result = {};
    const requestNames = new Set();
    for (const file of ["ClientRequest", "ServerNotification", "ServerRequest"]) {
      const document = JSON.parse(await readFile(join(output, `${file}.json`), "utf8"));
      for (const variant of document.oneOf) {
        const method = variant.properties?.method?.enum?.[0];
        if (!method || !source.includes(`"${method}"`) && !source.includes(`'${method}'`)) continue;
        result[`${file}:${method}`] = reachable(document, variant);
        if (file === "ClientRequest") requestNames.add((variant.title ?? "").replace(/Request$/, "Response"));
      }
    }
    for (const path of await walk(output)) {
      const name = basename(path, ".json");
      if (!name.endsWith("Response") || !requestNames.has(name) && !source.includes(name)) continue;
      const document = JSON.parse(await readFile(path, "utf8"));
      const { definitions: _definitions, ...shape } = document;
      result[`Response:${name}`] = reachable(document, shape);
    }
    assert.ok(Object.keys(result).length > 30, "Consumed protocol inventory unexpectedly empty");
    return result;
  } finally { await rm(output, { recursive: true, force: true }); }
}
if (process.argv[1]?.endsWith("protocol-contract.mjs")) {
  const [binary, baseline] = process.argv.slice(2);
  if (!binary || !baseline) throw new Error("Usage: protocol-contract.mjs BINARY BASELINE_BINARY_OR_JSON [OUTPUT]");
  const actual = await contract(binary);
  const expected = baseline.endsWith(".json") ? JSON.parse(await readFile(baseline, "utf8")) : await contract(baseline);
  // Conservative: changes to used DTOs require review. Unused protocol additions and documentation changes do not.
  assert.deepEqual(actual, expected, "Consumed Codex protocol changed. Manual compatibility review required; do not weaken tests automatically.");
  if (process.argv[4]) await writeFile(process.argv[4], `${JSON.stringify(actual, null, 2)}\n`);
  console.log(`Verified ${Object.keys(actual).length} consumed protocol contracts.`);
}
