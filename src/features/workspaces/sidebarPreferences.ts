export type SidebarMode = "chats" | "files" | "priority";
export const SIDEBAR_STORAGE_KEY = "orchestrator.sidebar.v1";
export type SidebarPreferences = {
  mode: SidebarMode;
  chats: number[];
  files: number[];
  directories: string[];
};
export function readSidebarPreferences(): SidebarPreferences {
  const defaults: SidebarPreferences = {
    mode: "chats",
    chats: [],
    files: [],
    directories: [],
  };
  try {
    const value = JSON.parse(
      localStorage.getItem(SIDEBAR_STORAGE_KEY) ?? "null",
    );
    if (!value || typeof value !== "object") return defaults;
    const ids = (v: unknown) =>
      Array.isArray(v)
        ? v.filter((id): id is number => Number.isSafeInteger(id) && id > 0)
        : [];
    return {
      mode: ["chats", "files", "priority"].includes(value.mode)
        ? value.mode
        : "chats",
      chats: ids(value.chats),
      files: ids(value.files),
      directories: Array.isArray(value.directories)
        ? value.directories.filter((path: unknown) => typeof path === "string")
        : [],
    };
  } catch {
    return defaults;
  }
}
export function persistSidebarPreferences(value: SidebarPreferences) {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* Keep session state when storage is unavailable. */
  }
}
