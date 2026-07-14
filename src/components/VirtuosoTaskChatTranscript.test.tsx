import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRunView } from "../lib/codexEventReducer";
import type { TaskChatEntry } from "./TaskChatTranscript";
import {
  clearTranscriptStateCache,
  TRANSCRIPT_SCROLL_IDLE_MS,
  VirtuosoTaskChatTranscript,
} from "./VirtuosoTaskChatTranscript";

const originalClientHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "clientHeight",
);
const originalClientWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "clientWidth",
);
const originalOffsetWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetWidth",
);
const originalScrollHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollHeight",
);
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
const originalScrollTo = HTMLElement.prototype.scrollTo;

const metrics = {
  clientHeight: 600,
  clientWidth: 900,
  scrollHeight: 12_000,
};

function restoreProperty(
  property: string,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(HTMLElement.prototype, property, descriptor);
  } else {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)[property];
  }
}

function historyEntry(turnIndex: number): TaskChatEntry {
  const finalMessage = `Result ${turnIndex}.`;
  return {
    clientId: `history-${turnIndex}`,
    workspaceId: 1,
    chatId: 401,
    turnIndex,
    runId: turnIndex,
    taskId: turnIndex,
    prompt: `Prompt ${turnIndex}`,
    submittedAt: "2026-07-13T10:00:00Z",
    status: "completed",
    runView: {
      ...emptyRunView,
      status: "completed",
      finalMessage,
    },
    preparedSummary: {
      kind: "html",
      html: `<p>${finalMessage}</p>`,
      sourceHash: `result-${turnIndex}`,
    },
  };
}

function latestRequest(requestId: number, transcriptVersion = "v1") {
  return {
    requestId,
    chatId: 401,
    transcriptVersion,
  };
}

function transcript() {
  return screen.getByRole("region", { name: "Task chat transcript" });
}

function maxScrollTop() {
  return metrics.scrollHeight - metrics.clientHeight;
}

describe("native task chat transcript", () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return this.classList.contains("native-transcript")
          ? metrics.clientHeight
          : (originalClientHeight?.get?.call(this) ?? 0);
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return this.classList.contains("native-transcript")
          ? metrics.clientWidth
          : (originalClientWidth?.get?.call(this) ?? 0);
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() {
        return this.classList.contains("native-transcript")
          ? metrics.clientWidth
          : (originalOffsetWidth?.get?.call(this) ?? 0);
      },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return this.classList.contains("native-transcript")
          ? metrics.scrollHeight
          : (originalScrollHeight?.get?.call(this) ?? 0);
      },
    });
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.classList.contains("native-transcript")) {
        return {
          x: 0,
          y: 0,
          width: metrics.clientWidth,
          height: metrics.clientHeight,
          top: 0,
          right: metrics.clientWidth,
          bottom: metrics.clientHeight,
          left: 0,
          toJSON: () => ({}),
        };
      }

      const entryId = this.dataset.transcriptEntryId;
      if (entryId) {
        const entryParts = entryId.split("-");
        const turnIndex = Number(entryParts[entryParts.length - 1] ?? 1);
        const scroller = this.closest<HTMLElement>(".native-transcript");
        const top = (turnIndex - 1) * 200 - (scroller?.scrollTop ?? 0);
        return {
          x: 0,
          y: top,
          width: metrics.clientWidth,
          height: 200,
          top,
          right: metrics.clientWidth,
          bottom: top + 200,
          left: 0,
          toJSON: () => ({}),
        };
      }

      return originalGetBoundingClientRect.call(this);
    };
    HTMLElement.prototype.scrollTo = function scrollTo(
      options?: ScrollToOptions | number,
      y?: number,
    ) {
      const requestedTop =
        typeof options === "number" ? (y ?? 0) : (options?.top ?? this.scrollTop);
      const maximum = Math.max(0, this.scrollHeight - this.clientHeight);
      this.scrollTop = Math.min(maximum, Math.max(0, requestedTop));
      this.dispatchEvent(new Event("scroll"));
    };
  });

  afterAll(() => {
    restoreProperty("clientHeight", originalClientHeight);
    restoreProperty("clientWidth", originalClientWidth);
    restoreProperty("offsetWidth", originalOffsetWidth);
    restoreProperty("scrollHeight", originalScrollHeight);
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    HTMLElement.prototype.scrollTo = originalScrollTo;
  });

  beforeEach(() => {
    clearTranscriptStateCache();
    metrics.clientHeight = 600;
    metrics.clientWidth = 900;
    metrics.scrollHeight = 12_000;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps every real row mounted so fast native scrolling cannot expose blanks", () => {
    const entries = Array.from({ length: 300 }, (_, index) => historyEntry(index + 1));
    const { container } = render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:401"
        transcriptVersion="v1"
        firstItemIndex={999_700}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(container.querySelectorAll(".task-chat-native-row")).toHaveLength(300);
    expect(screen.getByText("Prompt 1")).toBeInTheDocument();
    expect(screen.getByText("Prompt 300")).toBeInTheDocument();
    expect(container.querySelector(".task-chat-scroll-seek-row")).toBeNull();
    expect(container.querySelector('[data-testid="virtuoso-item-list"]')).toBeNull();
  });

  it("clips the native scroll host within a rounded chat frame", () => {
    render(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="chat:rounded-frame"
        transcriptVersion="v1"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(transcript().parentElement).toHaveClass("task-chat-scroll-frame");
  });

  it("opens an explicitly selected historical chat at the final turn", async () => {
    const request = latestRequest(1);
    const onApplied = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={Array.from({ length: 60 }, (_, index) => historyEntry(index + 1))}
        transcriptIdentity="chat:401"
        transcriptVersion="v1"
        firstItemIndex={999_940}
        openAtLatestRequest={request}
        liveFollow={false}
        onOpenAtLatestApplied={onApplied}
        onResolveRequest={vi.fn()}
      />,
    );

    await vi.waitFor(() => expect(transcript().scrollTop).toBe(maxScrollTop()));
    await vi.waitFor(() => expect(onApplied).toHaveBeenCalledWith(request));
  });

  it("lets a user gesture cancel pending latest-turn positioning", () => {
    const request = latestRequest(2);
    const onApplied = vi.fn();
    const onCancelled = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={Array.from({ length: 60 }, (_, index) => historyEntry(index + 1))}
        transcriptIdentity="chat:401"
        transcriptVersion="v1"
        viewportStable={false}
        firstItemIndex={999_940}
        openAtLatestRequest={request}
        liveFollow={false}
        onOpenAtLatestApplied={onApplied}
        onOpenAtLatestCancelled={onCancelled}
        onResolveRequest={vi.fn()}
      />,
    );

    fireEvent.wheel(transcript(), { deltaY: -900 });

    expect(onCancelled).toHaveBeenCalledWith(request);
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("keeps macOS momentum activity active across short event gaps", () => {
    vi.useFakeTimers();
    const onActivity = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={Array.from({ length: 60 }, (_, index) => historyEntry(index + 1))}
        transcriptIdentity="chat:momentum"
        transcriptVersion="v1"
        firstItemIndex={999_940}
        openAtLatestRequest={null}
        liveFollow={false}
        onScrollActivityChange={onActivity}
        onResolveRequest={vi.fn()}
      />,
    );

    fireEvent.wheel(transcript(), { deltaY: 900 });
    expect(onActivity).toHaveBeenLastCalledWith(true);

    act(() => vi.advanceTimersByTime(170));
    fireEvent.scroll(transcript());
    act(() => vi.advanceTimersByTime(170));
    expect(onActivity).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(TRANSCRIPT_SCROLL_IDLE_MS - 169));
    expect(onActivity).toHaveBeenLastCalledWith(false);
  });

  it("uses native scrollend to finish a gesture without waiting for the watchdog", () => {
    vi.useFakeTimers();
    const onActivity = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="chat:scrollend"
        transcriptVersion="v1"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow={false}
        onScrollActivityChange={onActivity}
        onResolveRequest={vi.fn()}
      />,
    );

    fireEvent.wheel(transcript(), { deltaY: 300 });
    fireEvent(transcript(), new Event("scrollend"));

    expect(onActivity.mock.calls).toEqual([[true], [false]]);
  });

  it.each([
    ["touch", (element: HTMLElement) => fireEvent.touchStart(element)],
    ["keyboard", (element: HTMLElement) => fireEvent.keyDown(element, { key: "PageDown" })],
    [
      "scrollbar",
      (element: HTMLElement) =>
        fireEvent.pointerDown(element, { clientX: 899, clientY: 300 }),
    ],
  ])("tracks %s input as native user scrolling", (_name, begin) => {
    vi.useFakeTimers();
    const onActivity = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity={`chat:${_name}`}
        transcriptVersion="v1"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow={false}
        onScrollActivityChange={onActivity}
        onResolveRequest={vi.fn()}
      />,
    );

    begin(transcript());
    expect(onActivity).toHaveBeenLastCalledWith(true);
  });

  it("does not treat a rounded scrollbar corner as a scrollbar drag", () => {
    const onActivity = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="chat:scrollbar-corner"
        transcriptVersion="v1"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow={false}
        onScrollActivityChange={onActivity}
        onResolveRequest={vi.fn()}
      />,
    );

    fireEvent.pointerDown(transcript(), { clientX: 899, clientY: 0 });

    expect(onActivity).not.toHaveBeenCalled();
  });

  it("does not classify an ordinary programmatic scroll event as user input", () => {
    const onActivity = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="chat:programmatic"
        transcriptVersion="v1"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow={false}
        onScrollActivityChange={onActivity}
        onResolveRequest={vi.fn()}
      />,
    );

    fireEvent.scroll(transcript());
    expect(onActivity).not.toHaveBeenCalled();
  });

  it("restores a native anchor on an ordinary revisit", () => {
    const entries = Array.from({ length: 60 }, (_, index) => historyEntry(index + 1));
    const first = render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:restore"
        transcriptVersion="v1"
        firstItemIndex={999_940}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    transcript().scrollTop = 2_000;
    first.unmount();

    render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:restore"
        transcriptVersion="v1"
        firstItemIndex={999_940}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(transcript().scrollTop).toBe(2_000);
  });

  it("ignores a cached position when a fresh latest-turn request is present", async () => {
    const entries = Array.from({ length: 60 }, (_, index) => historyEntry(index + 1));
    const first = render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:restore"
        transcriptVersion="v1"
        firstItemIndex={999_940}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    transcript().scrollTop = 1_000;
    first.unmount();

    render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:restore"
        transcriptVersion="v1"
        firstItemIndex={999_940}
        openAtLatestRequest={latestRequest(10)}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    await vi.waitFor(() => expect(transcript().scrollTop).toBe(maxScrollTop()));
  });

  it("stops live following after the user leaves the bottom", () => {
    const initialEntries = [historyEntry(1)];
    const { rerender } = render(
      <VirtuosoTaskChatTranscript
        entries={initialEntries}
        transcriptIdentity="chat:live"
        transcriptVersion="live"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow
        onResolveRequest={vi.fn()}
      />,
    );
    expect(transcript().scrollTop).toBe(maxScrollTop());

    transcript().scrollTop = 2_000;
    fireEvent.wheel(transcript(), { deltaY: -800 });
    fireEvent.scroll(transcript());
    metrics.scrollHeight = 13_000;
    rerender(
      <VirtuosoTaskChatTranscript
        entries={[...initialEntries, historyEntry(2)]}
        transcriptIdentity="chat:live"
        transcriptVersion="live"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow
        onResolveRequest={vi.fn()}
      />,
    );

    expect(transcript().scrollTop).toBe(2_000);
  });

  it("keeps latest-prompt editing available in the native transcript", () => {
    const onEditPrompt = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1), historyEntry(2)]}
        transcriptIdentity="chat:editing"
        transcriptVersion="v1"
        firstItemIndex={999_998}
        openAtLatestRequest={null}
        liveFollow={false}
        editablePromptEntryId="history-2"
        onEditPrompt={onEditPrompt}
        onResolveRequest={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit prompt" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit submitted prompt" }), {
      target: { value: "Updated latest prompt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run edited prompt" }));

    expect(onEditPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "history-2" }),
      "Updated latest prompt",
    );
  });
});
