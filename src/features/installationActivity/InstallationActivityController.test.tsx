import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallationActivityController } from "./InstallationActivityController";
import { InstallationActivityProvider, InstallationActivitySettings } from "./InstallationActivityProvider";

const controllers: InstallationActivityController[] = [];
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  vi.restoreAllMocks();
});

function fixture(options: { enabled?: boolean; native?: boolean } = {}) {
  let time = Date.parse("2026-09-16T23:59:59Z");
  let visible = true;
  let focused = true;
  const handlers = new Map<string, EventListener>();
  const target = {
    addEventListener: vi.fn((name: string, handler: EventListener) => handlers.set(name, handler)),
    removeEventListener: vi.fn((name: string) => handlers.delete(name)),
  } as unknown as Window;
  const page = {
    get visibilityState() { return visible ? "visible" : "hidden"; },
    hasFocus: () => focused,
  } as Document;
  const preferences = vi.fn().mockResolvedValue({ enabled: options.enabled ?? true, available: true });
  const setEnabled = vi.fn(async (enabled: boolean) => ({ enabled, available: true }));
  const record = vi.fn().mockResolvedValue(undefined);
  const controller = new InstallationActivityController({
    window: target, document: page, preferences, setEnabled, record,
    available: () => options.native ?? true, now: () => time,
  });
  controllers.push(controller);
  return {
    controller, record, preferences, setEnabled, handlers,
    time: (value: string) => { time = Date.parse(value); },
    visible: (value: boolean) => { visible = value; },
    focus: (value: boolean) => { focused = value; },
    event: (name: string, trusted = true) => handlers.get(name)?.({ isTrusted: trusted } as Event),
  };
}

async function settle() { await act(async () => { await Promise.resolve(); }); }

describe("installation activity", () => {
  it("records visible opening once across Strict Mode and repeated focus or interaction", async () => {
    const f = fixture();
    render(<StrictMode><InstallationActivityProvider controller={f.controller}>
      <InstallationActivitySettings />
    </InstallationActivityProvider></StrictMode>);
    await waitFor(() => expect(f.record).toHaveBeenCalledTimes(1));
    f.event("focus"); f.event("keydown"); f.event("pointerdown"); f.event("wheel");
    await settle();
    expect(f.preferences).toHaveBeenCalledTimes(1);
    expect(f.record).toHaveBeenCalledTimes(1);
    expect(f.record).toHaveBeenCalledWith();
  });

  it("waits for foreground user activity after midnight or sleep, including scrolling", async () => {
    const f = fixture();
    f.controller.start(); await settle();
    f.time("2026-09-17T00:00:01Z");
    await settle();
    expect(f.record).toHaveBeenCalledTimes(1);
    f.visible(false); f.event("keydown");
    f.visible(true); f.focus(false); f.event("pointerdown");
    f.focus(true); f.event("keydown", false);
    // Automatic transcript scrolling must not be classified as user activity.
    f.event("scroll");
    await settle();
    expect(f.record).toHaveBeenCalledTimes(1);
    f.event("wheel"); await settle();
    expect(f.record).toHaveBeenCalledTimes(2);
    f.time("2026-09-18T08:00:00Z"); f.event("focus"); await settle();
    expect(f.record).toHaveBeenCalledTimes(3);
  });

  it("uses UTC dates, including local offset changes and a backward clock change", async () => {
    const f = fixture();
    f.time("2026-09-17T01:00:00+02:00");
    f.controller.start(); await settle();
    f.time("2026-09-16T16:30:00-07:00"); f.event("keydown"); await settle();
    expect(f.record).toHaveBeenCalledTimes(1);
    f.time("2026-09-17T00:00:01Z"); f.event("keydown"); await settle();
    expect(f.record).toHaveBeenCalledTimes(2);
    f.time("2026-09-16T23:59:59Z"); f.event("keydown"); await settle();
    // Rust applies persistent date uniqueness even when the clock returns to a previous day.
    expect(f.record).toHaveBeenCalledTimes(3);
  });

  it("retries IPC failures on later activity without an idle timer", async () => {
    const f = fixture();
    f.record.mockRejectedValueOnce(new Error("database unavailable"));
    f.controller.start(); await settle();
    f.event("keydown"); await settle();
    expect(f.record).toHaveBeenCalledTimes(1);
    f.time("2026-09-17T00:00:01Z"); f.event("keydown"); await settle();
    expect(f.record).toHaveBeenCalledTimes(2);
  });

  it("keeps browser previews silent and removes listeners on stop", async () => {
    const preview = fixture({ native: false });
    preview.controller.start(); await settle();
    expect(preview.preferences).not.toHaveBeenCalled();
    expect(preview.record).not.toHaveBeenCalled();
    const f = fixture();
    f.controller.start(); await settle();
    f.controller.stop();
    expect(f.handlers.size).toBe(0);
    f.time("2026-09-17T00:00:01Z"); f.event("focus");
    expect(f.record).toHaveBeenCalledTimes(1);
  });

  it("supports a persistent opt-out toggle and current-day-only re-enabling", async () => {
    const f = fixture({ enabled: false });
    render(<InstallationActivityProvider controller={f.controller}>
      <InstallationActivitySettings />
    </InstallationActivityProvider>);
    const checkbox = screen.getByRole("checkbox", { name: "Share installation activity" });
    await waitFor(() => expect(checkbox).toBeEnabled());
    expect(checkbox).not.toBeChecked();
    expect(f.record).not.toHaveBeenCalled();
    fireEvent.click(checkbox);
    await waitFor(() => expect(f.record).toHaveBeenCalledTimes(1));
    expect(f.setEnabled).toHaveBeenCalledWith(true);
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).not.toBeChecked());
    f.time("2026-09-17T09:00:00Z"); f.event("focus");
    expect(f.record).toHaveBeenCalledTimes(1);
    fireEvent.click(checkbox);
    await waitFor(() => expect(f.record).toHaveBeenCalledTimes(2));
  });

  it("reports a failed preference write without pretending the opt-out was saved", async () => {
    const f = fixture();
    f.setEnabled.mockRejectedValueOnce(new Error("disk unavailable"));
    render(<InstallationActivityProvider controller={f.controller}>
      <InstallationActivitySettings />
    </InstallationActivityProvider>);
    const checkbox = screen.getByRole("checkbox", { name: "Share installation activity" });
    await waitFor(() => expect(checkbox).toBeEnabled());
    fireEvent.click(checkbox);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
    expect(checkbox).toBeChecked();
  });
});
