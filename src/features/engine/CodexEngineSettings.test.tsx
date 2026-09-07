import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CodexEngineSettings, type EngineSettings } from "./CodexEngineSettings";

function props(): EngineSettings {
  return {
    controller: {
      status: { source: "managed", installedVersion: "0.153.4", message: null },
      busy: false, error: null, retry: vi.fn(),
    },
    refreshModels: vi.fn(), modelsRefreshing: false, modelsNotice: null, canRefreshModels: true,
  };
}

it("keeps engine information and model refresh without update controls", () => {
  const p = props();
  render(<CodexEngineSettings {...p} />);
  expect(screen.getByText("Version 0.153.4 · Managed by Orchestrator")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /update/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/last checked|next time you launch|update available/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry engine setup" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh models" }));
  expect(p.refreshModels).toHaveBeenCalledTimes(1);
});

it("shows custom installations without update controls", () => {
  const p = props();
  p.controller.status!.source = "override";
  render(<CodexEngineSettings {...p} />);
  expect(screen.getByText("Version 0.153.4 · Custom installation")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /update/i })).not.toBeInTheDocument();
});

it("supports retrying initial setup after a failure", () => {
  const p = props();
  p.controller.status = { source: "unavailable", installedVersion: null, message: "Offline" };
  const { rerender } = render(<CodexEngineSettings {...p} />);
  expect(screen.getByRole("status")).toHaveTextContent("Offline");
  fireEvent.click(screen.getByRole("button", { name: "Retry engine setup" }));
  expect(p.controller.retry).toHaveBeenCalledTimes(1);
  p.controller.busy = true;
  rerender(<CodexEngineSettings {...p} />);
  expect(screen.getByText("Preparing the Codex engine…")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry engine setup" })).not.toBeInTheDocument();
});

it("preserves model refresh availability and feedback", () => {
  const p = props();
  p.canRefreshModels = false;
  const { rerender } = render(<CodexEngineSettings {...p} />);
  expect(screen.getByRole("button", { name: "Refresh models" })).toBeDisabled();
  p.canRefreshModels = true;
  p.modelsRefreshing = true;
  p.modelsNotice = "Showing the last available models.";
  rerender(<CodexEngineSettings {...p} />);
  expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent(p.modelsNotice);
});
