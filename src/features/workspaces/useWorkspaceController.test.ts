import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Workspace } from "./types";
import { useWorkspaceController } from "./useWorkspaceController";

function workspace(id: number, path: string): Workspace {
  const segments = path.split("/");
  return {
    id,
    path,
    label: segments[segments.length - 1] ?? path,
    default_account_id: null,
    selected_git_repository_path: null,
    last_opened_at: "2026-08-02T00:00:00.000Z",
    created_at: "2026-08-02T00:00:00.000Z",
  };
}

describe("useWorkspaceController", () => {
  it("keeps selected workspace and list refs synchronized", () => {
    const { result } = renderHook(() =>
      useWorkspaceController(),
    );
    const first = workspace(1, "/workspace/one");
    const second = workspace(2, "/workspace/two");

    act(() => {
      result.current.setWorkspaces([first, second]);
      result.current.setSelectedWorkspace(second);
    });

    expect(result.current.workspacesRef.current).toEqual([first, second]);
    expect(result.current.selectedWorkspaceRef.current).toEqual(second);
    expect(result.current.workspaceLocationsKey).toContain("/workspace/one");
    expect(result.current.workspaceLocationsKey).toContain("/workspace/two");
  });

  it("owns workspace directory cache state for one app instance", () => {
    const { result } = renderHook(() => useWorkspaceController());

    act(() => {
      result.current.directoryEntriesCache.current.set("root", []);
    });

    expect(result.current.directoryEntriesCache.current.has("root")).toBe(true);
  });
});
