import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = join(root, "src");
const errors = [];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectFiles(path);
      return [path];
    }),
  );
  return nested.flat();
}

const sourceFiles = (await collectFiles(sourceRoot)).filter((path) =>
  [".ts", ".tsx"].includes(extname(path)),
);
const productionFiles = sourceFiles.filter(
  (path) =>
    !path.includes("/generated/") &&
    !path.includes("/test/") &&
    !/\.(?:test|spec)\.[^.]+$/.test(path),
);

const sourceByPath = new Map(
  await Promise.all(
    productionFiles.map(async (path) => [path, await readFile(path, "utf8")]),
  ),
);
const modulePaths = new Set(productionFiles);
const graph = new Map(productionFiles.map((path) => [path, []]));

function resolveRelativeImport(importer, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(importer, "..", specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (modulePaths.has(candidate)) return candidate;
  }
  return null;
}

function architectureLayer(path) {
  const local = relative(sourceRoot, path).replaceAll("\\", "/");
  if (local.startsWith("shared/")) return "shared";
  if (local.startsWith("features/")) return "features";
  if (local.startsWith("app/")) return "app";
  return "legacy";
}

for (const [path, source] of sourceByPath) {
  const local = relative(root, path);
  if (
    /import\s*\{[^}]*\binvoke\b[^}]*\}\s*from\s*["']@tauri-apps\/api\/core["']/.test(
      source,
    ) ||
    /\binvoke\s*[<(]/.test(source)
  ) {
    errors.push(`${local}: raw Tauri invoke is forbidden; use generated bindings.`);
  }
  if (/from\s+["'][^"']*\/TaskChatTranscript["']/.test(source)) {
    errors.push(`${local}: legacy TaskChatTranscript imports are forbidden.`);
  }
  if (
    source.includes("@tanstack/react-virtual") &&
    !["src/components/CodePreview.tsx", "src/components/DiffPreview.tsx"].includes(
      local.replaceAll("\\", "/"),
    )
  ) {
    errors.push(`${local}: TanStack Virtual is reserved for code and diff previews.`);
  }

  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const imported = resolveRelativeImport(path, statement.moduleSpecifier.text);
    if (!imported) continue;
    graph.get(path).push(imported);
    const ownerLayer = architectureLayer(path);
    const importedLayer = architectureLayer(imported);
    if (ownerLayer === "shared" && importedLayer !== "shared") {
      errors.push(`${local}: shared modules cannot import ${importedLayer} modules.`);
    }
    if (ownerLayer === "features" && importedLayer === "app") {
      errors.push(`${local}: feature modules cannot import app composition.`);
    }
  }
}

const visiting = new Set();
const visited = new Set();
const stack = [];
const reportedCycles = new Set();
function visit(path) {
  if (visited.has(path)) return;
  if (visiting.has(path)) {
    const start = stack.indexOf(path);
    const cycle = [...stack.slice(start), path]
      .map((item) => relative(sourceRoot, item))
      .join(" -> ");
    if (!reportedCycles.has(cycle)) {
      errors.push(`Circular production import: ${cycle}`);
      reportedCycles.add(cycle);
    }
    return;
  }
  visiting.add(path);
  stack.push(path);
  for (const dependency of graph.get(path) ?? []) visit(dependency);
  stack.pop();
  visiting.delete(path);
  visited.add(path);
}
for (const path of graph.keys()) visit(path);

const sizeLimits = new Map([
  ["src/App.tsx", 800],
  // These ratchets preserve the decomposition achieved in this branch. They
  // should only move down as the remaining runtime and rendering seams split.
  ["src/app/ApplicationRuntime.tsx", 15_900],
  ["src/components/TaskChatTurn.tsx", 2_700],
  ["src/components/TaskComposer.tsx", 2_100],
  ["src/components/VirtuosoTaskChatTranscript.tsx", 1_900],
  ["src-tauri/src/lib.rs", 300],
]);
for (const [file, limit] of sizeLimits) {
  const source = await readFile(join(root, file), "utf8");
  const lines = source.split(/\r?\n/).length;
  if (lines > limit) errors.push(`${file}: ${lines} lines exceeds the ${limit}-line guardrail.`);
}

const applicationRuntimeSource = await readFile(
  join(root, "src/app/ApplicationRuntime.tsx"),
  "utf8",
);
const applicationRuntimeLines = applicationRuntimeSource.split(/\r?\n/);
const runSetupStart = applicationRuntimeLines.findIndex((line) =>
  line.includes("async function continueRunSetup("),
);
const runSetupEnd = applicationRuntimeLines.findIndex(
  (line, index) =>
    index > runSetupStart && line.startsWith("  function scheduleRunSetup("),
);
if (
  runSetupStart < 0 ||
  runSetupEnd < 0 ||
  runSetupEnd - runSetupStart > 350
) {
  errors.push(
    "src/app/ApplicationRuntime.tsx: continueRunSetup must remain a staged coordinator below 350 lines.",
  );
}

for (const path of sourceFiles) {
  const local = relative(root, path).replaceAll("\\", "/");
  if (
    !/\.(?:test|spec)\.[^.]+$/.test(path) &&
    !local.startsWith("src/test/")
  ) {
    continue;
  }
  const source = await readFile(path, "utf8");
  const lines = source.split(/\r?\n/).length;
  if (lines > 2_000) {
    errors.push(`${local}: ${lines} lines exceeds the 2,000-line test guardrail.`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Architecture checks passed for ${productionFiles.length} production modules.`);
