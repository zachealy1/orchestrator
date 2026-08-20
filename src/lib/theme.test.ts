import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setNativeTheme: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  setTheme: mocks.setNativeTheme,
}));

import {
  THEME_STORAGE_KEY,
  applyDocumentTheme,
  applyResolvedTheme,
  applyThemePreference,
  initializeTheme,
  isThemePreference,
  persistThemePreference,
  readThemePreference,
  resolveTheme,
} from "./theme";

describe("theme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
    mocks.setNativeTheme.mockResolvedValue(undefined);
  });

  it("supports dark as the only interface preference", () => {
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("light")).toBe(false);
    expect(isThemePreference("system")).toBe(false);
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("ignores legacy preferences and persists dark", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(readThemePreference()).toBe("dark");

    persistThemePreference("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("keeps document and native chrome dark", () => {
    applyDocumentTheme("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    applyResolvedTheme("light");
    expect(mocks.setNativeTheme).toHaveBeenCalledWith("dark");

    applyThemePreference("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(mocks.setNativeTheme).toHaveBeenLastCalledWith("dark");
  });

  it("initializes dark and replaces any stale saved preference", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "system");

    expect(initializeTheme()).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(mocks.setNativeTheme).toHaveBeenCalledWith("dark");
  });
});
