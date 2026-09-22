import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ActivityRail, type NavigationPage } from "./ActivityRail";
import { NAVIGATION_STORAGE_KEY, useActivityNavigation } from "./useActivityNavigation";
import type { SidebarMode } from "../workspaces/sidebarPreferences";
function Harness({ count = 0 }: { count?: number }) {
  const [page, setPage] = useState<NavigationPage>("task"); const [mode, setMode] = useState<SidebarMode>("chats");
  const nav = useActivityNavigation({ page, mode, setPage, setMode, closeAccount: () => {} });
  return <><ActivityRail selected={nav.selected} panelOpen={nav.sidebarVisible} priorityCount={count} onSelect={nav.select} account={<button aria-label="Account" />} />
    <aside aria-label="Secondary sidebar" hidden={!nav.sidebarVisible} />
    <button onClick={() => nav.select("chats", true)}>Explicit Chats</button><button onClick={nav.toggle}>Toggle panel</button><button onClick={() => setPage("task")}>Return to workspace</button></>;
}
beforeEach(() => localStorage.clear());
describe("classic activity rail", () => {
  it("exposes all eight controls in the requested order and caps the unread badge", () => {
    render(<Harness count={120} />);
    const rail = screen.getByLabelText("Activity bar");
    expect([...rail.querySelectorAll("button")].map(button => button.getAttribute("aria-label"))).toEqual(["Chats", "Files", "Priority", "Source control", "Analytics", "Plugins", "Account", "Settings"]);
    expect(screen.getByText("99+")).toHaveAccessibleName("120 unread recently finished chats");
    expect(screen.getByRole("button", { name: "Files" })).toHaveAttribute("data-tooltip-placement", "right");
  });
  it("toggles selected panels, explicitly opens them, hides global sidebars and restores saved visibility", () => {
    const { unmount } = render(<Harness />); const panel = screen.getByLabelText("Secondary sidebar");
    const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
    click("Chats"); expect(panel).not.toBeVisible(); click("Explicit Chats"); expect(panel).toBeVisible();
    click("Files"); expect(screen.getByRole("button", { name: "Files" })).toHaveAttribute("aria-expanded", "true");
    for (const name of ["Source control", "Analytics", "Plugins", "Settings"]) { click(name); expect(panel).not.toBeVisible(); expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true"); }
    click("Return to workspace"); expect(panel).toBeVisible(); click("Toggle panel"); click("Analytics"); click("Return to workspace"); expect(panel).not.toBeVisible();
    expect(JSON.parse(localStorage.getItem(NAVIGATION_STORAGE_KEY)!)).toEqual({ panelOpen: false });
    unmount(); render(<Harness />); expect(screen.getByLabelText("Secondary sidebar")).not.toBeVisible(); expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
