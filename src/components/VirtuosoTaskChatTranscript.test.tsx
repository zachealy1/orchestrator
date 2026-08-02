import { act, fireEvent, screen } from "@testing-library/react";
import { createRef, forwardRef, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRunView } from "../lib/codexEventReducer";
import { isNativeUserInputRequest } from "../lib/nativePlanMode";
import { getCachedTranscriptRowHeight } from "../lib/transcriptVirtualization";
import { AppServices } from "../runtime/AppServices";
import { renderWithAppServices } from "../test/renderWithAppServices";
import type { TaskChatEntry } from "./TaskChatTurn";
import {
  TRANSCRIPT_MIN_OVERSCAN_ITEMS,
  TRANSCRIPT_RENDER_AHEAD_PX,
  TRANSCRIPT_SCROLL_IDLE_MS,
  VirtuosoTaskChatTranscript as ProductionVirtuosoTaskChatTranscript,
  type TranscriptActions,
  type TranscriptModel,
  type VirtuosoTaskChatTranscriptHandle,
} from "./VirtuosoTaskChatTranscript";

let services: AppServices;

function render(ui: ReactElement) {
  return renderWithAppServices(ui, {}, services);
}

type FlatTranscriptProps = TranscriptModel & TranscriptActions;

const VirtuosoTaskChatTranscript = forwardRef<
  VirtuosoTaskChatTranscriptHandle,
  FlatTranscriptProps
>(function TestVirtuosoTaskChatTranscript(props, ref) {
  const {
    onViewportSnapshotChange,
    onOpenAtLatestApplied,
    onOpenAtLatestCancelled,
    onResolveRequest,
    onAnswerUserInput,
    onImplementPlan,
    onRevisePlan,
    onCancelPlan,
    onOpenFileLink,
    onOpenWebPreview,
    onReviewEditedFile,
    onUndoEditedFiles,
    onEditPrompt,
    onLoadHistoricalActivity,
    onScrollActivityChange,
    onNotificationFocusApplied,
    ...model
  } = props;

  return (
    <ProductionVirtuosoTaskChatTranscript
      ref={ref}
      model={model}
      actions={{
        onViewportSnapshotChange,
        onOpenAtLatestApplied,
        onOpenAtLatestCancelled,
        onResolveRequest,
        onAnswerUserInput,
        onImplementPlan,
        onRevisePlan,
        onCancelPlan,
        onOpenFileLink,
        onOpenWebPreview,
        onReviewEditedFile,
        onUndoEditedFiles,
        onEditPrompt,
        onLoadHistoricalActivity,
        onScrollActivityChange,
        onNotificationFocusApplied,
      }}
    />
  );
});

const virtuosoMock = vi.hoisted(() => ({
  lastProps: null as any,
  state: {
    ranges: [{ startIndex: 0, endIndex: Number.POSITIVE_INFINITY, size: 360 }],
    scrollTop: 42,
  },
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

function runningQuestionEntry(): TaskChatEntry {
  const entry = runningEntry(1, "Choose an implementation scope.");
  return {
    ...entry,
    runView: {
      ...entry.runView,
      serverRequests: [
        {
          id: "request-1",
          method: "item/tool/requestUserInput",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            itemId: "item-1",
            questions: [
              {
                id: "scope",
                header: "Scope",
                question: "Which scope?",
                isOther: false,
                isSecret: false,
                options: [
                  {
                    label: "Focused",
                    description: "Make the smallest useful change.",
                  },
                ],
              },
            ],
          },
        },
      ],
      nativePlan: {
        ...entry.runView.nativePlan,
        phase: "awaiting-clarification",
      },
    },
  };
}

function runningMultiQuestionEntry(): TaskChatEntry {
  const entry = runningQuestionEntry();
  const request = entry.runView.serverRequests[0];
  if (!request || !isNativeUserInputRequest(request)) {
    throw new Error("Expected a native user-input request");
  }
  return {
    ...entry,
    runView: {
      ...entry.runView,
      serverRequests: [
        {
          ...request,
          params: {
            ...request.params,
            questions: [
              ...request.params.questions,
              {
                id: "input-support",
                header: "Input support",
                question: "Which input support?",
                isOther: false,
                isSecret: false,
                options: [
                  {
                    label: "Desktop first",
                    description: "Support keyboard input first.",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
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
    services = new AppServices();
    virtuosoMock.lastProps = null;
    virtuosoMock.scrollBy.mockClear();
    virtuosoMock.scrollToIndex.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    services.dispose();
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
    expect(
      virtuosoMock.lastProps.components?.ScrollSeekPlaceholder,
    ).toBeUndefined();
    expect(virtuosoMock.lastProps.components?.Header).toEqual(
      expect.any(Function),
    );
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
        services.transcriptGeometry,
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
    expect(virtuosoMock.lastProps.initialItemCount).toBe(20);
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
    expect(virtuosoMock.lastProps).not.toHaveProperty("initialItemCount");
    expect(virtuosoMock.lastProps).not.toHaveProperty(
      "initialTopMostItemIndex",
    );
  });

  it("does not restore another version's cached position into a mounted transcript", () => {
    const entries = Array.from({ length: 20 }, (_, index) =>
      historyEntry(index + 1),
    );
    const cachedLiveTranscript = render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:version-transition"
        transcriptVersion="live"
        firstItemIndex={999_980}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    cachedLiveTranscript.unmount();

    const mountedTranscript = render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:version-transition"
        transcriptVersion="history-v1"
        firstItemIndex={999_980}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    expect(virtuosoMock.lastProps).not.toHaveProperty("restoreStateFrom");

    mountedTranscript.rerender(
      <VirtuosoTaskChatTranscript
        entries={[...entries, historyEntry(21)]}
        transcriptIdentity="chat:version-transition"
        transcriptVersion="live"
        firstItemIndex={999_980}
        openAtLatestRequest={null}
        liveFollow
        onResolveRequest={vi.fn()}
      />,
    );

    expect(virtuosoMock.lastProps.restoreStateFrom).toBeUndefined();
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
    expect(virtuosoMock.lastProps).not.toHaveProperty("initialItemCount");
  });

  it("keeps the outgoing chat visible until the incoming transcript is positioned", async () => {
    const outgoingEntry = {
      ...historyEntry(1),
      clientId: "switch-outgoing",
      prompt: "Outgoing prompt",
    };
    const incomingEntry = {
      ...historyEntry(2),
      clientId: "switch-incoming",
      prompt: "Incoming prompt",
    };
    const view = render(
      <VirtuosoTaskChatTranscript
        entries={[outgoingEntry]}
        transcriptIdentity="chat:outgoing"
        transcriptVersion="v1"
        firstItemIndex={999_999}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    view.rerender(
      <VirtuosoTaskChatTranscript
        entries={[incomingEntry]}
        transcriptIdentity="chat:incoming"
        transcriptVersion="v1"
        firstItemIndex={999_999}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    const visibleLayer = view.container.querySelector<HTMLElement>(
      ".task-chat-transcript-layer.is-visible",
    );
    const preparingLayer = view.container.querySelector<HTMLElement>(
      ".task-chat-transcript-layer.is-preparing",
    );
    expect(visibleLayer).toHaveTextContent("Outgoing prompt");
    expect(preparingLayer).toHaveTextContent("Incoming prompt");
    expect(preparingLayer).toHaveAttribute("aria-hidden", "true");

    const incomingViewport = preparingLayer?.querySelector<HTMLElement>(
      '[data-testid="virtuoso-viewport"]',
    );
    const incomingRow = preparingLayer?.querySelector<HTMLElement>(
      '[data-transcript-entry-id="switch-incoming"]',
    );
    expect(incomingViewport).not.toBeNull();
    expect(incomingRow).not.toBeNull();
    configureScrollerGeometry(incomingViewport!);
    incomingRow!.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 900,
      height: 240,
      top: 0,
      right: 900,
      bottom: 240,
      left: 0,
      toJSON: () => ({}),
    });

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    });
    const nextVisibleLayer = view.container.querySelector<HTMLElement>(
      ".task-chat-transcript-layer.is-visible",
    );
    expect(nextVisibleLayer).toHaveTextContent("Incoming prompt");
    expect(
      view.container.querySelector(".task-chat-transcript-layer.is-preparing"),
    ).toBeNull();
  });

  it("keeps an initially restored transcript hidden until its saved position is ready", async () => {
    const entry = {
      ...historyEntry(1),
      clientId: "cold-restored-entry",
      prompt: "Cold restored prompt",
    };
    const view = render(
      <VirtuosoTaskChatTranscript
        entries={[entry]}
        transcriptIdentity="chat:cold-restore"
        transcriptVersion="v1"
        restoredViewportSnapshot={{
          workspaceId: 1,
          transcriptIdentity: "chat:cold-restore",
          transcriptVersion: "v1",
          viewportWidthBucket: 1_024,
          entryCount: 1,
          snapshot: {
            ranges: [
              {
                startIndex: 0,
                endIndex: Number.POSITIVE_INFINITY,
                size: 360,
              },
            ],
            scrollTop: 42,
          },
        }}
        viewportWidth={1_024}
        firstItemIndex={999_999}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(
      view.container.querySelector(".task-chat-transcript-layer.is-visible"),
    ).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Task chat transcript" }),
    ).toBeNull();
    const preparingLayer = view.container.querySelector<HTMLElement>(
      ".task-chat-transcript-layer.is-preparing",
    );
    expect(preparingLayer).toHaveTextContent("Cold restored prompt");
    expect(preparingLayer).toHaveAttribute("aria-hidden", "true");

    const viewport = preparingLayer?.querySelector<HTMLElement>(
      '[data-testid="virtuoso-viewport"]',
    );
    const row = preparingLayer?.querySelector<HTMLElement>(
      '[data-transcript-entry-id="cold-restored-entry"]',
    );
    expect(viewport).not.toBeNull();
    expect(row).not.toBeNull();
    configureScrollerGeometry(viewport!);
    row!.getBoundingClientRect = () => ({
      x: 0,
      y: -42,
      width: 900,
      height: 240,
      top: -42,
      right: 900,
      bottom: 198,
      left: 0,
      toJSON: () => ({}),
    });

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    });

    const visibleLayer = view.container.querySelector<HTMLElement>(
      ".task-chat-transcript-layer.is-visible",
    );
    expect(visibleLayer).toHaveTextContent("Cold restored prompt");
    expect(
      screen.getByRole("region", { name: "Task chat transcript" }),
    ).toBeInTheDocument();
    expect(
      view.container.querySelector(".task-chat-transcript-layer.is-preparing"),
    ).toBeNull();
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

  it("does not jump an unconfirmed idle viewport when prompt submission starts a run", async () => {
    const completedEntry = historyEntry(1);
    const { rerender } = render(
      <VirtuosoTaskChatTranscript
        entries={[completedEntry]}
        transcriptIdentity="chat:submit-with-restored-position"
        transcriptVersion="live"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    virtuosoMock.scrollToIndex.mockClear();

    rerender(
      <VirtuosoTaskChatTranscript
        entries={[completedEntry, runningEntry(2)]}
        transcriptIdentity="chat:submit-with-restored-position"
        transcriptVersion="live"
        firstItemIndex={999_999}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    rerender(
      <VirtuosoTaskChatTranscript
        entries={[completedEntry, runningEntry(2)]}
        transcriptIdentity="chat:submit-with-restored-position"
        transcriptVersion="live"
        firstItemIndex={999_999}
        openAtLatestRequest={null}
        liveFollow
        onResolveRequest={vi.fn()}
      />,
    );
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    });

    expect(virtuosoMock.scrollToIndex).not.toHaveBeenCalled();
    expect(virtuosoMock.lastProps.followOutput(false)).toBe(false);
  });

  it("follows a submitted prompt when the idle viewport was confirmed at the bottom", async () => {
    const completedEntry = historyEntry(1);
    const { rerender } = render(
      <VirtuosoTaskChatTranscript
        entries={[completedEntry]}
        transcriptIdentity="chat:submit-at-bottom"
        transcriptVersion="live"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    act(() => virtuosoMock.lastProps.atBottomStateChange(true));
    virtuosoMock.scrollToIndex.mockClear();

    rerender(
      <VirtuosoTaskChatTranscript
        entries={[completedEntry, runningEntry(2)]}
        transcriptIdentity="chat:submit-at-bottom"
        transcriptVersion="live"
        firstItemIndex={999_999}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    rerender(
      <VirtuosoTaskChatTranscript
        entries={[completedEntry, runningEntry(2)]}
        transcriptIdentity="chat:submit-at-bottom"
        transcriptVersion="live"
        firstItemIndex={999_999}
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
    expect(virtuosoMock.lastProps.followOutput(false)).toBe("auto");
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

  it("keeps a pending question stationary while its answer is submitted", async () => {
    const entry = runningQuestionEntry();
    const commonProps = {
      transcriptIdentity: "chat:question-submission",
      transcriptVersion: "live",
      firstItemIndex: 1_000_000,
      openAtLatestRequest: null,
      liveFollow: true,
      onResolveRequest: vi.fn(),
    };
    const { rerender } = render(
      <VirtuosoTaskChatTranscript entries={[entry]} {...commonProps} />,
    );
    act(() => virtuosoMock.lastProps.atBottomStateChange(true));
    await vi.waitFor(() => expect(virtuosoMock.scrollToIndex).toHaveBeenCalled());
    virtuosoMock.scrollToIndex.mockClear();
    const questionCard = screen.getByText("Which scope?").closest("form");

    rerender(
      <VirtuosoTaskChatTranscript
        entries={[
          {
            ...entry,
            runView: {
              ...entry.runView,
              nativePlan: {
                ...entry.runView.nativePlan,
                requestStates: { "request-1": "submitting" },
              },
            },
          },
        ]}
        {...commonProps}
      />,
    );
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    });

    expect(screen.getByText("Which scope?").closest("form")).toBe(questionCard);
    expect(screen.getByRole("group")).toBeDisabled();
    expect(virtuosoMock.scrollToIndex).not.toHaveBeenCalled();
  });

  it("does not follow the tail when a selected answer resolves its question", async () => {
    const entry = runningQuestionEntry();
    const onAnswerUserInput = vi.fn();
    const commonProps = {
      transcriptIdentity: "chat:question-resolution",
      transcriptVersion: "live",
      firstItemIndex: 1_000_000,
      openAtLatestRequest: null,
      liveFollow: true,
      onResolveRequest: vi.fn(),
      onAnswerUserInput,
    };
    const { rerender } = render(
      <VirtuosoTaskChatTranscript entries={[entry]} {...commonProps} />,
    );
    act(() => virtuosoMock.lastProps.atBottomStateChange(true));
    await vi.waitFor(() => expect(virtuosoMock.scrollToIndex).toHaveBeenCalled());
    virtuosoMock.scrollToIndex.mockClear();

    const option = screen.getByRole("radio", { name: "Focused" });
    fireEvent.click(option);
    expect(option).toBeChecked();
    expect(onAnswerUserInput).toHaveBeenCalledTimes(1);

    rerender(
      <VirtuosoTaskChatTranscript
        entries={[
          {
            ...entry,
            runView: {
              ...entry.runView,
              nativePlan: {
                ...entry.runView.nativePlan,
                requestStates: { "request-1": "submitting" },
              },
            },
          },
        ]}
        {...commonProps}
      />,
    );
    rerender(
      <VirtuosoTaskChatTranscript
        entries={[
          {
            ...entry,
            runView: {
              ...entry.runView,
              serverRequests: [],
              nativePlan: {
                ...entry.runView.nativePlan,
                phase: "drafting",
                requestStates: {},
              },
            },
          },
        ]}
        {...commonProps}
      />,
    );
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    });

    expect(virtuosoMock.scrollToIndex).not.toHaveBeenCalled();
  });

  it("preserves the interaction position when a radio answer advances to another question", async () => {
    const entry = runningMultiQuestionEntry();
    render(
      <VirtuosoTaskChatTranscript
        entries={[entry]}
        transcriptIdentity="chat:multi-question-anchor"
        transcriptVersion="live"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow
        onResolveRequest={vi.fn()}
        onAnswerUserInput={vi.fn()}
      />,
    );
    act(() => virtuosoMock.lastProps.atBottomStateChange(true));
    await vi.waitFor(() => expect(virtuosoMock.scrollToIndex).toHaveBeenCalled());
    virtuosoMock.scrollBy.mockClear();
    virtuosoMock.scrollToIndex.mockClear();

    const stack = screen.getByLabelText("Pending Codex interactions");
    stack.getBoundingClientRect = () => {
      const top = screen.queryByText("Which input support?") ? 160 : 220;
      return {
        x: 0,
        y: top,
        width: 800,
        height: 360,
        top,
        right: 800,
        bottom: top + 360,
        left: 0,
        toJSON: () => ({}),
      };
    };

    fireEvent.click(screen.getByRole("radio", { name: "Focused" }));

    expect(screen.getByText("Which input support?")).toBeInTheDocument();
    expect(virtuosoMock.lastProps.followOutput(false)).toBe(false);
    await act(
      () =>
        new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => resolve());
            });
          });
        }),
    );

    expect(virtuosoMock.scrollToIndex).not.toHaveBeenCalled();
    expect(virtuosoMock.scrollBy).toHaveBeenCalledWith({
      top: -60,
      behavior: "auto",
    });
    expect(virtuosoMock.lastProps.followOutput(false)).toBe("auto");
  });

  it("follows the tail when a new agent question arrives", async () => {
    const entry = runningEntry(1, "Reviewing the available options.");
    const commonProps = {
      transcriptIdentity: "chat:new-question",
      transcriptVersion: "live",
      firstItemIndex: 1_000_000,
      openAtLatestRequest: null,
      liveFollow: true,
      onResolveRequest: vi.fn(),
    };
    const { rerender } = render(
      <VirtuosoTaskChatTranscript entries={[entry]} {...commonProps} />,
    );
    act(() => virtuosoMock.lastProps.atBottomStateChange(true));
    await vi.waitFor(() => expect(virtuosoMock.scrollToIndex).toHaveBeenCalled());
    virtuosoMock.scrollToIndex.mockClear();

    rerender(
      <VirtuosoTaskChatTranscript
        entries={[runningQuestionEntry()]}
        {...commonProps}
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

  it("reaffirms the bottom after a followed response completes", async () => {
    const { rerender } = render(
      <VirtuosoTaskChatTranscript
        entries={[runningEntry(1, "Finalizing...")]}
        transcriptIdentity="chat:completion-follow"
        transcriptVersion="live"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow
        onResolveRequest={vi.fn()}
      />,
    );
    act(() => virtuosoMock.lastProps.atBottomStateChange(true));
    await vi.waitFor(() => expect(virtuosoMock.scrollToIndex).toHaveBeenCalled());
    virtuosoMock.scrollToIndex.mockClear();

    rerender(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="chat:completion-follow"
        transcriptVersion="live"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow={false}
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

  it("keeps a completed response stationary when the user scrolled upward", async () => {
    const { rerender } = render(
      <VirtuosoTaskChatTranscript
        entries={[runningEntry(1, "Finalizing...")]}
        transcriptIdentity="chat:manual-completion"
        transcriptVersion="live"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow
        onResolveRequest={vi.fn()}
      />,
    );
    act(() => virtuosoMock.lastProps.atBottomStateChange(true));
    await vi.waitFor(() => expect(virtuosoMock.scrollToIndex).toHaveBeenCalled());
    fireEvent.wheel(transcript(), { deltaY: -500 });
    virtuosoMock.scrollToIndex.mockClear();

    rerender(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="chat:manual-completion"
        transcriptVersion="live"
        firstItemIndex={1_000_000}
        openAtLatestRequest={null}
        liveFollow={false}
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

  it("preserves the first visible row when submission changes surrounding layout", async () => {
    const transcriptRef = createRef<VirtuosoTaskChatTranscriptHandle>();
    const commonProps = {
      transcriptIdentity: "chat:manual-submission-anchor",
      transcriptVersion: "live",
      firstItemIndex: 999_998,
      openAtLatestRequest: null,
      liveFollow: false,
      onResolveRequest: vi.fn(),
    };
    const { rerender } = render(
      <VirtuosoTaskChatTranscript
        ref={transcriptRef}
        entries={[historyEntry(1), historyEntry(2)]}
        {...commonProps}
      />,
    );
    const viewport = transcript();
    configureScrollerGeometry(viewport);
    act(() => virtuosoMock.lastProps.atBottomStateChange(false));

    const anchor = screen
      .getByText("Prompt 1")
      .closest<HTMLElement>("[data-transcript-entry-id]");
    expect(anchor).not.toBeNull();
    let anchorTop = 140;
    anchor!.getBoundingClientRect = () => ({
      x: 0,
      y: anchorTop,
      width: 800,
      height: 120,
      top: anchorTop,
      right: 800,
      bottom: anchorTop + 120,
      left: 0,
      toJSON: () => ({}),
    });
    virtuosoMock.scrollBy.mockImplementation(
      ({ top }: { top: number }) => {
        anchorTop -= top;
      },
    );

    act(() => transcriptRef.current?.stabilizeForSubmission());
    anchorTop = 212;
    rerender(
      <VirtuosoTaskChatTranscript
        ref={transcriptRef}
        entries={[historyEntry(1), historyEntry(2), historyEntry(3)]}
        {...commonProps}
      />,
    );
    act(() => transcriptRef.current?.settleAfterSubmission());

    await vi.waitFor(() =>
      expect(virtuosoMock.scrollBy).toHaveBeenCalledWith({
        top: 72,
        behavior: "auto",
      }),
    );
    expect(virtuosoMock.scrollBy).toHaveBeenCalledTimes(1);
    expect(virtuosoMock.scrollToIndex).not.toHaveBeenCalled();
  });

  it("follows the latest row after submission only when already at the bottom", async () => {
    const transcriptRef = createRef<VirtuosoTaskChatTranscriptHandle>();
    const commonProps = {
      transcriptIdentity: "chat:follow-submission",
      transcriptVersion: "live",
      firstItemIndex: 999_998,
      openAtLatestRequest: null,
      liveFollow: false,
      onResolveRequest: vi.fn(),
    };
    const { rerender } = render(
      <VirtuosoTaskChatTranscript
        ref={transcriptRef}
        entries={[historyEntry(1), historyEntry(2)]}
        {...commonProps}
      />,
    );
    act(() => virtuosoMock.lastProps.atBottomStateChange(true));
    // Parent layout changes can transiently report false without user input.
    // Submission should retain the user's established follow intent.
    act(() => virtuosoMock.lastProps.atBottomStateChange(false));
    virtuosoMock.scrollToIndex.mockClear();

    act(() => transcriptRef.current?.stabilizeForSubmission());
    rerender(
      <VirtuosoTaskChatTranscript
        ref={transcriptRef}
        entries={[historyEntry(1), historyEntry(2), historyEntry(3)]}
        {...commonProps}
      />,
    );
    act(() => transcriptRef.current?.settleAfterSubmission());

    await vi.waitFor(() =>
      expect(virtuosoMock.scrollToIndex).toHaveBeenCalledWith({
        index: "LAST",
        align: "end",
        behavior: "auto",
      }),
    );
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    });
    expect(virtuosoMock.scrollToIndex).toHaveBeenCalledTimes(1);
    expect(virtuosoMock.scrollBy).not.toHaveBeenCalled();
  });

  it("cancels pending submission positioning when the user starts scrolling", async () => {
    const transcriptRef = createRef<VirtuosoTaskChatTranscriptHandle>();
    render(
      <VirtuosoTaskChatTranscript
        ref={transcriptRef}
        entries={[historyEntry(1), historyEntry(2)]}
        transcriptIdentity="chat:submission-user-scroll"
        transcriptVersion="live"
        firstItemIndex={999_998}
        openAtLatestRequest={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    act(() => virtuosoMock.lastProps.atBottomStateChange(true));
    virtuosoMock.scrollToIndex.mockClear();

    act(() => {
      transcriptRef.current?.stabilizeForSubmission();
      transcriptRef.current?.settleAfterSubmission();
      fireEvent.wheel(transcript(), { deltaY: -240 });
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    });

    expect(virtuosoMock.scrollToIndex).not.toHaveBeenCalled();
    expect(virtuosoMock.scrollBy).not.toHaveBeenCalled();
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
