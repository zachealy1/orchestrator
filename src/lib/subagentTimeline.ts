import type { SubagentTranscriptItem } from "./subagents";
import type { TimelineItem } from "./runTimeline";

/** Project only data provided by the historical subagent endpoint. */
export function subagentTimeline(
  items: SubagentTranscriptItem[],
): TimelineItem[] {
  return items.flatMap((item): TimelineItem[] => {
    const event = { id: item.id, timestamp: "" };
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
  });
}
