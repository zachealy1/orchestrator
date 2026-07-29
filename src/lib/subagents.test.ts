import { describe, expect, it } from "vitest";
import {
  deriveSubagentComposerModel,
  lifecycleFromChildTurn,
  lifecycleFromCollabToolCall,
  parseCollabToolCall,
  parseCollabToolCalls,
  parseLegacySubagentActivity,
  type SubagentRecord,
} from "./subagents";

describe("subagent protocol", () => {
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
});
