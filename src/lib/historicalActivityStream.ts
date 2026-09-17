import { applyCodexMessage, addSteerPrompt, settleSteerPrompt, emptyRunView, type RunViewState } from "./codexEventReducer";
import { object, string } from "./streamActivity";
import { parseAsyncReplies } from "./asyncUserInput";
import type { CodexMessage } from "../features/codex/types";

export function mergeHistoricalActivityStream(current: RunViewState, incoming: CodexMessage[] = [], prompt = ""): RunViewState {
  if (!incoming.length) return current;
  const events = new Map<string, { method: string; params: Record<string, unknown> }>();
  // Pages arrive newest first; each page itself is already chronological.
  for (const event of [...incoming, ...(current.historicalStreamEvents ?? [])]) {
    if (!event.method) continue;
    const params = object(event.params); const item = object(params.item);
    const key = params.sequence != null ? `sequence:${params.sequence}` : JSON.stringify([params.threadId, params.turnId, event.method, params.itemId ?? item.id ?? params.message ?? params.hookRunId ?? object(params.run).id ?? params.reviewId]);
    events.set(key, { method: event.method, params });
  }
  const ordered = [...events.values()].sort((a, b) => typeof a.params.sequence === "number" && typeof b.params.sequence === "number" ? a.params.sequence - b.params.sequence : 0);
  let replay: RunViewState = { ...emptyRunView, profileKey: current.profileKey, threadId: current.threadId, turnId: current.turnId, status: "running" };
  for (const event of ordered) {
    const item = object(event.params.item);
    if (event.params.threadId && event.params.threadId !== replay.threadId) continue;
    // One local run may span several turns (for example, a continued Goal).
    // Its recorded turn identity, rather than the run's latest turn, owns replay.
    const turnId = string(event.params.turnId);
    if (turnId && (!event.params.threadId || event.params.threadId === replay.threadId)) replay = { ...replay, turnId };
    if (["userMessage", "steeringUserMessage"].includes(string(item.type))) {
      const text = string(item.text) || (Array.isArray(item.content) ? item.content.map(c => string(object(c).text)).join("\n") : "");
      if (text && text.trim() !== prompt.trim() && !parseAsyncReplies(text)) {
        const id = `history-steer:${string(item.id)}`;
        replay = settleSteerPrompt(addSteerPrompt(replay, { id, text, timestamp: "", contextFiles: [] }), id, true);
      }
      continue;
    }
    replay = applyCodexMessage(replay, event);
  }
  if (["completed", "failed", "interrupted"].includes(current.status)) replay = applyCodexMessage(replay, { method: "turn/completed", params: { turn: { status: current.status } } });
  return { ...current, historicalStreamEvents: ordered, activities: replay.activities, streamEvents: replay.streamEvents,
    nativePlan: replay.nativePlan.planItemId ? { ...current.nativePlan, ...replay.nativePlan } : current.nativePlan,
    planProgress: replay.planProgress ?? current.planProgress,
    commands: replay.commands.length ? replay.commands : current.commands,
    toolActivitiesById: replay.toolActivitiesById, toolActivityOrder: replay.toolActivityOrder,
    reasoningItems: replay.reasoningItems, agentMessagesById: { ...current.agentMessagesById, ...replay.agentMessagesById },
    finalMessageItemId: replay.finalMessageItemId ?? current.finalMessageItemId,
    generatedImagesById: { ...current.generatedImagesById, ...replay.generatedImagesById },
    generatedImageOrder: Array.from(new Set([...current.generatedImageOrder, ...replay.generatedImageOrder])),
  };
}
