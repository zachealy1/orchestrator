import { describe, expect, it } from "vitest";
import type { RunEditedFile } from "../../lib/codexEventReducer";
import { mergeEditedFileActivities } from "./runtimeHelpers";

function file(path: string, additions = 0): RunEditedFile {
  return { path, name: path.split("/").pop()!, additions, deletions: 0, status: "modified" };
}

describe("historical edited-file reconciliation", () => {
  const aliases = [
    { absolutePath: "/cards/qa/snake", relativePath: "snake" },
    { absolutePath: "/workspace/snake", relativePath: "snake" },
    { absolutePath: "/cards/qa/space", relativePath: "space" },
  ];

  it("deduplicates absolute activity paths against the final relative diff without erasing counts", () => {
    expect(mergeEditedFileActivities(
      [file("snake/qa.txt", 3)],
      [file("/cards/qa/snake/qa.txt"), file("/workspace/snake/qa.txt")], aliases,
    )).toEqual([file("snake/qa.txt", 3)]);
  });

  it("keeps equal filenames in different repositories and unrelated absolute paths distinct", () => {
    expect(mergeEditedFileActivities([file("snake/qa.txt", 3)], [
      file("/cards/qa/space/qa.txt", 1), file("/cards/qa/snake-other/qa.txt", 2),
    ], aliases).map((entry) => entry.path)).toEqual([
      "snake/qa.txt", "space/qa.txt", "/cards/qa/snake-other/qa.txt",
    ]);
  });

  it("handles a single-repository binding and repeated trace pages", () => {
    const aliases = [{ absolutePath: "/cards/qa/root/", relativePath: "." }];
    const once = mergeEditedFileActivities([file("./src/qa.txt", 2)], [file("/cards/qa/root/src/qa.txt")], aliases);
    expect(once).toEqual([file("src/qa.txt", 2)]);
    expect(mergeEditedFileActivities(once, [file("/cards/qa/root/src/qa.txt")], aliases)).toEqual(once);
  });
});
