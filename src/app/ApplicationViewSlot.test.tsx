import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DeferredViewSlot,
  PreloadedViewSlot,
} from "./ApplicationViewSlot";

describe("application view slots", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 0),
      ),
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((handle: number) => window.clearTimeout(handle)),
    );
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("preloads an inactive view and reveals the same DOM on activation", () => {
    const { rerender } = render(
      <PreloadedViewSlot active={false} className="settings-grid">
        <input aria-label="Preloaded setting" defaultValue="retained" />
      </PreloadedViewSlot>,
    );
    expect(
      screen.queryByRole("textbox", { name: "Preloaded setting" }),
    ).not.toBeInTheDocument();

    act(() => vi.runAllTimers());
    const preloadedInput = screen.getByRole("textbox", {
      name: "Preloaded setting",
      hidden: true,
    });
    expect(preloadedInput.parentElement).toHaveClass(
      "application-view-slot-preloaded",
    );

    rerender(
      <PreloadedViewSlot active className="settings-grid">
        <input aria-label="Preloaded setting" defaultValue="retained" />
      </PreloadedViewSlot>,
    );

    const visibleInput = screen.getByRole("textbox", {
      name: "Preloaded setting",
    });
    expect(visibleInput).toBe(preloadedInput);
    expect(visibleInput.parentElement).not.toHaveClass(
      "application-view-slot-preloaded",
    );
  });

  it("hides the previous view before deferring its expensive unmount", () => {
    const { rerender } = render(
      <DeferredViewSlot active className="codex-workspace">
        <span>Current task tree</span>
      </DeferredViewSlot>,
    );

    rerender(
      <DeferredViewSlot active={false} className="codex-workspace">
        <span>New task render that should be ignored</span>
      </DeferredViewSlot>,
    );

    const retainedTree = screen.getByText("Current task tree", {
      selector: "span",
    });
    expect(retainedTree.parentElement).toHaveClass(
      "application-view-slot-hidden",
    );
    expect(
      screen.queryByText("New task render that should be ignored"),
    ).not.toBeInTheDocument();

    act(() => vi.runAllTimers());
    expect(screen.queryByText("Current task tree")).not.toBeInTheDocument();
  });

});
