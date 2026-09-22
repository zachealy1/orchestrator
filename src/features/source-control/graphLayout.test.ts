import { describe, expect, it } from "vitest";
import { appendGraph } from "./graphLayout";
import type { GitHistoryCommit } from "./api";
const commit = (sha: string, parents: string[]): GitHistoryCommit => ({ sha, parents, author: "Author", date: "2026-09-22", subject: sha, refs: [], isShallowBoundary: false });
describe("history graph", () => {
  it("keeps merge parents, fork joins, and lanes continuous across pages", () => {
    const commits = [commit("merge", ["left", "right"]), commit("left", ["base"]), commit("right", ["base"]), commit("base", [])];
    const first = appendGraph(commits.slice(0, 2));
    const second = appendGraph(commits.slice(2), first.state);
    expect([...first.rows, ...second.rows]).toEqual(appendGraph(commits).rows);
    expect(first.rows[0].edges.filter(edge => edge.start === "node").map(edge => edge.to)).toEqual([0, 1]);
    expect(first.rows[1].edges).toContainEqual({ from: 1, to: 1, start: "top", end: "bottom", color: 1 });
    expect(second.rows[0].edges).toContainEqual({ from: 1, to: 0, start: "node", end: "bottom", color: 0 });
    expect(second.state.lanes).toEqual([]);
  });
  it("allows multiple roots and octopus merges without overwriting pending parents", () => {
    const result = appendGraph([commit("m", ["a", "b", "c"]), commit("a", []), commit("orphan", []), commit("b", []), commit("c", [])]);
    expect(result.rows[0].edges).toHaveLength(3);
    expect(result.rows[4].lane).toBe(2);
    expect(result.state.lanes).toHaveLength(0);
  });
});
