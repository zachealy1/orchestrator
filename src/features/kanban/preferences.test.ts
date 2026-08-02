import { describe, expect, it, vi } from "vitest";
import {
  persistWorkspaceSurfaceMode,
  readWorkspaceSurfaceMode,
  WORKSPACE_SURFACE_MODE_KEY,
} from "./preferences";

describe("Kanban workspace surface preference", () => {
  it("defaults invalid and missing values to chat", () => {
    expect(readWorkspaceSurfaceMode({ getItem: () => null })).toBe("chat");
    expect(readWorkspaceSurfaceMode({ getItem: () => "board" })).toBe("chat");
  });

  it("restores and saves Kanban mode", () => {
    expect(readWorkspaceSurfaceMode({ getItem: () => "kanban" })).toBe(
      "kanban",
    );
    const setItem = vi.fn();
    persistWorkspaceSurfaceMode("kanban", { setItem });
    expect(setItem).toHaveBeenCalledWith(WORKSPACE_SURFACE_MODE_KEY, "kanban");
  });
});
