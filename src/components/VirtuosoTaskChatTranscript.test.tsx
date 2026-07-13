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
  TRANSCRIPT_RENDER_AHEAD_PX,
  TRANSCRIPT_SCROLL_IDLE_MS,
  VirtuosoTaskChatTranscript,
} from "./VirtuosoTaskChatTranscript";

const virtuosoMock = vi.hoisted(() => ({
  lastProps: null as any,
  state: { ranges: [{ startIndex: 292, endIndex: 299 }], scrollTop: 42 },
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
      }));
      React.useEffect(() => {
        props.scrollerRef?.(viewportRef.current);
        return () => props.scrollerRef?.(null);
      }, [props.scrollerRef]);
      const data = props.data ?? [];
      const startIndex = Math.max(0, data.length - 8);
      return (
        <div
          data-testid="virtuoso-viewport"
          className={props.className}
          ref={viewportRef}
          tabIndex={0}
        >
          {data.slice(startIndex).map((entry: TaskChatEntry, offset: number) => {
            const index = startIndex + offset;
            return (
              <div key={props.computeItemKey(index, entry)}>
                {props.itemContent(index, entry)}
              </div>
            );
          })}
        </div>
      );
    }),
  };
});

function historyEntry(turnIndex: number): TaskChatEntry {
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
      finalMessage: `Result ${turnIndex}.`,
    },
  };
}

describe("VirtuosoTaskChatTranscript", () => {
  beforeEach(() => {
    clearTranscriptStateCache();
    clearTranscriptMeasurementCache();
    virtuosoMock.lastProps = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("supplies the full transcript while mounting only the virtualized rows", () => {
    const entries = Array.from({ length: 300 }, (_, index) => historyEntry(index + 1));
    const { container } = render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:401"
        transcriptVersion="v1"
        firstItemIndex={999_700}
        openAtLatestRequestId={1}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(virtuosoMock.lastProps.data).toHaveLength(300);
    expect(virtuosoMock.lastProps.firstItemIndex).toBe(999_700);
    expect(virtuosoMock.lastProps.initialTopMostItemIndex).toEqual({
      index: "LAST",
      align: "end",
    });
    expect(virtuosoMock.lastProps.computeItemKey(0, entries[0])).toBe("history-1");
    expect(container.querySelectorAll(".task-chat-virtuoso-row")).toHaveLength(8);
    expect(screen.getByText("Prompt 300")).toBeInTheDocument();
    expect(screen.queryByText("Prompt 1")).not.toBeInTheDocument();
  });

  it("uses one moderate render-ahead window without scroll-seek substitution", () => {
    const entries = Array.from({ length: 300 }, (_, index) => historyEntry(index + 1));
    render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:fast-scroll"
        transcriptVersion="v1"
        firstItemIndex={999_700}
        openAtLatestRequestId={1}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(virtuosoMock.lastProps.increaseViewportBy).toEqual({
      top: TRANSCRIPT_RENDER_AHEAD_PX,
      bottom: TRANSCRIPT_RENDER_AHEAD_PX,
    });
    expect(virtuosoMock.lastProps.minOverscanItemCount).toBeUndefined();
    expect(virtuosoMock.lastProps.overscan).toBeUndefined();
    expect(virtuosoMock.lastProps.scrollSeekConfiguration).toBeUndefined();
    expect(virtuosoMock.lastProps.components).toBeUndefined();
    expect(document.querySelector(".task-chat-scroll-seek-row")).toBeNull();
  });

  it("uses the transcript viewport width for content-aware row geometry", () => {
    const entries = Array.from({ length: 12 }, (_, index) => ({
      ...historyEntry(index + 1),
      runView: {
        ...historyEntry(index + 1).runView,
        finalMessage: "Detailed response content ".repeat(180),
      },
    }));
    const { rerender } = render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:geometry"
        transcriptVersion="v1"
        viewportWidth={480}
        firstItemIndex={999_700}
        openAtLatestRequestId={1}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    const narrowDefault = virtuosoMock.lastProps.defaultItemHeight;

    rerender(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:geometry"
        transcriptVersion="v1"
        viewportWidth={1_024}
        firstItemIndex={999_700}
        openAtLatestRequestId={1}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(narrowDefault).toBeGreaterThan(virtuosoMock.lastProps.defaultItemHeight);
  });

  it("keeps the default row geometry stable when older turns prepend", () => {
    const latestEntries = Array.from({ length: 20 }, (_, index) =>
      historyEntry(index + 46),
    );
    const { rerender } = render(
      <VirtuosoTaskChatTranscript
        entries={latestEntries}
        transcriptIdentity="chat:stable-geometry"
        transcriptVersion="v1"
        viewportWidth={900}
        firstItemIndex={1_000_000}
        openAtLatestRequestId={1}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    const initialDefault = virtuosoMock.lastProps.defaultItemHeight;
    const completeEntries = Array.from({ length: 65 }, (_, index) => {
      const nextEntry = historyEntry(index + 1);
      return index < 45
        ? {
            ...nextEntry,
            runView: {
              ...nextEntry.runView,
              finalMessage: "Long historical response. ".repeat(400),
            },
          }
        : latestEntries[index - 45];
    });

    rerender(
      <VirtuosoTaskChatTranscript
        entries={completeEntries}
        transcriptIdentity="chat:stable-geometry"
        transcriptVersion="v1"
        viewportWidth={900}
        firstItemIndex={1_000_000 - 45}
        openAtLatestRequestId={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(virtuosoMock.lastProps.defaultItemHeight).toBe(initialDefault);
  });

  it("feeds exact Virtuoso row measurements back into the geometry cache", () => {
    const entry = historyEntry(1);
    const first = render(
      <VirtuosoTaskChatTranscript
        entries={[entry]}
        transcriptIdentity="chat:measured"
        transcriptVersion="v1"
        viewportWidth={640}
        firstItemIndex={999_700}
        openAtLatestRequestId={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    act(() => {
      virtuosoMock.lastProps.itemsRendered([
        { data: entry, index: 999_700, offset: 0, size: 612 },
      ]);
    });
    first.unmount();

    render(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="chat:measured"
        transcriptVersion="v1"
        viewportWidth={640}
        firstItemIndex={999_700}
        openAtLatestRequestId={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(virtuosoMock.lastProps.defaultItemHeight).toBe(612);
  });

  it("defers row-height cache writes until momentum scrolling is idle", () => {
    vi.useFakeTimers();
    const entry = historyEntry(1);
    render(
      <VirtuosoTaskChatTranscript
        entries={[entry]}
        transcriptIdentity="chat:deferred-measurement"
        transcriptVersion="v1"
        viewportWidth={640}
        firstItemIndex={999_700}
        openAtLatestRequestId={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    const viewport = screen.getByTestId("virtuoso-viewport");

    fireEvent.wheel(viewport, { deltaY: 900 });
    act(() => {
      virtuosoMock.lastProps.itemsRendered([
        { data: entry, index: 999_700, offset: 0, size: 612 },
      ]);
    });
    expect(
      getCachedTranscriptRowHeight(
        entry,
        640,
        "chat:deferred-measurement:v1",
      ),
    ).toBeUndefined();

    act(() => {
      vi.advanceTimersByTime(TRANSCRIPT_SCROLL_IDLE_MS);
    });
    expect(
      getCachedTranscriptRowHeight(
        entry,
        640,
        "chat:deferred-measurement:v1",
      ),
    ).toBe(612);
  });

  it("follows live output only when the viewport remains at the bottom", () => {
    const { rerender } = render(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="live:401"
        transcriptVersion="1"
        firstItemIndex={1_000_000}
        openAtLatestRequestId={null}
        liveFollow
        onResolveRequest={vi.fn()}
      />,
    );

    expect(virtuosoMock.lastProps.atBottomThreshold).toBe(48);
    expect(virtuosoMock.lastProps.followOutput(true)).toBe("auto");
    expect(virtuosoMock.lastProps.followOutput(false)).toBe(false);

    rerender(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="live:401"
        transcriptVersion="1"
        firstItemIndex={1_000_000}
        openAtLatestRequestId={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    expect(virtuosoMock.lastProps.followOutput(true)).toBe(false);
  });

  it("keeps viewport activity active through gaps in macOS momentum events", () => {
    vi.useFakeTimers();
    const onScrollActivityChange = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={Array.from({ length: 40 }, (_, index) => historyEntry(index + 1))}
        transcriptIdentity="chat:activity"
        transcriptVersion="v1"
        firstItemIndex={999_700}
        openAtLatestRequestId={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
        onScrollActivityChange={onScrollActivityChange}
      />,
    );

    const viewport = screen.getByTestId("virtuoso-viewport");
    fireEvent.wheel(viewport, { deltaY: 700 });
    expect(onScrollActivityChange).toHaveBeenLastCalledWith(true);
    act(() => virtuosoMock.lastProps.isScrolling(true));
    act(() => virtuosoMock.lastProps.isScrolling(false));
    expect(onScrollActivityChange).toHaveBeenCalledTimes(1);

    fireEvent.scroll(viewport);
    act(() => {
      vi.advanceTimersByTime(TRANSCRIPT_SCROLL_IDLE_MS - 1);
    });
    expect(onScrollActivityChange).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(onScrollActivityChange).toHaveBeenLastCalledWith(false);
  });

  it.each([
    ["touch", (viewport: HTMLElement) => fireEvent.touchStart(viewport)],
    ["keyboard", (viewport: HTMLElement) =>
      fireEvent.keyDown(viewport, { key: "PageDown" })],
    ["scrollbar", (viewport: HTMLElement) =>
      fireEvent.pointerDown(viewport, { clientX: 0 })],
  ])("reports %s transcript gestures until the idle window", (_name, begin) => {
    vi.useFakeTimers();
    const onScrollActivityChange = vi.fn();
    render(
      <VirtuosoTaskChatTranscript
        entries={Array.from({ length: 20 }, (_, index) => historyEntry(index + 1))}
        transcriptIdentity={`chat:${_name}`}
        transcriptVersion="v1"
        firstItemIndex={999_700}
        openAtLatestRequestId={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
        onScrollActivityChange={onScrollActivityChange}
      />,
    );

    begin(screen.getByTestId("virtuoso-viewport"));
    expect(onScrollActivityChange).toHaveBeenLastCalledWith(true);
    act(() => vi.advanceTimersByTime(TRANSCRIPT_SCROLL_IDLE_MS));
    expect(onScrollActivityChange).toHaveBeenLastCalledWith(false);
  });

  it("restores cached measurements and scroll state for the same transcript", () => {
    const entries = Array.from({ length: 20 }, (_, index) => historyEntry(index + 1));
    const first = render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:401"
        transcriptVersion="stable-v1"
        firstItemIndex={1_000_000}
        openAtLatestRequestId={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    expect(virtuosoMock.lastProps.restoreStateFrom).toBeUndefined();
    first.unmount();

    render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:401"
        transcriptVersion="stable-v1"
        firstItemIndex={1_000_000}
        openAtLatestRequestId={null}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(virtuosoMock.lastProps.restoreStateFrom).toEqual(virtuosoMock.state);
    expect(virtuosoMock.lastProps.initialTopMostItemIndex).toBeUndefined();
  });

  it("ignores a saved top position when the same history chat is explicitly selected again", () => {
    const entries = Array.from({ length: 20 }, (_, index) => historyEntry(index + 1));
    const first = render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:401"
        transcriptVersion="stable-v1"
        firstItemIndex={1_000_000}
        openAtLatestRequestId={11}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    first.unmount();

    render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:401"
        transcriptVersion="stable-v1"
        firstItemIndex={1_000_000}
        openAtLatestRequestId={12}
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

  it("does not issue a second latest-position request when older turns hydrate", async () => {
    const onOpenAtLatestApplied = vi.fn();
    const latestEntries = Array.from({ length: 20 }, (_, index) =>
      historyEntry(index + 46),
    );
    const { rerender } = render(
      <VirtuosoTaskChatTranscript
        entries={latestEntries}
        transcriptIdentity="chat:hydrating"
        transcriptVersion="v1"
        firstItemIndex={1_000_000}
        openAtLatestRequestId={31}
        liveFollow={false}
        onOpenAtLatestApplied={onOpenAtLatestApplied}
        onResolveRequest={vi.fn()}
      />,
    );

    await vi.waitFor(() => expect(onOpenAtLatestApplied).toHaveBeenCalledWith(31));
    rerender(
      <VirtuosoTaskChatTranscript
        entries={Array.from({ length: 65 }, (_, index) => historyEntry(index + 1))}
        transcriptIdentity="chat:hydrating"
        transcriptVersion="v1"
        firstItemIndex={1_000_000 - 45}
        openAtLatestRequestId={null}
        liveFollow={false}
        onOpenAtLatestApplied={onOpenAtLatestApplied}
        onResolveRequest={vi.fn()}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(onOpenAtLatestApplied).toHaveBeenCalledTimes(1);
    expect(virtuosoMock.lastProps.firstItemIndex).toBe(1_000_000 - 45);
  });
});
