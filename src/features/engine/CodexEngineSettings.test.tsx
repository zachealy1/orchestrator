import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CodexEngineSettings, type EngineSettings } from "./CodexEngineSettings";
function props(): EngineSettings {
  return { controller: { status: { source: "managed", installedVersion: "0.153.4", latestVersion: "0.154.0", pendingVersion: null, updateAvailable: true, lastCheckedAt: null, message: null }, busy: false, error: null, announcement: null, dismissAnnouncement: vi.fn(), check: vi.fn(), install: vi.fn() }, refreshModels: vi.fn(), modelsRefreshing: false, modelsNotice: null, canRefreshModels: true };
}
it("offers independent engine and model checks and explains staged activation", () => {
  const p = props(); const { rerender } = render(<CodexEngineSettings {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "Check for updates" })); expect(p.controller.check).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Refresh models" })); expect(p.refreshModels).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Prepare update" })); expect(p.controller.install).toHaveBeenCalled();
  p.controller.status!.pendingVersion = "0.154.0"; rerender(<CodexEngineSettings {...p} />);
  expect(screen.getByText(/next time you launch Orchestrator/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Prepare update" })).toBeNull();
});
it("preserves explicit overrides", () => {
  const p = props(); p.controller.status!.source = "override";
  render(<CodexEngineSettings {...p} />);
  expect(screen.getByText(/Update that installation separately/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Prepare update" })).toBeNull();
});
