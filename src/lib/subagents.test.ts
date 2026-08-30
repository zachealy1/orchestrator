import { beforeEach, describe, expect, it } from "vitest";
import {
  deriveSubagentComposerModel,
  lifecycleFromChildTurn,
  lifecycleFromCollabToolCall,
  lifecycleFromSubagentTranscript,
  parseCollabToolCall,
  parseCollabToolCalls,
  parseLegacySubagentActivity,
  SubagentStore,
  type SubagentRecord,
} from "./subagents";

describe("subagent protocol", () => {
  let store: SubagentStore;

  beforeEach(() => {
    store = new SubagentStore();
  });

  it("parses modern spawn events without relying on display text", () => {
    const parsed = parseCollabToolCall({
      method: "item/completed",
      params: {
        item: {
          type: "collabToolCall",
          id: "item-1",
          tool: "spawn_agent",
          status: "completed",
          senderThreadId: "parent",
          newThreadId: "child",
          prompt: "Inspect the API",
          agentStatus: { status: "running" },
        },
      },
    });

    expect(parsed).toMatchObject({
      itemId: "item-1",
      tool: "spawn_agent",
      senderThreadId: "parent",
      childThreadId: "child",
      prompt: "Inspect the API",
      agentStatus: "running",
    });
    expect(lifecycleFromCollabToolCall(parsed!, "item/completed", null)).toBe(
      "running",
    );
  });

  it("parses current collabAgentToolCall events for every receiver", () => {
    const parsed = parseCollabToolCalls({
      method: "item/completed",
      params: {
        item: {
          type: "collabAgentToolCall",
          id: "item-current",
          tool: "wait",
          status: "completed",
          senderThreadId: "parent",
          receiverThreadIds: ["child-one", "child-two"],
          prompt: null,
          agentsStates: {
            "child-one": { status: "completed", message: null },
            "child-two": { status: "running", message: null },
          },
        },
      },
    });

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      tool: "wait_agent",
      childThreadId: "child-one",
      agentStatus: "completed",
    });
    expect(parsed[1]).toMatchObject({
      tool: "wait_agent",
      childThreadId: "child-two",
      agentStatus: "running",
    });
  });

  it("retains legacy subAgentActivity as a fallback", () => {
    expect(
      parseLegacySubagentActivity({
        method: "item/completed",
        params: {
          item: {
            type: "subAgentActivity",
            id: "legacy",
            kind: "interrupted",
            agentThreadId: "child",
            agentPath: "root/child",
          },
        },
      }),
    ).toEqual({
      itemId: "legacy",
      childThreadId: "child",
      agentPath: "root/child",
      status: "interrupted",
    });
  });

  it("rejects malformed and unknown collaboration tools", () => {
    expect(
      parseCollabToolCall({
        method: "item/started",
        params: {
          item: {
            type: "collabToolCall",
            id: "item-1",
            tool: "unknown_tool",
            senderThreadId: "parent",
            newThreadId: "child",
          },
        },
      }),
    ).toBeNull();
  });

  it("maps authoritative child turn outcomes", () => {
    expect(lifecycleFromChildTurn("turn/started")).toBe("running");
    expect(lifecycleFromChildTurn("turn/completed", "completed")).toBe(
      "completed",
    );
    expect(lifecycleFromChildTurn("turn/completed", "failed")).toBe("failed");
    expect(lifecycleFromChildTurn("turn/interrupted")).toBe("interrupted");
  });

  it("maps projected transcript state without treating an empty new thread as complete", () => {
    expect(
      lifecycleFromSubagentTranscript({
        threadId: "child",
        status: "active",
        activeTurnId: "turn-child",
        turns: [],
      }),
    ).toBe("running");
    expect(
      lifecycleFromSubagentTranscript({
        threadId: "child",
        status: "idle",
        activeTurnId: null,
        turns: [
          {
            id: "turn-child",
            status: "completed",
            startedAt: null,
            completedAt: null,
            items: [],
          },
        ],
      }),
    ).toBe("completed");
    expect(
      lifecycleFromSubagentTranscript({
        threadId: "child",
        status: "idle",
        activeTurnId: null,
        turns: [],
      }),
    ).toBeNull();
  });

  it("groups active, completed, and attention states", () => {
    const base: SubagentRecord = {
      id: "one",
      ownerClientId: "owner",
      workspaceId: 1,
      chatId: 2,
      runId: 3,
      parentTurnId: "turn-parent",
      profileKey: "account:1",
      accountId: 1,
      rootThreadId: "root",
      parentThreadId: "root",
      childThreadId: "child",
      childTurnId: "turn-child",
      spawnItemId: "spawn",
      task: "Inspect",
      depth: 0,
      status: "running",
      statusBeforeAttention: null,
      agentStatus: "running",
      needsAttention: false,
      error: null,
      finalResult: null,
      startedAt: "2026-07-29T10:00:00.000Z",
      updatedAt: "2026-07-29T10:00:00.000Z",
      completedAt: null,
    };
    const model = deriveSubagentComposerModel([
      base,
      {
        ...base,
        id: "two",
        childThreadId: "child-2",
        status: "completed",
        completedAt: "2026-07-29T10:01:00.000Z",
      },
      {
        ...base,
        id: "three",
        childThreadId: "child-3",
        status: "needs-attention",
        needsAttention: true,
      },
    ]);

    expect(model).toMatchObject({
      activeCount: 2,
      completedCount: 1,
      attentionCount: 1,
    });
  });

  it("keeps list order stable while lifecycle updates change timestamps", () => {
    const older: SubagentRecord = {
      id: "older",
      ownerClientId: "owner",
      workspaceId: 1,
      chatId: 2,
      runId: 3,
      parentTurnId: "turn-parent",
      profileKey: "account:1",
      accountId: 1,
      rootThreadId: "root",
      parentThreadId: "root",
      childThreadId: "child-older",
      childTurnId: "turn-older",
      spawnItemId: "spawn-older",
      task: "Older task",
      depth: 1,
      status: "running",
      statusBeforeAttention: null,
      agentStatus: "running",
      needsAttention: false,
      error: null,
      finalResult: null,
      startedAt: "2026-07-29T10:00:00.000Z",
      updatedAt: "2026-07-29T10:00:01.000Z",
      completedAt: null,
    };
    const newer: SubagentRecord = {
      ...older,
      id: "newer",
      childThreadId: "child-newer",
      childTurnId: "turn-newer",
      spawnItemId: "spawn-newer",
      task: "Newer task",
      startedAt: "2026-07-29T10:01:00.000Z",
      updatedAt: "2026-07-29T10:01:01.000Z",
    };

    store.replaceConversation("chat:2", [older, newer]);
    expect(store.getConversation("chat:2").map((record) => record.id)).toEqual([
      "newer",
      "older",
    ]);

    store.upsert({
      ...older,
      updatedAt: "2026-07-29T10:10:00.000Z",
    });
    expect(
      store.getConversation("chat:2").map((record) => record.id),
    ).toEqual(["newer", "older"]);
  });

  it("never stores or counts a run root thread as a subagent", () => {
    const invalidRoot: SubagentRecord = {
      id: "root",
      ownerClientId: "owner",
      workspaceId: 1,
      chatId: 2,
      runId: 3,
      parentTurnId: "turn-parent",
      profileKey: "account:1",
      accountId: 1,
      rootThreadId: "root-thread",
      parentThreadId: "child-thread",
      childThreadId: "root-thread",
      childTurnId: null,
      spawnItemId: null,
      task: "Subagent /root",
      depth: 1,
      status: "running",
      statusBeforeAttention: null,
      agentStatus: "running",
      needsAttention: false,
      error: null,
      finalResult: null,
      startedAt: "2026-08-19T16:00:00.000Z",
      updatedAt: "2026-08-19T16:00:00.000Z",
      completedAt: null,
    };

    store.replaceConversation("chat:2", [invalidRoot]);
    expect(store.getConversation("chat:2")).toHaveLength(0);

    store.upsert(invalidRoot);
    expect(store.findByThread("account:1", "root-thread")).toBeNull();
    expect(deriveSubagentComposerModel([invalidRoot])).toMatchObject({
      activeCount: 0,
      completedCount: 0,
      records: [],
    });
  });
});
