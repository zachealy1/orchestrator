import { applyCodexMessage, type RunViewState } from "../../lib/codexEventReducer";
import { object } from "../../lib/asyncUserInput";

/** History pages are newest-first; replay messages in causal order, across pages. */
export function mergeHistoricalAsyncMessages(view: RunViewState, messages: unknown[]) {
  const ordered = [...messages].reverse().filter(item => !object(item).threadId || object(item).threadId === view.threadId).sort((a, b) => Number(object(a).sequence ?? 0) - Number(object(b).sequence ?? 0));
  let state = { ...view, agentMessagesById: {}, streamEvents: [] as RunViewState["streamEvents"] };
  for (const item of ordered) state = applyCodexMessage(state, { method: "item/completed", params: {
    threadId: view.threadId, turnId: view.turnId, item,
  } });
  // Older pages precede already loaded replies; duplicate message/client IDs are removed by the reducer.
  for (const event of view.streamEvents) {
    if (event.kind !== "steer" || !event.asyncReplyClientId) {
      if (!state.streamEvents.some(existing => existing.id === event.id)) state.streamEvents.push(event);
      continue;
    }
    state = applyCodexMessage(state, { method: "item/completed", params: { item: {
      type: "userMessage", id: event.asyncReplyServerId ?? event.id, clientId: event.asyncReplyClientId,
      content: [{ type: "text", text: event.text }],
    } } });
  }
  return { agentMessagesById: { ...state.agentMessagesById, ...view.agentMessagesById }, streamEvents: state.streamEvents };
}
