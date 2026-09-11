import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addSteerPrompt, emptyRunView } from "../lib/codexEventReducer";
import { renderWithAppServices } from "../test/renderWithAppServices";
import type { TaskChatEntry } from "./TaskChatTurn";
import { VirtuosoTaskChatTranscript } from "./VirtuosoTaskChatTranscript";

const virtualizer = vi.hoisted(() => ({ scrollToIndex: vi.fn() }));
vi.mock("react-virtuoso", async () => {
  const React = await import("react");
  return {
    Virtuoso: React.forwardRef(function MockVirtuoso(props: any, ref) {
      const viewport = React.useRef<HTMLDivElement | null>(null);
      React.useImperativeHandle(ref, () => ({
        getState: (callback: (state: unknown) => void) =>
          callback({ ranges: [{ startIndex: 0, endIndex: 0, size: 360 }], scrollTop: 0 }),
        scrollBy: vi.fn(),
        scrollToIndex: virtualizer.scrollToIndex,
      }));
      React.useEffect(() => {
        props.scrollerRef?.(viewport.current);
        return () => props.scrollerRef?.(null);
      }, [props.scrollerRef]);
      return (
        <div ref={viewport} aria-label={props["aria-label"]} className={props.className}>
          {props.data.map((entry: TaskChatEntry, index: number) => (
            <div key={props.computeItemKey(index, entry)}>{props.itemContent(index, entry)}</div>
          ))}
        </div>
      );
    }),
  };
});

describe("steer transcript scrolling", () => {
  beforeEach(() => virtualizer.scrollToIndex.mockClear());

  it.each([false, true])("preserves follow intent (manual reader: %s)", async (manualReader) => {
    const entry: TaskChatEntry = {
      clientId: "steer-follow", workspaceId: 1, chatId: 401, turnIndex: 1, runId: 1, taskId: 1,
      prompt: "Initial prompt", submittedAt: "2026-09-11T12:00:00Z", status: "running",
      runView: {
        ...emptyRunView, status: "running",
        streamEvents: [{ id: "before", kind: "message", text: "Before steering", timestamp: "2026-09-11T12:00:00Z" }],
      },
    };
    const model = {
      entries: [entry], transcriptIdentity: "chat:steer-follow", transcriptVersion: "live",
      firstItemIndex: 1_000_000, openAtLatestRequest: null, liveFollow: true,
    };
    const actions = { onResolveRequest: vi.fn() };
    const { rerender } = renderWithAppServices(<VirtuosoTaskChatTranscript model={model} actions={actions} />);
    await vi.waitFor(() => expect(virtualizer.scrollToIndex).toHaveBeenCalled());
    if (manualReader) fireEvent.wheel(screen.getByLabelText("Task chat transcript"), { deltaY: -500 });
    virtualizer.scrollToIndex.mockClear();
    const runView = addSteerPrompt(entry.runView, {
      id: "steer:1", text: "Follow this steer", timestamp: "2026-09-11T12:00:00Z", contextFiles: [],
    });
    rerender(<VirtuosoTaskChatTranscript model={{ ...model, entries: [{ ...entry, runView }] }} actions={actions} />);
    expect(screen.getByLabelText("Additional submitted prompt")).toBeVisible();
    if (manualReader) {
      await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 30)); });
      expect(virtualizer.scrollToIndex).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Jump to latest message" })).toBeInTheDocument();
    } else {
      await vi.waitFor(() => expect(virtualizer.scrollToIndex).toHaveBeenCalledWith({
        index: "LAST", align: "end", behavior: "auto",
      }));
    }
  });
});
