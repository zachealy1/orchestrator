import { reasoningItemKey } from "./reasoningStream";
import type {
  RunCommandActivity,
  RunToolActivity,
  RunViewState,
  StreamActivityEvent,
  StreamSteerEvent,
} from "./codexEventReducer";

export type TimelineItem =
  | { kind: "event"; event: StreamActivityEvent }
  | { kind: "steer"; event: StreamSteerEvent }
  | { kind: "commands"; id: string; commands: RunCommandActivity[] }
  | { kind: "tools"; id: string; activities: RunToolActivity[] };

export type TimelineSection = {
  id: string;
  items: Exclude<TimelineItem, { kind: "steer" }>[];
  steer?: StreamSteerEvent;
};

export function splitTimelineAtSteers(items: TimelineItem[]): TimelineSection[] {
  const sections: TimelineSection[] = [{ id: "initial", items: [] }];
  for (const item of items) {
    const section = sections[sections.length - 1];
    if (item.kind === "steer") {
      section.steer = item.event;
      sections.push({ id: item.event.id, items: [] });
    } else {
      section.items.push(item);
    }
  }
  return sections;
}

export function buildTimelineItems(runView: RunViewState): TimelineItem[] {
  const sections = splitTimelineAtSteers(runView.streamEvents.map((event) =>
    event.kind === "steer" ? { kind: "steer", event } : { kind: "event", event },
  ));
  const commandSections = new Map<string, string>();
  const toolSections = new Map<string, string>();
  for (const section of sections) {
    for (const item of section.items) {
      if (item.kind !== "event") continue;
      const owners = item.event.kind === "command" ? commandSections
        : item.event.kind === "activity" ? toolSections : null;
      for (const id of item.event.activityIds ?? []) {
        if (owners && !owners.has(id)) owners.set(id, section.id);
      }
    }
  }

  const items: TimelineItem[] = [];
  const renderedCommandIds = new Set<string>();
  const renderedToolIds = new Set<string>();
  const lastSectionId = sections[sections.length - 1].id;
  for (const section of sections) {
    const commands = runView.commands.filter((command) =>
      (commandSections.get(command.id) ?? lastSectionId) === section.id,
    );
    const tools = runView.toolActivityOrder
      .filter((id) => (toolSections.get(id) ?? lastSectionId) === section.id)
      .map((id) => runView.toolActivitiesById[id])
      .filter((activity): activity is RunToolActivity => Boolean(activity));

    for (const item of section.items) {
      if (item.kind !== "event") continue;
      const { event } = item;
      if (shouldHideFinalMessageEvent(runView, event)) continue;
      if (!event.text) continue;
      if (event.kind === "reasoning" && event.identity?.target === "reasoningContent" &&
        Object.values(runView.reasoningItems?.[reasoningItemKey(event.identity)]?.summaries ?? {}).some((text) => text.trim())) continue;
      if (event.kind === "file") {
        if (runView.editedFiles.length === 0) items.push(item);
        continue;
      }
      if (event.kind === "command") {
        const activityIds = event.activityIds;
        const selected = commands.filter((command) =>
          !renderedCommandIds.has(command.id) &&
          (!activityIds?.length || activityIds.includes(command.id)),
        );
        if (selected.length > 0) {
          items.push({ kind: "commands", id: `commands-${event.id}`, commands: selected });
          selected.forEach((command) => renderedCommandIds.add(command.id));
        } else if (runView.commands.length === 0) {
          items.push(item);
        }
        continue;
      }
      if (event.kind === "activity") {
        const referencesKnownTool = event.activityIds?.some((id) => runView.toolActivitiesById[id]);
        if (referencesKnownTool) {
          const referencesSectionTool = event.activityIds?.some((id) => toolSections.get(id) === section.id);
          const selected = referencesSectionTool
            ? tools.filter((activity) => event.activityIds?.includes(activity.id) && !renderedToolIds.has(activity.id)) : [];
          if (selected.length > 0) {
            items.push({ kind: "tools", id: `tools-${event.id}`, activities: selected });
            selected.forEach((activity) => renderedToolIds.add(activity.id));
          }
          continue;
        }
      }
      items.push(item);
    }

    const remainingCommands = commands.filter((command) => !renderedCommandIds.has(command.id));
    if (remainingCommands.length > 0) {
      items.push({ kind: "commands", id: `${section.id}:commands-remaining`, commands: remainingCommands });
      remainingCommands.forEach((command) => renderedCommandIds.add(command.id));
    }
    const remainingTools = tools.filter((activity) => !renderedToolIds.has(activity.id));
    if (remainingTools.length > 0) {
      items.push({ kind: "tools", id: `${section.id}:tools-remaining`, activities: remainingTools });
      remainingTools.forEach((activity) => renderedToolIds.add(activity.id));
    }
    if (section.steer) items.push({ kind: "steer", event: section.steer });
  }
  return items.reduce<TimelineItem[]>((grouped, item) => {
    const previous = grouped[grouped.length - 1];
    if (item.kind === "commands" && previous?.kind === "commands") {
      grouped[grouped.length - 1] = { ...previous, commands: [...previous.commands, ...item.commands] };
    } else if (item.kind === "tools" && previous?.kind === "tools" &&
      previous.activities[0]?.category === item.activities[0]?.category) {
      grouped[grouped.length - 1] = { ...previous, activities: [...previous.activities, ...item.activities] };
    } else grouped.push(item);
    return grouped;
  }, []);
}

function shouldHideFinalMessageEvent(runView: RunViewState, event: StreamActivityEvent) {
  if (event.kind !== "message") return false;
  const activityIds = event.activityIds ?? [];
  if (activityIds.some((id) =>
    runView.agentMessagesById[id]?.phase === "final_answer" || id === runView.finalMessageItemId,
  )) return true;
  const completed = ["completed", "failed", "interrupted"].includes(runView.status);
  return completed && activityIds.length === 0 && runView.finalMessage.trim().length > 0 &&
    event.text.trim() === runView.finalMessage.trim();
}
