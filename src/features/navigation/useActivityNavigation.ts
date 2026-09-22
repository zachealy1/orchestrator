import { useEffect, useState } from "react";
import type { SidebarMode } from "../workspaces/sidebarPreferences";
import type { ActivityDestination, NavigationPage } from "./ActivityRail";

export const NAVIGATION_STORAGE_KEY = "orchestrator.navigation.v1";
export function readSidebarVisibility() {
  try { return JSON.parse(localStorage.getItem(NAVIGATION_STORAGE_KEY) ?? "null")?.panelOpen !== false; }
  catch { return true; }
}
export function useActivityNavigation({ page, mode, setPage, setMode, closeAccount }: {
  page: NavigationPage; mode: SidebarMode;
  setPage: (page: NavigationPage) => void; setMode: (mode: SidebarMode) => void;
  closeAccount: () => void;
}) {
  const [panelOpen, setPanelOpen] = useState(readSidebarVisibility);
  useEffect(() => {
    try { localStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify({ panelOpen })); } catch { /* Retain session state. */ }
  }, [panelOpen]);
  const selected: ActivityDestination = page === "task" ? mode : page;
  function select(destination: ActivityDestination, explicitlyOpen = false) {
    closeAccount();
    if (destination === "chats" || destination === "files" || destination === "priority") {
      setPanelOpen(explicitlyOpen || page !== "task" || mode !== destination ? true : !panelOpen);
      setMode(destination);
      setPage("task");
    } else setPage(destination);
  }
  return { selected, panelOpen, sidebarVisible: page === "task" && panelOpen, select,
    toggle: () => { if (page === "task") setPanelOpen(value => !value); },
  };
}
