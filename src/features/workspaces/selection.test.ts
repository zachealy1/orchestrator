import { beforeEach, describe, expect, it } from "vitest";
import { persistSelectedWorkspace, restoreSelectedWorkspace } from "./selection";
import type { Workspace } from "./types";

const workspaces = [{ id: 1 }, { id: 2 }] as Workspace[];

describe("workspace selection persistence", () => {
  beforeEach(() => localStorage.clear());
  it("restores the selected workspace instead of the most recently added one", () => {
    persistSelectedWorkspace(2);
    expect(restoreSelectedWorkspace(workspaces)).toBe(workspaces[1]);
  });
  it("falls back when the saved workspace has been removed", () => {
    persistSelectedWorkspace(3);
    expect(restoreSelectedWorkspace(workspaces)).toBe(workspaces[0]);
    expect(restoreSelectedWorkspace([])).toBeNull();
  });
});
