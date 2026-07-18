import { describe, expect, it } from "vitest";
import {
  coalesceFrameBatchedCodexMessages,
  shouldFrameBatchCodexMessage,
} from "./codexNotificationBatch";

describe("codex notification batching", () => {
  it("batches only high-frequency display deltas", () => {
    expect(
      shouldFrameBatchCodexMessage({ method: "item/agentMessage/delta" }),
    ).toBe(true);
    expect(
      shouldFrameBatchCodexMessage({ method: "thread/tokenUsage/updated" }),
    ).toBe(false);
    expect(shouldFrameBatchCodexMessage({ method: "turn/completed" })).toBe(
      false,
    );
  });

  it("coalesces adjacent deltas for the same stream without reordering work", () => {
    const messages = coalesceFrameBatchedCodexMessages([
      {
        method: "item/agentMessage/delta",
        params: { threadId: "t", turnId: "1", itemId: "a", delta: "Hel" },
      },
      {
        method: "item/agentMessage/delta",
        params: { threadId: "t", turnId: "1", itemId: "a", delta: "lo" },
      },
      {
        method: "item/reasoning/textDelta",
        params: { threadId: "t", turnId: "1", itemId: "r", delta: "Think" },
      },
      {
        method: "item/agentMessage/delta",
        params: { threadId: "t", turnId: "1", itemId: "a", delta: " again" },
      },
    ]);

    expect(messages).toHaveLength(3);
    expect(messages[0]?.params?.delta).toBe("Hello");
    expect(messages[1]?.method).toBe("item/reasoning/textDelta");
    expect(messages[2]?.params?.delta).toBe(" again");
  });

  it("keeps different item streams separate", () => {
    const messages = coalesceFrameBatchedCodexMessages([
      {
        method: "item/agentMessage/delta",
        params: { itemId: "a", delta: "A" },
      },
      {
        method: "item/agentMessage/delta",
        params: { itemId: "b", delta: "B" },
      },
    ]);

    expect(messages).toHaveLength(2);
  });
});
