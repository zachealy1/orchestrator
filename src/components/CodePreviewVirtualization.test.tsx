import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodePreview } from "./CodePreview";

const mocks = vi.hoisted(() => ({
  measure: vi.fn(),
  measureElement: vi.fn(),
  scrollToIndex: vi.fn(),
  scrollToOffset: vi.fn(),
  totalSize: 137,
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getTotalSize: () => mocks.totalSize,
    getVirtualItems: () => [
      { index: 0, key: "first", start: 12, size: 20 },
    ],
    measure: mocks.measure,
    measureElement: mocks.measureElement,
    scrollToIndex: mocks.scrollToIndex,
    scrollToOffset: mocks.scrollToOffset,
  }),
}));

vi.mock("../lib/codePreview", () => ({
  codePreviewTheme: () => "github-light",
  detectPreviewLanguage: () => "plaintext",
}));

vi.mock("../runtime/AppServices", () => ({
  useAppServices: () => ({
    codePreviewHighlighting: {
      highlight: vi.fn(),
    },
  }),
}));

describe("CodePreview virtual height", () => {
  let resizeCallback: ResizeObserverCallback | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    resizeCallback = null;
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
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the virtualizer's measured total without restoring an inflated estimate", () => {
    const content = Array.from(
      { length: 1_000 },
      (_, index) => `line ${index + 1}`,
    ).join("\n");
    const { container } = render(
      <CodePreview
        path="/repo/large.txt"
        content={content}
        resolvedTheme="light"
        truncated={false}
      />,
    );

    expect(container.querySelector(".code-preview-virtualizer")).toHaveStyle({
      height: "137px",
    });
    expect(mocks.measure).toHaveBeenCalled();
  });

  it("remeasures wrapped rows on width changes and restores the visible row anchor", () => {
    render(
      <CodePreview
        path="/repo/wrapped.txt"
        content={"a very long wrapped line\nsecond line"}
        resolvedTheme="light"
        truncated={false}
      />,
    );
    const scrollElement = screen.getByLabelText("Highlighted file preview");
    Object.defineProperty(scrollElement, "clientWidth", {
      configurable: true,
      value: 500,
    });
    scrollElement.scrollTop = 15;

    act(() => {
      resizeCallback?.(
        [{ contentRect: { width: 500 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });

    expect(mocks.measure).toHaveBeenCalledTimes(2);
    expect(mocks.scrollToIndex).toHaveBeenCalledWith(0, { align: "start" });
    expect(mocks.scrollToOffset).toHaveBeenCalledWith(15);
  });

  it("does not restore an old resize anchor after another file is selected", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { rerender } = render(
      <CodePreview
        path="/repo/old.txt"
        content={"old wrapped line\nold second line"}
        resolvedTheme="light"
        truncated={false}
      />,
    );
    const scrollElement = screen.getByLabelText("Highlighted file preview");
    scrollElement.scrollTop = 15;

    act(() => {
      resizeCallback?.(
        [{ contentRect: { width: 500 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });
    expect(frames).toHaveLength(1);

    rerender(
      <CodePreview
        path="/repo/new.txt"
        content="new first line"
        resolvedTheme="light"
        truncated={false}
      />,
    );
    expect(scrollElement.scrollTop).toBe(0);
    act(() => frames.shift()?.(0));

    expect(mocks.scrollToIndex).not.toHaveBeenCalled();
    expect(mocks.scrollToOffset).not.toHaveBeenCalled();
    expect(scrollElement.scrollTop).toBe(0);
  });
});
