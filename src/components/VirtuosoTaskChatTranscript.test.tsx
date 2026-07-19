import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRunView } from "../lib/codexEventReducer";
import {
  clearTranscriptMeasurementCache,
  getCachedTranscriptRowHeight,
} from "../lib/transcriptVirtualization";
import type { TaskChatEntry } from "./TaskChatTranscript";
import {
  clearTranscriptStateCache,
  TRANSCRIPT_MIN_OVERSCAN_ITEMS,
  TRANSCRIPT_RENDER_AHEAD_PX,
  TRANSCRIPT_SCROLL_IDLE_MS,
  VirtuosoTaskChatTranscript,
} from "./VirtuosoTaskChatTranscript";

const virtuosoMock = vi.hoisted(() => ({
  lastProps: null as any,
  state: { ranges: [{ startIndex: 292, endIndex: 299 }], scrollTop: 42 },
  scrollBy: vi.fn(),
  scrollToIndex: vi.fn(),
}));

vi.mock("react-virtuoso", async () => {
  const React = await import("react");
  return {
    Virtuoso: React.forwardRef(function MockVirtuoso(props: any, ref) {
      virtuosoMock.lastProps = props;
      const viewportRef = React.useRef<HTMLDivElement | null>(null);
      React.useImperativeHandle(ref, () => ({
        getState: (callback: (state: unknown) => void) =>
          callback(virtuosoMock.state),
        scrollBy: virtuosoMock.scrollBy,
        scrollToIndex: virtuosoMock.scrollToIndex,
      }));
      React.useEffect(() => {
        props.scrollerRef?.(viewportRef.current);
        return () => props.scrollerRef?.(null);
      }, [props.scrollerRef]);

      const data = props.data ?? [];
      const startIndex = Math.max(0, data.length - 8);
      return (
        <div
          aria-label={props["aria-label"]}
          className={props.className}
          data-testid="virtuoso-viewport"
          ref={viewportRef}
          role={props.role}
          tabIndex={props.tabIndex}
        >
          <div data-testid="virtuoso-item-list">
            {data.slice(startIndex).map((entry: TaskChatEntry, offset: number) => {
              const index = startIndex + offset;
              return (
                <div key={props.computeItemKey(index, entry)}>
                  {props.itemContent(index, entry)}
                </div>
              );
            })}
          </div>
        </div>
      );
    }),
  };
});

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

function runningEntry(turnIndex: number, text = "Working..."): TaskChatEntry {
  const entry = historyEntry(turnIndex);
  return {
    ...entry,
    status: "running",
    runView: {
      ...entry.runView,
      status: "running",
      finalMessage: "",
      streamEvents: [
        {
          id: `stream-${turnIndex}`,
          kind: "message",
          text,
          timestamp: "2026-07-19T10:00:00Z",
        },
      ],
    },
    preparedSummary: undefined,
  };
}

function planHistoryEntry(turnIndex: number): TaskChatEntry {
  const entry = historyEntry(turnIndex);
  return {
    ...entry,
    runView: {
      ...entry.runView,
      nativePlan: {
        ...entry.runView.nativePlan,
        intent: "plan",
        mode: "plan",
        planItemId: `plan-${turnIndex}`,
        completedTurnId: `turn-${turnIndex}`,
        completedText: [
          "# Plan",
          "",
          "Overview of the implementation.",
          "",
          "## Step one",
          "",
          "Complete the first step.",
          "",
          "## Step two",
          "",
          "Complete the second step.",
          "",
          "## Step three",
          "",
          "Complete the third step.",
        ].join("\n"),
        reviewState: "available",
      },
    },
  };
}

function latestRequest(requestId: number, transcriptVersion = "v1") {
  return { requestId, chatId: 401, transcriptVersion };
}

function transcript() {
  return screen.getByRole("region", { name: "Task chat transcript" });
}

function configureScrollerGeometry(element: HTMLElement) {
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: 900 },
    offsetWidth: { configurable: true, value: 915 },
  });
  element.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 915,
    height: 600,
    top: 0,
    right: 915,
    bottom: 600,
    left: 0,
    toJSON: () => ({}),
  });
}

function reportLatestTurnVisible(entryCount: number, firstItemIndex: number) {
  act(() => {
    virtuosoMock.lastProps.rangeChanged({
      startIndex: firstItemIndex + Math.max(0, entryCount - 8),
      endIndex: firstItemIndex + entryCount - 1,
    });
    virtuosoMock.lastProps.atBottomStateChange(true);
  });
}

describe("VirtuosoTaskChatTranscript", () => {
  beforeEach(() => {
    clearTranscriptStateCache();
    clearTranscriptMeasurementCache();
    virtuosoMock.lastProps = null;
    virtuosoMock.scrollBy.mockClear();
    virtuosoMock.scrollToIndex.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a 300-turn transcript in the virtual model while mounting bounded rows", () => {
    const entries = Array.from({ length: 300 }, (_, index) => historyEntry(index + 1));
    const { container } = render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:401"
        transcriptVersion="v1"
        firstItemIndex={999_700}
        openAtLatestRequest={latestRequest(1)}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(virtuosoMock.lastProps.data).toHaveLength(300);
    expect(virtuosoMock.lastProps.firstItemIndex).toBe(999_700);
    expect(container.querySelectorAll(".task-chat-virtuoso-row")).toHaveLength(8);
    expect(screen.getByText("Prompt 300")).toBeInTheDocument();
    expect(screen.queryByText("Prompt 1")).not.toBeInTheDocument();
  });

  it("resolves rows from the stable transcript when Virtuoso data briefly lags geometry", () => {
    const entries = [historyEntry(1), historyEntry(2), historyEntry(3)];
    render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:401"
        transcriptVersion="v1"
        firstItemIndex={999_997}
        openAtLatestRequest={latestRequest(1)}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(
      virtuosoMock.lastProps.computeItemKey(999_999, undefined),
    ).toBe(entries[2]?.clientId);
    const recoveredRow = virtuosoMock.lastProps.itemContent(2, undefined);
    expect(recoveredRow.props.entry).toBe(entries[2]);
  });

  it("renders well ahead of a fast macOS trackpad viewport", () => {
    render(
      <VirtuosoTaskChatTranscript
        entries={Array.from({ length: 300 }, (_, index) => historyEntry(index + 1))}
        transcriptIdentity="chat:render-ahead"
        transcriptVersion="v1"
        firstItemIndex={999_700}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(virtuosoMock.lastProps.increaseViewportBy).toEqual({
      top: TRANSCRIPT_RENDER_AHEAD_PX,
      bottom: TRANSCRIPT_RENDER_AHEAD_PX,
    });
    expect(TRANSCRIPT_RENDER_AHEAD_PX).toBe(3_200);
    expect(virtuosoMock.lastProps.minOverscanItemCount).toEqual({
      top: TRANSCRIPT_MIN_OVERSCAN_ITEMS,
      bottom: TRANSCRIPT_MIN_OVERSCAN_ITEMS,
    });
    expect(TRANSCRIPT_MIN_OVERSCAN_ITEMS).toBe(8);
  });

  it("keeps real prepared turns mounted during high-speed scrolling", () => {
    const entries = [
      historyEntry(1),
      {
        ...historyEntry(2),
        runView: {
          ...historyEntry(2).runView,
          finalMessage: "Long response. ".repeat(300),
        },
      },
    ];
    render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:seek"
        transcriptVersion="v1"
        firstItemIndex={999_998}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(screen.getByText("Prompt 2")).toBeInTheDocument();
    expect(virtuosoMock.lastProps.scrollSeekConfiguration).toBeUndefined();
    expect(virtuosoMock.lastProps.components).toBeUndefined();
  });

  it("preserves expanded plan state when a virtualized row unmounts", () => {
    const planEntry = planHistoryEntry(1);
    const baseEntries = [planEntry];
    const commonProps = {
      transcriptIdentity: "chat:plan-disclosure",
      transcriptVersion: "v1",
      firstItemIndex: 999_999,
      openAtLatestRequest: null,
      liveFollow: false,
      onResolveRequest: vi.fn(),
    };
    const { rerender } = render(
      <VirtuosoTaskChatTranscript entries={baseEntries} {...commonProps} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show full plan" }));
    expect(
      screen.getByRole("button", { name: "Hide full plan" }),
    ).toHaveAttribute("aria-expanded", "true");

    const entriesWithNewerTurns = [
      planEntry,
      ...Array.from({ length: 10 }, (_, index) => historyEntry(index + 2)),
    ];
    rerender(
      <VirtuosoTaskChatTranscript
        entries={entriesWithNewerTurns}
        {...commonProps}
      />,
    );
    expect(screen.queryByLabelText("Codex plan")).not.toBeInTheDocument();

    rerender(
      <VirtuosoTaskChatTranscript entries={baseEntries} {...commonProps} />,
    );
    expect(
      screen.getByRole("button", { name: "Hide full plan" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses a revised plan even when Codex reuses its plan identifiers", () => {
    const entry = planHistoryEntry(1);
    const commonProps = {
      transcriptIdentity: "chat:plan-revision",
      transcriptVersion: "v1",
      firstItemIndex: 999_999,
      openAtLatestRequest: null,
      liveFollow: false,
      onResolveRequest: vi.fn(),
    };
    const { rerender } = render(
      <VirtuosoTaskChatTranscript entries={[entry]} {...commonProps} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show full plan" }));
    expect(
      screen.getByRole("button", { name: "Hide full plan" }),
    ).toHaveAttribute("aria-expanded", "true");

    const revisedEntry = {
      ...entry,
      runView: {
        ...entry.runView,
        nativePlan: {
          ...entry.runView.nativePlan,
          completedText: `${entry.runView.nativePlan.completedText}\n\n## Revised scope\n\nAdd a rollback step.`,
        },
      },
    };
    rerender(
      <VirtuosoTaskChatTranscript entries={[revisedEntry]} {...commonProps} />,
    );

    expect(
      screen.getByRole("button", { name: "Show full plan" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("corrects disclosure layout movement through Virtuoso scrollBy", async () => {
    render(
      <VirtuosoTaskChatTranscript
        entries={[planHistoryEntry(1)]}
        transcriptIdentity="chat:plan-anchor"
        transcriptVersion="v1"
        firstItemIndex={999_999}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    const card = screen.getByLabelText("Codex plan");
    const toggle = screen.getByRole("button", { name: "Show full plan" });
    card.getBoundingClientRect = () => {
      const top = toggle.getAttribute("aria-expanded") === "true" ? 124 : 100;
      return {
        x: 0,
        y: top,
        width: 700,
        height: 320,
        top,
        right: 700,
        bottom: top + 320,
        left: 0,
        toJSON: () => ({}),
      };
    };

    fireEvent.click(toggle);
    await act(
      () =>
        new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
          });
        }),
    );

    expect(virtuosoMock.scrollBy).toHaveBeenCalledWith({
      top: 24,
      behavior: "auto",
    });
  });

  it("provides stable content-aware geometry for every turn", () => {
    const short = historyEntry(1);
    const long = {
      ...historyEntry(2),
      runView: {
        ...historyEntry(2).runView,
        finalMessage: "Long historical response. ".repeat(400),
      },
    };
    render(
      <VirtuosoTaskChatTranscript
        entries={[short, long]}
        transcriptIdentity="chat:height-estimates"
        transcriptVersion="v1"
        viewportWidth={720}
        firstItemIndex={999_998}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(virtuosoMock.lastProps.heightEstimates).toHaveLength(2);
    expect(virtuosoMock.lastProps.heightEstimates[1]).toBeGreaterThan(
      virtuosoMock.lastProps.heightEstimates[0],
    );
  });

  it("does not persist virtual model estimates as exact row measurements", () => {
    const entry = historyEntry(1);
    render(
      <VirtuosoTaskChatTranscript
        entries={[entry]}
        transcriptIdentity="chat:deferred-measurement"
        transcriptVersion="v1"
        viewportWidth={640}
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(virtuosoMock.lastProps.itemsRendered).toBeUndefined();
    expect(
      getCachedTranscriptRowHeight(
        entry,
        640,
        "chat:deferred-measurement:v1",
      ),
    ).toBeUndefined();
  });

  it("keeps macOS momentum active across short event gaps", () => {
    vi.useFakeTimers();
    const onActivity = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="chat:momentum"
        transcriptVersion="v1"
        firstItemIndex={1_000_000}
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

  it("keeps a compositor-safe fallback visible for the full momentum gesture", () => {
    vi.useFakeTimers();
    render(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="chat:scroll-fallback"
        transcriptVersion="v1"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow={false}
        onScrollActivityChange={vi.fn()}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(transcript()).not.toHaveClass("is-scroll-active");
    fireEvent.wheel(transcript(), { deltaY: 1_800 });
    expect(transcript()).toHaveClass("is-scroll-active");

    act(() => vi.advanceTimersByTime(TRANSCRIPT_SCROLL_IDLE_MS));
    expect(transcript()).not.toHaveClass("is-scroll-active");
  });

  it("keeps rapid direction reversals in one momentum session", () => {
    vi.useFakeTimers();
    const onActivity = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="chat:direction-reversal"
        transcriptVersion="v1"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow={false}
        onScrollActivityChange={onActivity}
        onResolveRequest={vi.fn()}
      />,
    );

    fireEvent.wheel(transcript(), { deltaY: 1_800 });
    act(() => vi.advanceTimersByTime(90));
    fireEvent.scroll(transcript());
    fireEvent.wheel(transcript(), { deltaY: -1_800 });
    act(() => vi.advanceTimersByTime(90));
    fireEvent.scroll(transcript());

    expect(onActivity.mock.calls).toEqual([[true]]);
    act(() => vi.advanceTimersByTime(TRANSCRIPT_SCROLL_IDLE_MS));
    expect(onActivity.mock.calls).toEqual([[true], [false]]);
  });

  it("keeps native scrollend inside the macOS momentum idle window", () => {
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
    expect(onActivity.mock.calls).toEqual([[true]]);
    act(() => vi.advanceTimersByTime(TRANSCRIPT_SCROLL_IDLE_MS - 1));
    expect(onActivity.mock.calls).toEqual([[true]]);
    act(() => vi.advanceTimersByTime(1));
    expect(onActivity.mock.calls).toEqual([[true], [false]]);
  });

  it.each([
    ["touch", (element: HTMLElement) => fireEvent.touchStart(element)],
    ["keyboard", (element: HTMLElement) => fireEvent.keyDown(element, { key: "PageDown" })],
  ])("tracks %s gestures as user scrolling", (_name, begin) => {
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

  it("tracks scrollbar drags but ignores the rounded corner", () => {
    const onActivity = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="chat:scrollbar"
        transcriptVersion="v1"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow={false}
        onScrollActivityChange={onActivity}
        onResolveRequest={vi.fn()}
      />,
    );
    configureScrollerGeometry(transcript());

    fireEvent.pointerDown(transcript(), { clientX: 914, clientY: 0 });
    expect(onActivity).not.toHaveBeenCalled();
    fireEvent.pointerDown(transcript(), { clientX: 914, clientY: 300 });
    expect(onActivity).toHaveBeenLastCalledWith(true);
  });

  it("releases scrollbar activity after a cancelled native pointer gesture", () => {
    vi.useFakeTimers();
    const onActivity = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="chat:pointer-cancel"
        transcriptVersion="v1"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow={false}
        onScrollActivityChange={onActivity}
        onResolveRequest={vi.fn()}
      />,
    );
    configureScrollerGeometry(transcript());

    fireEvent.pointerDown(transcript(), { clientX: 914, clientY: 300 });
    expect(onActivity).toHaveBeenLastCalledWith(true);
    fireEvent.pointerCancel(window);
    act(() => vi.advanceTimersByTime(TRANSCRIPT_SCROLL_IDLE_MS));
    expect(onActivity).toHaveBeenLastCalledWith(false);
  });

  it("does not report Virtuoso's programmatic scrolling as user activity", () => {
    const onActivity = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="chat:window-blur"
        transcriptVersion="v1"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow={false}
        onScrollActivityChange={onActivity}
        onResolveRequest={vi.fn()}
      />,
    );

    act(() => virtuosoMock.lastProps.isScrolling(true));
    expect(onActivity).not.toHaveBeenCalled();
    expect(transcript()).toHaveClass("is-scroll-active");
    act(() => virtuosoMock.lastProps.isScrolling(false));
    expect(transcript()).not.toHaveClass("is-scroll-active");
  });

  it("cannot leave user scroll activity latched when the WebView loses focus", () => {
    const onActivity = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="chat:window-blur"
        transcriptVersion="v1"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow={false}
        onScrollActivityChange={onActivity}
        onResolveRequest={vi.fn()}
      />,
    );

    fireEvent.wheel(transcript(), { deltaY: 600 });
    expect(onActivity).toHaveBeenLastCalledWith(true);
    fireEvent.blur(window);
    expect(onActivity).toHaveBeenLastCalledWith(false);
  });

  it("opens an explicitly selected historical chat at its latest turn", async () => {
    const entries = Array.from({ length: 60 }, (_, index) => historyEntry(index + 1));
    const request = latestRequest(21);
    const onApplied = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:latest"
        transcriptVersion="v1"
        firstItemIndex={999_940}
        openAtLatestRequest={request}
        liveFollow={false}
        onOpenAtLatestApplied={onApplied}
        onResolveRequest={vi.fn()}
      />,
    );

    await vi.waitFor(() =>
      expect(virtuosoMock.scrollToIndex).toHaveBeenCalledWith({
        index: "LAST",
        align: "end",
        behavior: "auto",
      }),
    );
    expect(onApplied).not.toHaveBeenCalled();
    reportLatestTurnVisible(entries.length, 999_940);
    expect(onApplied).toHaveBeenCalledWith(request);
  });

  it("cancels pending latest positioning on direct user input", () => {
    const request = latestRequest(22);
    const onCancelled = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="chat:cancel-latest"
        transcriptVersion="v1"
        viewportStable={false}
        firstItemIndex={1_000_000}
        openAtLatestRequest={request}
        liveFollow={false}
        onOpenAtLatestCancelled={onCancelled}
        onResolveRequest={vi.fn()}
      />,
    );

    fireEvent.wheel(transcript(), { deltaY: -700 });
    expect(onCancelled).toHaveBeenCalledWith(request);
  });

  it("restores Virtuoso state for an ordinary revisit", () => {
    const entries = Array.from({ length: 20 }, (_, index) => historyEntry(index + 1));
    const first = render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:restore"
        transcriptVersion="v1"
        firstItemIndex={999_980}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    expect(virtuosoMock.lastProps.restoreStateFrom).toBeUndefined();
    first.unmount();

    render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:restore"
        transcriptVersion="v1"
        firstItemIndex={999_980}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    expect(virtuosoMock.lastProps.restoreStateFrom).toEqual(virtuosoMock.state);
  });

  it("suppresses cached state when a fresh latest request exists", () => {
    const entries = Array.from({ length: 20 }, (_, index) => historyEntry(index + 1));
    const first = render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:restore-latest"
        transcriptVersion="v1"
        firstItemIndex={999_980}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    first.unmount();
    render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:restore-latest"
        transcriptVersion="v1"
        firstItemIndex={999_980}
        openAtLatestRequest={latestRequest(23)}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(virtuosoMock.lastProps.restoreStateFrom).toBeUndefined();
    expect(virtuosoMock.lastProps.initialTopMostItemIndex).toEqual({
      index: "LAST",
      align: "end",
    });
  });

  it("keeps following through transient bottom-state changes while streaming", () => {
    const { rerender } = render(
      <VirtuosoTaskChatTranscript
        entries={[runningEntry(1)]}
        transcriptIdentity="chat:live"
        transcriptVersion="live"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow
        onResolveRequest={vi.fn()}
      />,
    );

    expect(virtuosoMock.lastProps.atBottomThreshold).toBe(48);
    expect(virtuosoMock.lastProps.followOutput(true)).toBe("auto");
    expect(virtuosoMock.lastProps.followOutput(false)).toBe("auto");

    rerender(
      <VirtuosoTaskChatTranscript
        entries={[runningEntry(1)]}
        transcriptIdentity="chat:live"
        transcriptVersion="live"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    expect(virtuosoMock.lastProps.followOutput(true)).toBe(false);
  });

  it("releases live follow on upward input and resumes at the bottom", () => {
    render(
      <VirtuosoTaskChatTranscript
        entries={[runningEntry(1)]}
        transcriptIdentity="chat:manual-live"
        transcriptVersion="live"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow
        onResolveRequest={vi.fn()}
      />,
    );

    act(() => virtuosoMock.lastProps.atBottomStateChange(true));
    fireEvent.wheel(transcript(), { deltaY: -400 });

    expect(virtuosoMock.lastProps.followOutput(false)).toBe(false);
    expect(
      screen.getByRole("button", { name: "Jump to latest message" }),
    ).toBeInTheDocument();

    act(() => virtuosoMock.lastProps.atBottomStateChange(true));
    expect(virtuosoMock.lastProps.followOutput(false)).toBe("auto");
    expect(
      screen.queryByRole("button", { name: "Jump to latest message" }),
    ).not.toBeInTheDocument();
  });

  it("lets the jump control restore live following through Virtuoso", () => {
    render(
      <VirtuosoTaskChatTranscript
        entries={[runningEntry(1)]}
        transcriptIdentity="chat:jump-live"
        transcriptVersion="live"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow
        onResolveRequest={vi.fn()}
      />,
    );

    fireEvent.wheel(transcript(), { deltaY: -400 });
    fireEvent.click(
      screen.getByRole("button", { name: "Jump to latest message" }),
    );

    expect(virtuosoMock.scrollToIndex).toHaveBeenCalledWith({
      index: "LAST",
      align: "end",
      behavior: "auto",
    });
    expect(virtuosoMock.lastProps.followOutput(false)).toBe("auto");
  });

  it("coalesces live tail updates through Virtuoso while pinned", async () => {
    const { rerender } = render(
      <VirtuosoTaskChatTranscript
        entries={[runningEntry(1, "First chunk")]}
        transcriptIdentity="chat:streaming-tail"
        transcriptVersion="live"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow
        onResolveRequest={vi.fn()}
      />,
    );
    act(() => virtuosoMock.lastProps.atBottomStateChange(true));
    virtuosoMock.scrollToIndex.mockClear();

    rerender(
      <VirtuosoTaskChatTranscript
        entries={[runningEntry(1, "First chunk\nSecond chunk")]}
        transcriptIdentity="chat:streaming-tail"
        transcriptVersion="live"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow
        onResolveRequest={vi.fn()}
      />,
    );

    await vi.waitFor(() =>
      expect(virtuosoMock.scrollToIndex).toHaveBeenCalledWith({
        index: "LAST",
        align: "end",
        behavior: "auto",
      }),
    );
  });

  it("does not pull a manual reader down when the live tail changes", async () => {
    const { rerender } = render(
      <VirtuosoTaskChatTranscript
        entries={[runningEntry(1, "First chunk")]}
        transcriptIdentity="chat:manual-streaming-tail"
        transcriptVersion="live"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow
        onResolveRequest={vi.fn()}
      />,
    );
    await vi.waitFor(() => expect(virtuosoMock.scrollToIndex).toHaveBeenCalled());
    virtuosoMock.scrollToIndex.mockClear();
    fireEvent.wheel(transcript(), { deltaY: -500 });

    rerender(
      <VirtuosoTaskChatTranscript
        entries={[runningEntry(1, "First chunk\nSecond chunk")]}
        transcriptIdentity="chat:manual-streaming-tail"
        transcriptVersion="live"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow
        onResolveRequest={vi.fn()}
      />,
    );
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    });

    expect(virtuosoMock.scrollToIndex).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Jump to latest message" }),
    ).toBeInTheDocument();
  });

  it("waits for viewport resizing to settle before reaffirming the bottom", async () => {
    const entry = runningEntry(1);
    const commonProps = {
      entries: [entry],
      transcriptIdentity: "chat:live-resize",
      transcriptVersion: "live",
      firstItemIndex: 1_000_000,
      openAtLatestRequest: null,
      liveFollow: true,
      onResolveRequest: vi.fn(),
    };
    const { rerender } = render(
      <VirtuosoTaskChatTranscript
        {...commonProps}
        viewportStable
        viewportWidth={1_000}
      />,
    );
    await vi.waitFor(() => expect(virtuosoMock.scrollToIndex).toHaveBeenCalled());
    virtuosoMock.scrollToIndex.mockClear();

    rerender(
      <VirtuosoTaskChatTranscript
        {...commonProps}
        viewportStable={false}
        viewportWidth={760}
      />,
    );
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    });
    expect(virtuosoMock.scrollToIndex).not.toHaveBeenCalled();

    rerender(
      <VirtuosoTaskChatTranscript
        {...commonProps}
        viewportStable
        viewportWidth={760}
      />,
    );
    await vi.waitFor(() =>
      expect(virtuosoMock.scrollToIndex).toHaveBeenCalledWith({
        index: "LAST",
        align: "end",
        behavior: "auto",
      }),
    );
  });

  it("keeps latest-prompt editing available in virtual rows", () => {
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
