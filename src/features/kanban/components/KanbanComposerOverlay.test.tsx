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

  it("forwards unused composer wheel gestures to the board scroll region", () => {
    render(
      <div data-testid="mount">
        <div className="kanban-board-groups" data-testid="board" />
        <KanbanComposerOverlay>
          <div className="composer-panel" data-testid="composer">
            Composer
          </div>
        </KanbanComposerOverlay>
      </div>,
    );
    const board = screen.getByTestId("board");
    Object.defineProperties(board, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_200 },
    });

    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 160,
    });
    screen.getByTestId("composer").dispatchEvent(wheel);

    expect(board.scrollTop).toBe(160);
    expect(wheel.defaultPrevented).toBe(true);
  });

  it("does not hijack wheel gestures from scrollable composer content", () => {
    render(
      <div>
        <div className="kanban-board-groups" data-testid="board" />
        <KanbanComposerOverlay>
          <div
            className="composer-panel"
            data-testid="composer-scroll-region"
            style={{ overflowY: "auto" }}
          >
            Composer
          </div>
        </KanbanComposerOverlay>
      </div>,
    );
    const board = screen.getByTestId("board");
    const composer = screen.getByTestId("composer-scroll-region");
    Object.defineProperties(board, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_200 },
    });
    Object.defineProperties(composer, {
      clientHeight: { configurable: true, value: 120 },
      scrollHeight: { configurable: true, value: 360 },
    });

    composer.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: 100,
      }),
    );

    expect(board.scrollTop).toBe(0);
  });
});
