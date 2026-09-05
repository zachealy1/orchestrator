import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrchestratorTooltipLayer } from "./OrchestratorTooltipLayer";

function rect({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("OrchestratorTooltipLayer", () => {
  it("shows one branded tooltip in a viewport portal on keyboard focus", async () => {
    render(
      <>
        <button
          type="button"
          aria-label="Save changes"
          data-tooltip="Save changes"
        >
          ✓
        </button>
        <OrchestratorTooltipLayer />
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Save changes" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(
      rect({ left: 146, top: 85, width: 60, height: 60 }),
    );

    fireEvent.focusIn(trigger);

    const tooltip = await screen.findByRole("tooltip", {
      name: "Save changes",
    });
    vi.spyOn(tooltip, "getBoundingClientRect").mockReturnValue(
      rect({ left: 0, top: 0, width: 120, height: 42 }),
    );
    fireEvent(window, new Event("resize"));

    await waitFor(() => expect(tooltip).toHaveAttribute("data-visible", "true"));
    expect(tooltip.parentElement).toBe(document.body);
    expect(tooltip).toHaveClass("orchestrator-tooltip");
    expect(tooltip).toHaveAttribute("data-placement", "above");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("uses a short pointer delay and hides after activation", async () => {
    vi.useFakeTimers();
    render(
      <>
        <button type="button" aria-label="Delete" data-tooltip="Delete">
          ×
        </button>
        <OrchestratorTooltipLayer />
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Delete" });

    fireEvent.pointerOver(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });
    expect(screen.getByRole("tooltip", { name: "Delete" })).toBeInTheDocument();

    fireEvent.pointerDown(trigger);
    await act(async () => {
      vi.advanceTimersByTime(120);
      await Promise.resolve();
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
    vi.useRealTimers();
  });

  it("dismisses the active tooltip before a different action runs", async () => {
    vi.useFakeTimers();
    render(
      <>
        <button type="button" aria-label="Card actions" data-tooltip="Card actions">
          …
        </button>
        <button type="button">Open pull request</button>
        <OrchestratorTooltipLayer />
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Card actions" });
    const openPullRequest = screen.getByRole("button", {
      name: "Open pull request",
    });

    fireEvent.pointerOver(trigger);
    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });
    const tooltip = screen.getByRole("tooltip", { name: "Card actions" });

    fireEvent.pointerDown(openPullRequest);
    expect(tooltip).toHaveAttribute("data-visible", "false");
    await act(async () => {
      vi.advanceTimersByTime(120);
      await Promise.resolve();
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
    vi.useRealTimers();
  });

  it("clears tooltip state when opening another application blurs the window", async () => {
    vi.useFakeTimers();
    render(
      <>
        <button type="button" aria-label="Card actions" data-tooltip="Card actions">
          …
        </button>
        <OrchestratorTooltipLayer />
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Card actions" });

    fireEvent.pointerOver(trigger);
    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });
    expect(
      screen.getByRole("tooltip", { name: "Card actions" }),
    ).toBeInTheDocument();

    fireEvent(window, new Event("blur"));
    await act(async () => {
      vi.advanceTimersByTime(120);
      await Promise.resolve();
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(trigger).not.toHaveAttribute("aria-describedby");

    fireEvent.pointerOver(trigger);
    await act(async () => {
      vi.advanceTimersByTime(100);
      fireEvent(window, new Event("blur"));
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
    vi.useRealTimers();
  });

  it("keeps the tooltip inside the viewport and moves it below when needed", async () => {
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(
      320,
    );
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(
      240,
    );
    render(
      <>
        <button type="button" aria-label="Add item" data-tooltip="Add item">
          +
        </button>
        <OrchestratorTooltipLayer />
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Add item" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(
      rect({ left: 0, top: 4, width: 30, height: 30 }),
    );

    fireEvent.focusIn(trigger);
    const tooltip = await screen.findByRole("tooltip", { name: "Add item" });
    vi.spyOn(tooltip, "getBoundingClientRect").mockReturnValue(
      rect({ left: 0, top: 0, width: 120, height: 42 }),
    );
    fireEvent(window, new Event("resize"));

    await waitFor(() => {
      expect(tooltip).toHaveAttribute("data-placement", "below");
      expect(tooltip).toHaveStyle({ left: "8px", top: "42px" });
    });
  });

  it("keeps disabled icon-button explanations available on pointer hover", async () => {
    vi.useFakeTimers();
    render(
      <>
        <button
          type="button"
          disabled
          aria-label="Unavailable action"
          data-tooltip="Unavailable action"
        >
          ×
        </button>
        <OrchestratorTooltipLayer />
      </>,
    );

    fireEvent.pointerOver(
      screen.getByRole("button", { name: "Unavailable action" }),
    );
    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });
    expect(
      screen.getByRole("tooltip", { name: "Unavailable action" }),
    ).toBeInTheDocument();
    vi.useRealTimers();
  });
});
