import { describe, expect, it } from "vitest";
import { extractUnifiedDiffFilePatches } from "./unifiedDiff";

describe("Kanban unified diff selection", () => {
  const repositoryDiff = [
    "diff --git a/src/first.ts b/src/first.ts",
    "index 1111111..2222222 100644",
    "--- a/src/first.ts",
    "+++ b/src/first.ts",
    "@@ -1 +1 @@",
    "-first",
    "+updated first",
    "diff --git a/src/second.ts b/src/second.ts",
    "index 3333333..4444444 100644",
    "--- a/src/second.ts",
    "+++ b/src/second.ts",
    "@@ -1 +1 @@",
    "-second",
    "+updated second",
    "",
  ].join("\n");

  it("extracts exact per-file patches from a repository diff", () => {
    const patches = extractUnifiedDiffFilePatches(repositoryDiff);

    expect(patches).toHaveLength(2);
    expect(patches[0]).toMatchObject({
      oldPath: "src/first.ts",
      newPath: "src/first.ts",
    });
    expect(patches[0].content).toContain("+updated first");
    expect(patches[0].content).not.toContain("updated second");
    expect(patches[1].content).toContain("+updated second");
  });

  it("extracts renamed paths", () => {
    const renameDiff = [
      "diff --git a/src/before.ts b/src/after.ts",
      "similarity index 100%",
      "rename from src/before.ts",
      "rename to src/after.ts",
      "",
    ].join("\n");

    expect(extractUnifiedDiffFilePatches(renameDiff)[0]).toMatchObject({
      oldPath: "src/before.ts",
      newPath: "src/after.ts",
    });
  });

  it("uses /dev/null headers for added and deleted files", () => {
    const addedDiff = [
      "diff --git a/new file.ts b/new file.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/new file.ts",
      "@@ -0,0 +1 @@",
      "+new",
    ].join("\n");
    const [patch] = extractUnifiedDiffFilePatches(addedDiff);

    expect(patch).toMatchObject({ oldPath: null, newPath: "new file.ts" });
  });

  it("decodes Git-quoted paths", () => {
    const quotedDiff = [
      'diff --git "a/src/caf\\303\\251.ts" "b/src/caf\\303\\251.ts"',
      "GIT binary patch",
      "literal 0",
      "HcmV?d00001",
    ].join("\n");

    expect(extractUnifiedDiffFilePatches(quotedDiff)[0]).toMatchObject({
      oldPath: "src/café.ts",
      newPath: "src/café.ts",
    });
  });
});
