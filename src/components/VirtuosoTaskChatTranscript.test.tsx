import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRunView } from "../lib/codexEventReducer";
import type { TaskChatEntry } from "./TaskChatTranscript";
import {
  clearTranscriptStateCache,
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
      React.useImperativeHandle(ref, () => ({
        getState: (callback: (state: unknown) => void) =>
          callback(virtuosoMock.state),
      }));
      const data = props.data ?? [];
      const startIndex = Math.max(0, data.length - 8);
      return (
        <div data-testid="virtuoso-viewport" className={props.className}>
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
    virtuosoMock.lastProps = null;
  });

  it("supplies the full transcript while mounting only the virtualized rows", () => {
    const entries = Array.from({ length: 300 }, (_, index) => historyEntry(index + 1));
    const { container } = render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:401"
        transcriptVersion="v1"
        firstItemIndex={999_700}
        openAtLatest
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

  it("follows live output only when the viewport remains at the bottom", () => {
    const { rerender } = render(
      <VirtuosoTaskChatTranscript
        entries={[historyEntry(1)]}
        transcriptIdentity="live:401"
        transcriptVersion="1"
        firstItemIndex={1_000_000}
        openAtLatest={false}
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
        openAtLatest={false}
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );
    expect(virtuosoMock.lastProps.followOutput(true)).toBe(false);
  });

  it("restores cached measurements and scroll state for the same transcript", () => {
    const entries = Array.from({ length: 20 }, (_, index) => historyEntry(index + 1));
    const first = render(
      <VirtuosoTaskChatTranscript
        entries={entries}
        transcriptIdentity="chat:401"
        transcriptVersion="stable-v1"
        firstItemIndex={1_000_000}
        openAtLatest
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
        openAtLatest
        liveFollow={false}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(virtuosoMock.lastProps.restoreStateFrom).toEqual(virtuosoMock.state);
    expect(virtuosoMock.lastProps.initialTopMostItemIndex).toBeUndefined();
  });
});
