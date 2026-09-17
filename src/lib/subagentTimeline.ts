import type { SubagentTranscriptItem } from "./subagents";
import type { TimelineItem } from "./runTimeline";
import { emptyActivityStore, reduceStreamActivity, standaloneActivity, object } from "./streamActivity";
import { parseAsyncReplies } from "./asyncUserInput";

/** Project only data provided by the historical subagent endpoint. */
export function subagentTimeline(
  items: SubagentTranscriptItem[],
): TimelineItem[] {
  return items.flatMap((item): TimelineItem[] => {
    const event = { id: item.id, timestamp: "" };
    if (item.kind === "user") return parseAsyncReplies(item.text) ? [] : [{ kind: "steer", event: { ...event, kind: "steer", text: item.text, contextFiles: [], delivery: "sent" } }];
    if (item.kind === "plan") {
      const store = reduceStreamActivity(emptyActivityStore, { method: "item/completed", params: { item: { id: item.id, type: "plan", text: item.text } } }, { threadId: null, turnId: null });
      return [{ kind: "activities", id: item.id, activities: [store.byKey[store.order[0]]] }];
    }
    if (item.kind === "assistant")
      return [
        {
          kind: "event",
          event: { ...event, kind: "message", text: item.text },
        },
      ];
    if (item.kind === "reasoning")
      return item.summaries.map((text, index) => ({
        kind: "event",
        event: { ...event, id: `${item.id}:${index}`, kind: "reasoning", text },
      }));
    if (item.kind !== "activity") return [];
    if (item.protocolItem) {
      const protocolItem = object(item.protocolItem);
      const store = reduceStreamActivity(emptyActivityStore, { method: ["inProgress", "running"].includes(item.status ?? "") ? "item/started" : "item/completed", params: { item: protocolItem } }, { threadId: null, turnId: null });
      const activity = store.byKey[store.order[0]];
      if (activity) return [{ kind: "activities", id: activity.key, activities: [activity] }];
    }
    const kind =
      item.activityKind === "command"
        ? "command"
        : item.activityKind === "file"
          ? "file"
          : "activity";
    return [
      {
        kind: "event",
        event: {
          ...event,
          kind,
          text: item.label,
          statusLabel: item.status ?? undefined,
        },
      },
    ];
  }).reduce<TimelineItem[]>((items, item) => {
    const previous = items[items.length - 1];
    if (item.kind === "activities" && previous?.kind === "activities" && !item.activities.some(standaloneActivity) && !previous.activities.some(standaloneActivity)) previous.activities.push(...item.activities);
    else items.push(item);
    return items;
  }, []);
}
