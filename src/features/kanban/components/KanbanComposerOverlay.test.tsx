import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanComposerOverlay } from "./KanbanComposerOverlay";

describe("KanbanComposerOverlay", () => {
  let measuredHeight = 180;
  let resizeCallback: ResizeObserverCallback | null = null;
  let animationFrames: FrameRequestCallback[] = [];

  beforeEach(() => {
    measuredHeight = 180;
    resizeCallback = null;
    animationFrames = [];

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function () {
        return {
          x: 0,
          y: 0,
          top: 0,
          right: 1000,
          bottom: measuredHeight,
          left: 0,
          width: 1000,
          height: measuredHeight,
          toJSON: () => ({}),
        };
      },
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }

        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function flushAnimationFrame() {
    const callbacks = animationFrames;
    animationFrames = [];
    callbacks.forEach((callback) => callback(0));
  }

  it("publishes composer height changes as board scroll clearance", () => {
    const { unmount } = render(
      <div data-testid="mount">
        <KanbanComposerOverlay>
          <div className="composer-panel">Composer</div>
        </KanbanComposerOverlay>
      </div>,
    );
    const mount = screen.getByTestId("mount");

    act(flushAnimationFrame);
    expect(mount.style.getPropertyValue("--kanban-composer-clearance")).toBe(
      "180px",
    );

    measuredHeight = 264;
    act(() => {
      resizeCallback?.([], {} as ResizeObserver);
      flushAnimationFrame();
    });
    expect(mount.style.getPropertyValue("--kanban-composer-clearance")).toBe(
      "264px",
    );

    unmount();
    expect(mount.style.getPropertyValue("--kanban-composer-clearance")).toBe(
      "",
    );
  });
});
