import { describe, expect, it } from "vitest";
import {
  buildPreviousChatContext,
  boundChatContinuationTurns,
  createTaskChatEntriesFromContinuationSnapshot,
  historyActivityTime,
  isAdoptedExternalChat,
  normalizeHistoricalProposedPlan,
  parseChatContinuationSnapshot,
  restorePersistedGeneratedImages,
  sortHistoryChatsByActivity,
} from "./historyProjection";
import type { TaskChatEntry } from "../../components/TaskChatTurn";
import { emptyRunView } from "../../lib/codexEventReducer";
import type { ChatListItem } from "./types";

function chat(id: number, latestActivityAt: string): ChatListItem {
  return {
    id,
    workspace_id: 1,
    account_id: null,
    profile_key: null,
    codex_thread_id: null,
    external_thread_id: null,
    origin: "orchestrator",
    source_kind: null,
    sync_status: null,
    external_cwd: null,
    external_updated_at: null,
    external_created_at: null,
    last_synced_at: null,
    title: `Chat ${id}`,
    title_generation_state: "complete",
    title_fallback: null,
    title_manually_edited: 0,
    title_generation_started_at: null,
    conversation_revision: 0,
    status: "completed",
    total_tokens: null,
    duration_ms: null,
    latest_model: null,
    turn_count: 1,
    latest_activity_at: latestActivityAt,
    created_at: latestActivityAt,
    updated_at: latestActivityAt,
    deleted_at: null,
    account_label: null,
    account_email: null,
  };
}

describe("historyProjection", () => {
  it("restores persisted image-generation lifecycle events without duplicates", () => {
    const restored = restorePersistedGeneratedImages(
      JSON.stringify([
        {
          method: "item/started",
          params: {
            threadId: "thread-images",
            item: { type: "imageGeneration", id: "image-1" },
          },
        },
        {
          method: "item/completed",
          params: {
            threadId: "thread-images",
            item: {
              type: "imageGeneration",
              id: "image-1",
              savedPath: "/Users/test/.codex/generated_images/thread-images/concept.png",
            },
          },
        },
      ]),
    );

    expect(restored.generatedImageOrder).toEqual(["image-1"]);
    expect(restored.generatedImagesById["image-1"]).toMatchObject({
      status: "completed",
      savedPath: "/Users/test/.codex/generated_images/thread-images/concept.png",
    });
    expect(restorePersistedGeneratedImages("not-json").generatedImageOrder).toEqual([]);
  });

  it("sorts by the newest persisted or live activity without mutating input", () => {
    const older = chat(1, "2026-07-01 10:00:00");
    const newer = chat(2, "2026-07-01 11:00:00");
    const chats = [older, newer];
    const liveActivity = new Map([[1, "2026-07-01T12:00:00Z"]]);

    expect(sortHistoryChatsByActivity(chats, liveActivity)).toEqual([
      older,
      newer,
    ]);
    expect(chats).toEqual([older, newer]);
    expect(historyActivityTime("not-a-date")).toBe(Number.NEGATIVE_INFINITY);
  });

  it("promotes a complete proposed-plan envelope and preserves its markdown", () => {
    const markdown = "# Add health check\n\n- Add `/health`.";

    expect(
      normalizeHistoricalProposedPlan(
        `<proposed_plan>\n${markdown}\n</proposed_plan>`,
      ),
    ).toEqual({
      finalMessage: "",
      planText: markdown,
      promoted: true,
    });
  });

  it("does not promote malformed or mixed-prose envelopes", () => {
    const response =
      "Here is the plan:\n<proposed_plan>\n# Plan\n</proposed_plan>";

    expect(normalizeHistoricalProposedPlan(response)).toEqual({
      finalMessage: response,
      planText: "",
      promoted: false,
    });
  });

  it("recovers plain Markdown only when the caller identifies a Plan-mode turn", () => {
    const markdown = "# Implementation plan\n\n1. Build the first playable slice.";

    expect(normalizeHistoricalProposedPlan(markdown, null, true)).toEqual({
      finalMessage: "",
      planText: markdown,
      promoted: true,
    });
    expect(normalizeHistoricalProposedPlan(markdown)).toEqual({
      finalMessage: markdown,
      planText: "",
      promoted: false,
    });
  });

  it("detects adopted external chats without treating default imports as adopted", () => {
    expect(
      isAdoptedExternalChat({
        origin: "codex_external",
        sync_status: "adopted",
        account_id: null,
        profile_key: "default",
      }),
    ).toBe(true);
    expect(
      isAdoptedExternalChat({
        origin: "codex_external",
        sync_status: "synced",
        account_id: null,
        profile_key: "default",
      }),
    ).toBe(false);
  });

  it("builds bounded visible context from prior prompts and final answers", () => {
    const entry: TaskChatEntry = {
      clientId: "entry-1",
      workspaceId: 1,
      chatId: 2,
      turnIndex: 1,
      runId: 3,
      taskId: null,
      prompt: "Add a health endpoint",
      submittedAt: "2026-07-01T10:00:00Z",
      status: "completed",
      runView: {
        ...emptyRunView,
        status: "completed",
        finalMessage: "Added `/health` with tests.",
      },
    };

    expect(buildPreviousChatContext([entry])).toContain(
      "User prompt:\nAdd a health endpoint\nAssistant result:\nAdded `/health` with tests.",
    );
    expect(buildPreviousChatContext([])).toBeNull();
  });

  it("validates and projects inherited continuation turns without live actions", () => {
    const source = chat(9, "2026-07-01 12:00:00");
    source.continuation_snapshot_json = JSON.stringify({
      version: 1,
      sourceChatId: 4,
      context: "Previous visible conversation",
      turns: [
        {
          turnIndex: 1,
          prompt: "Plan the endpoint",
          finalMessage: "",
          completedPlan: "# Endpoint plan",
          status: "completed",
          startedAt: "2026-07-01T10:00:00Z",
          completedAt: "2026-07-01T10:01:00Z",
          durationMs: 60_000,
        },
      ],
    });

    expect(parseChatContinuationSnapshot(source.continuation_snapshot_json)).not.toBeNull();
    const entries = createTaskChatEntriesFromContinuationSnapshot(source);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      chatId: 9,
      prompt: "Plan the endpoint",
      status: "completed",
      runId: null,
    });
    expect(entries[0]?.runView.nativePlan).toMatchObject({
      completedText: "# Endpoint plan",
      reviewState: "superseded",
    });
  });

  it("rejects malformed inherited continuation snapshots", () => {
    expect(
      parseChatContinuationSnapshot(
        JSON.stringify({
          version: 1,
          sourceChatId: 4,
          context: "context",
          turns: [{ prompt: "missing required fields" }],
        }),
      ),
    ).toBeNull();
  });

  it("bounds continuation transcripts while retaining the objective and newest turn", () => {
    const turns = ["first", "middle", "newest"].map((prompt, index) => ({
      turnIndex: index + 1,
      prompt,
      finalMessage: "x".repeat(80),
      completedPlan: "",
      status: "completed" as const,
      startedAt: `2026-07-01T10:0${index}:00Z`,
      completedAt: null,
      durationMs: null,
    }));

    const bounded = boundChatContinuationTurns(turns, 100);
    expect(bounded[0]?.prompt).toBe("first");
    expect(bounded[bounded.length - 1]?.prompt).toBe("newest");
    expect(
      bounded.reduce(
        (total, turn) =>
          total + turn.prompt.length + turn.finalMessage.length + turn.completedPlan.length,
        0,
      ),
    ).toBeLessThanOrEqual(100);
  });
});
