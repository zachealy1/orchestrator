import { render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRunView } from "../lib/codexEventReducer";
import { clearTranscriptMeasurementCache } from "../lib/transcriptVirtualization";
import type { TaskChatEntry } from "./TaskChatTranscript";

let transcriptModule: typeof import("./VirtuosoTaskChatTranscript");

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
const originalOffsetHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetHeight",
);
const originalOffsetWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetWidth",
);
const originalClientHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "clientHeight",
);
const originalClientWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "clientWidth",
);
const originalOffsetParent = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetParent",
);
const originalScrollTo = HTMLElement.prototype.scrollTo;
const originalGetComputedStyle = window.getComputedStyle;

function restoreHTMLElementProperty(
  property: string,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(HTMLElement.prototype, property, descriptor);
    return;
  }
  delete (HTMLElement.prototype as unknown as Record<string, unknown>)[property];
}

function entry(turnIndex: number): TaskChatEntry {
  return {
    clientId: `integration-${turnIndex}`,
    workspaceId: 1,
    chatId: 901,
    turnIndex,
    runId: turnIndex,
    taskId: turnIndex,
    prompt: `Prompt ${turnIndex}`,
    submittedAt: "2026-07-13T10:00:00Z",
    status: "completed",
    runView: {
      ...emptyRunView,
      status: "completed",
      finalMessage:
        turnIndex % 7 === 0
          ? `Detailed result ${turnIndex}.\n\n${"More context. ".repeat(80)}`
          : `Result ${turnIndex}.`,
    },
  };
}

describe("VirtuosoTaskChatTranscript with real Virtuoso", () => {
  beforeAll(async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        private callback: ResizeObserverCallback;

        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }

        observe(element: Element) {
          queueMicrotask(() => {
            this.callback(
              [
                {
                  target: element,
                  contentRect: element.getBoundingClientRect(),
                  borderBoxSize: [
                    {
                      blockSize: element.getBoundingClientRect().height,
                      inlineSize: element.getBoundingClientRect().width,
                    },
                  ],
                } as unknown as ResizeObserverEntry,
              ],
              this as unknown as ResizeObserver,
            );
          });
        }

        unobserve() {}

        disconnect() {}
      },
    );

    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      const row = this.closest?.(".task-chat-virtuoso-row");
      const detailed = row?.textContent?.includes("More context") ?? false;
      const height = row ? (detailed ? 720 : 220) : 600;
      return {
        x: 0,
        y: 0,
        width: 900,
        height,
        top: 0,
        right: 900,
        bottom: height,
        left: 0,
        toJSON: () => ({}),
      };
    };
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return this.getBoundingClientRect().height;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() {
        return this.getBoundingClientRect().width;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return this.getBoundingClientRect().height;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return this.getBoundingClientRect().width;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetParent", {
      configurable: true,
      get() {
        return this.parentElement;
      },
    });
    HTMLElement.prototype.scrollTo = function scrollTo(
      options?: ScrollToOptions | number,
      y?: number,
    ) {
      this.scrollTop =
        typeof options === "number" ? (y ?? 0) : (options?.top ?? this.scrollTop);
      this.dispatchEvent(new Event("scroll"));
    };
    window.getComputedStyle = ((element: Element) => {
      const style = originalGetComputedStyle(element);
      Object.defineProperty(style, "rowGap", {
        configurable: true,
        value: style.rowGap || "0px",
      });
      Object.defineProperty(style, "columnGap", {
        configurable: true,
        value: style.columnGap || "0px",
      });
      return style;
    }) as typeof window.getComputedStyle;
    transcriptModule = await import("./VirtuosoTaskChatTranscript");
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    restoreHTMLElementProperty("offsetHeight", originalOffsetHeight);
    restoreHTMLElementProperty("offsetWidth", originalOffsetWidth);
    restoreHTMLElementProperty("clientHeight", originalClientHeight);
    restoreHTMLElementProperty("clientWidth", originalClientWidth);
    restoreHTMLElementProperty("offsetParent", originalOffsetParent);
    HTMLElement.prototype.scrollTo = originalScrollTo;
    window.getComputedStyle = originalGetComputedStyle;
  });

  beforeEach(() => {
    transcriptModule.clearTranscriptStateCache();
    clearTranscriptMeasurementCache();
  });

  it("keeps a 300-turn variable-height chat bounded with the real virtualizer", async () => {
    const { VirtuosoTaskChatTranscript } = transcriptModule;
    render(
      <div style={{ width: 900, height: 600 }}>
        <VirtuosoTaskChatTranscript
          entries={Array.from({ length: 300 }, (_, index) => entry(index + 1))}
          transcriptIdentity="chat:real-virtuoso"
          transcriptVersion="v1"
          viewportWidth={900}
          firstItemIndex={999_700}
          openAtLatestRequestId={null}
          liveFollow={false}
          onResolveRequest={vi.fn()}
        />
      </div>,
    );

    expect(await screen.findByText("Prompt 1")).toBeInTheDocument();
    await waitFor(() => {
      const mountedRows = document.querySelectorAll(".task-chat-virtuoso-row");
      expect(mountedRows.length).toBeGreaterThan(0);
      expect(mountedRows.length).toBeLessThan(80);
    });
    expect(screen.queryByText("Prompt 300")).not.toBeInTheDocument();
  });
});
