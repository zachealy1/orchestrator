import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setNativeTheme: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  setTheme: mocks.setNativeTheme,
}));

import {
  SYSTEM_DARK_QUERY,
  THEME_STORAGE_KEY,
  applyDocumentTheme,
  applyThemePreference,
  isThemePreference,
  persistThemePreference,
  readThemePreference,
  resolveTheme,
  watchSystemTheme,
} from "./theme";

function createMediaQuery(matches: boolean) {
  let listener: ((event: MediaQueryListEvent) => void) | null = null;
  const mediaQuery = {
    matches,
    media: SYSTEM_DARK_QUERY,
    onchange: null,
    addEventListener: vi.fn(
      (_type: string, nextListener: (event: MediaQueryListEvent) => void) => {
        listener = nextListener;
      },
    ),
    removeEventListener: vi.fn(() => {
      listener = null;
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  return {
    mediaQuery,
    emit(nextMatches: boolean) {
      listener?.({ matches: nextMatches } as MediaQueryListEvent);
    },
  };
}

describe("theme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
    mocks.setNativeTheme.mockResolvedValue(undefined);
  });

  it("validates and persists supported preferences", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("sepia")).toBe(false);

    persistThemePreference("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(readThemePreference()).toBe("dark");
  });

  it("falls back to system for missing or invalid stored values", () => {
    expect(readThemePreference()).toBe("system");

    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(readThemePreference()).toBe("system");

    expect(
      readThemePreference({
        getItem() {
          throw new Error("storage unavailable");
        },
      }),
    ).toBe("system");
  });

  it("resolves system mode from the operating system preference", () => {
    const darkMedia = createMediaQuery(true);
    const lightMedia = createMediaQuery(false);

    expect(resolveTheme("system", () => darkMedia.mediaQuery)).toBe("dark");
    expect(resolveTheme("system", () => lightMedia.mediaQuery)).toBe("light");
    expect(resolveTheme("light", () => darkMedia.mediaQuery)).toBe("light");
  });

  it("applies document and native themes", () => {
    applyDocumentTheme("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    applyThemePreference("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(mocks.setNativeTheme).toHaveBeenCalledWith("light");

    applyThemePreference("system");
    expect(mocks.setNativeTheme).toHaveBeenCalledWith(null);
  });

  it("watches and cleans up system theme changes", () => {
    const media = createMediaQuery(false);
    const onChange = vi.fn();
    const cleanup = watchSystemTheme(onChange, () => media.mediaQuery);

    media.emit(true);
    expect(onChange).toHaveBeenCalledWith("dark");

    cleanup();
    media.emit(false);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(media.mediaQuery.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });
});
