import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useConversationController } from "./useConversationController";

describe("useConversationController", () => {
  it("keeps transcript and history refs synchronized", () => {
    const { result } = renderHook(() => useConversationController());
    const transcript = {
      chatId: 7,
      sourceVersion: "v1",
      complete: true,
      firstItemIndex: 1_000_000,
      positionIntent: "preserve" as const,
      openAtLatestRequest: null,
      syncStatus: "complete" as const,
    };

    act(() => {
      result.current.setHistoricalTranscript(transcript);
      result.current.setHistoryState({
        status: "loaded",
        chats: [],
        error: null,
      });
      result.current.setActiveChatEntryId("entry-7");
    });

    expect(result.current.historicalTranscriptRef.current).toEqual(transcript);
    expect(result.current.historyStateRef.current.status).toBe("loaded");
    expect(result.current.activeChatEntryIdRef.current).toBe("entry-7");
  });

  it("keeps workspace chat sessions isolated by workspace", () => {
    const { result } = renderHook(() => useConversationController());
    const session = {
      chatId: 12,
      threadId: "thread-12",
      origin: "orchestrator" as const,
      profileKey: "account:3" as const,
      externalThreadId: null,
      nextTurnIndex: 2,
    };

    act(() => result.current.setWorkspaceChatSessions({ 4: session }));

    expect(result.current.workspaceChatSessionsRef.current[4]).toEqual(session);
    expect(result.current.workspaceChatSessionsRef.current[5]).toBeUndefined();
  });
});
