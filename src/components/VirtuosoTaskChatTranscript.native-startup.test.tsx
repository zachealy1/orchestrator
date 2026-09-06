import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VirtuosoMockContext } from "react-virtuoso";
import { emptyRunView } from "../lib/codexEventReducer";
import { getTranscriptWidthBucket } from "../lib/transcriptVirtualization";
import { renderWithAppServices } from "../test/renderWithAppServices";
import type { TaskChatEntry } from "./TaskChatTurn";
import { VirtuosoTaskChatTranscript } from "./VirtuosoTaskChatTranscript";

// Use the real virtualizer: the ordinary component tests mock it and cannot
// catch its animation-frame-dependent initial visibility gate.
describe("native transcript startup without animation frames", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 0, left: 0, bottom: 500, right: 800,
      width: 800, height: 500, x: 0, y: 0, toJSON: () => ({}),
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: function (this: HTMLElement, options: ScrollToOptions) {
        this.scrollTop = options.top ?? this.scrollTop;
        this.dispatchEvent(new Event("scroll"));
      },
    });
  });

  afterEach(() => {
    cleanup();
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTo;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(["latest", "restore"] as const)(
    "renders a %s conversation without a hidden virtualizer list",
    async (position) => {
      const entry: TaskChatEntry = {
        clientId: "qa-native-history",
        workspaceId: 1,
        chatId: 167,
        turnIndex: 1,
        runId: 274,
        taskId: 274,
        prompt: "Native history QA prompt",
        submittedAt: "2026-09-06T19:56:00Z",
        status: "completed",
        runView: { ...emptyRunView, status: "completed", finalMessage: "QA_HISTORY_VISIBLE" },
      };
      const { container } = renderWithAppServices(
        <VirtuosoMockContext.Provider value={{ viewportHeight: 500, itemHeight: 120 }}>
          <VirtuosoTaskChatTranscript
            model={{
              entries: [entry], transcriptIdentity: "chat:167", transcriptVersion: "v1",
              firstItemIndex: 999_999, liveFollow: false,
              openAtLatestRequest: position === "latest"
                ? { requestId: 1, chatId: 167, transcriptVersion: "v1" } : null,
              restoredViewportSnapshot: position === "restore" ? {
                workspaceId: 1, transcriptIdentity: "chat:167", transcriptVersion: "v1",
                viewportWidthBucket: getTranscriptWidthBucket(0), entryCount: 1,
                snapshot: { ranges: [{ startIndex: 0, endIndex: 0, size: 120 }], scrollTop: 42 },
              } : null,
            }}
            actions={{ onResolveRequest: vi.fn() }}
          />
        </VirtuosoMockContext.Provider>,
      );
      await act(async () => { await vi.advanceTimersByTimeAsync(3_100); });
      expect(screen.getByText("Native history QA prompt")).toBeVisible();
      expect(screen.getByText("QA_HISTORY_VISIBLE")).toBeVisible();
      expect(container.querySelector("[data-testid='virtuoso-item-list']")).toBeVisible();
      expect(screen.queryByLabelText("Loading chat")).not.toBeInTheDocument();
    },
  );
});
