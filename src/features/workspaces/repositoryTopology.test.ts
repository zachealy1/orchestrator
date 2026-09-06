import { describe, expect, it } from "vitest";
import {
  formatWorkspaceRepositoryContext,
  workspaceRepositoryTopology,
  workspaceRunRepositoryContext,
} from "./repositoryTopology";
import type { WorkspaceGitOverview } from "./types";

function overview(paths: string[]): WorkspaceGitOverview {
  return {
    workspacePath: "/workspace",
    repositories: paths.map((path) => {
      const segments = path.split("/");
      const basename = segments[segments.length - 1] ?? "Repository";
      return {
        workspacePath: "/workspace",
        gitRoot: path,
        currentBranch: "main",
        files: [],
        repository: {
          rootPath: path,
          relativePath: basename,
          label: basename,
        },
      };
    }),
    additions: 0,
    deletions: 0,
    changedRepositoryCount: 0,
    files: [],
    discoveryTruncated: false,
  };
}

describe("workspace repository topology", () => {
  it("preserves repository and branch targeting for one repository", () => {
    const snapshot = overview(["/workspace/app"]);
    expect(workspaceRepositoryTopology(snapshot).kind).toBe("single");
    expect(
      workspaceRunRepositoryContext({
        overview: snapshot,
        selectedBranch: "feature/test",
      }),
    ).toMatchObject({
      selectedRepositoryPath: "/workspace/app",
      selectedBranch: "feature/test",
      multiRepository: false,
    });
  });

  it("removes repository and branch targeting for multiple repositories", () => {
    const snapshot = overview(["/workspace/app", "/workspace/api"]);
    expect(workspaceRepositoryTopology(snapshot).kind).toBe("multi");
    expect(
      workspaceRunRepositoryContext({
        overview: snapshot,
        selectedBranch: "feature/test",
      }),
    ).toMatchObject({
      selectedRepositoryPath: null,
      selectedBranch: null,
      multiRepository: true,
    });
  });

  it("formats an agent-facing inventory without choosing a repository", () => {
    expect(
      formatWorkspaceRepositoryContext(
        overview(["/workspace/app", "/workspace/api"]).repositories,
      ),
    ).toContain("no repository is preselected");
  });
});
