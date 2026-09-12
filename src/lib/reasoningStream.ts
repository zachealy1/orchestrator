import { streamIdentity } from "./streamIdentity";
import type { CodexMessage } from "../features/codex/types";
import type { StreamIdentity } from "./streamIdentity";

export type ReasoningItemState = {
  identity: StreamIdentity;
  summaries: Record<number, string>;
  content: Record<number, string>;
  completed: boolean;
};

export function reasoningItemKey(identity: StreamIdentity) {
  return JSON.stringify([identity.threadId, identity.turnId, identity.itemId]);
}

export function updateReasoningItem(
  items: Record<string, ReasoningItemState>,
  message: CodexMessage,
) {
  const identity = streamIdentity(message);
  const key = reasoningItemKey(identity);
  const current = items[key] ?? {
    identity,
    summaries: {},
    content: {},
    completed: false,
  };
  const params = message.params ?? {};
  if (
    message.method === "item/completed" ||
    message.method === "item/started"
  ) {
    if (current.completed && message.method === "item/started") return items;
    const item = params.item as { summary?: unknown[]; content?: unknown[] };
    const parts = (
      values: unknown[] | undefined,
      fallback: Record<number, string>,
    ) =>
      values
        ? Object.fromEntries(
            values.map((value, index) => [
              index,
              typeof value === "string"
                ? value
                : String((value as { text?: string })?.text ?? ""),
            ]),
          )
        : fallback;
    return {
      ...items,
      [key]: {
        ...current,
        summaries: parts(item.summary, current.summaries),
        content: parts(item.content, current.content),
        completed: message.method === "item/completed",
      },
    };
  }
  if (current.completed) return items;
  const target =
    identity.target === "reasoningSummary" ? "summaries" : "content";
  const index = identity.partIndex ?? 0;
  const delta = typeof params.delta === "string" ? params.delta : "";
  return {
    ...items,
    [key]: {
      ...current,
      [target]: {
        ...current[target],
        [index]: (current[target][index] ?? "") + delta,
      },
    },
  };
}
