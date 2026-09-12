import {
  Activity,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  GitPullRequest,
  Globe2,
  MessageSquare,
  Search,
  Terminal,
  Users,
  Wrench,
} from "lucide-react";
import { memo, useState, useEffect, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type {
  RunCommandActivity,
  RunToolActivity,
  StreamActivityEvent,
} from "../lib/codexEventReducer";
import type { TimelineItem } from "../lib/runTimeline";
import { TRANSCRIPT_MARKDOWN_PLUGINS } from "../lib/markdownPlugins";
import { normalizePreviewableMarkdownLinks } from "../lib/summaryLinks";
import { prepareStreamingMarkdown } from "../lib/streamingMarkdown";
import { transcriptMarkdownUrlTransform } from "./TranscriptMarkdownImage";
import { usePreviewableMarkdownComponents } from "./useTranscriptMarkdown";
import {
  captureTranscriptViewportAnchor,
  restoreTranscriptViewportAnchor,
} from "../lib/transcriptScrollAnchor";

export const CommandsGroup = memo(function CommandsGroup({
  commands,
}: {
  commands: RunCommandActivity[];
}) {
  const [outputOpen, setOutputOpen] = useState<Record<string, boolean>>({});
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
  const renderCommand = (command: RunCommandActivity) => (
    <div
      className={`run-activity-item command-row is-${command.status}`}
      key={command.id}
    >
      <span>{commandActionLabel(command.status)}</span>
      <span className="activity-command-text">{command.command}</span>
      {command.durationMs !== null ? (
        <span>for {formatDuration(command.durationMs)}</span>
      ) : null}
      {command.output ? (
        <details
          className="command-output"
          open={outputOpen[command.id] ?? false}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            setOutputOpen((current) =>
              current[command.id] === open
                ? current
                : { ...current, [command.id]: open },
            );
          }}
        >
          <summary>Output</summary>
          <pre>{command.output}</pre>
        </details>
      ) : null}
    </div>
  );
  return (
    <div className="command-activity-groups">
      {activityRuns(commands, (command) => command.status === "completed").map(
        (run) =>
          run.collapsed ? (
            <details
              className="run-activity-group command-runs"
              key={run.items[0].id}
              open={
                groupOpen[run.items[0].id] ??
                run.items.some((command) => outputOpen[command.id])
              }
              onToggle={(event) => {
                const open = event.currentTarget.open;
                const expected =
                  groupOpen[run.items[0].id] ??
                  run.items.some((command) => outputOpen[command.id]);
                if (open !== expected)
                  setGroupOpen((current) => ({
                    ...current,
                    [run.items[0].id]: open,
                  }));
              }}
            >
              <summary>
                <span className="run-activity-title">
                  <Terminal size={15} aria-hidden="true" />
                  Ran {run.items.length}{" "}
                  {run.items.length === 1 ? "command" : "commands"}
                </span>
                <ChevronDown size={15} aria-hidden="true" />
              </summary>
              <div className="run-activity-items">
                {run.items.map(renderCommand)}
              </div>
            </details>
          ) : (
            <div className="run-activity-items" key={run.items[0].id}>
              {run.items.map(renderCommand)}
            </div>
          ),
      )}
    </div>
  );
});

export const ToolActivitiesGroup = memo(function ToolActivitiesGroup({
  activities,
}: {
  activities: RunToolActivity[];
}) {
  return (
    <div className="tool-activity-groups">
      {activityRuns(activities, (activity) =>
        ["completed", "recovered"].includes(activity.status),
      ).map((run) => {
        if (!run.collapsed)
          return (
            <div key={run.items[0].id}>
              {run.items.map((activity) => (
                <ToolActivityRow activity={activity} key={activity.id} />
              ))}
            </div>
          );
        const completed = run.items.filter(
          (activity) => activity.status === "completed",
        );
        return (
          <details
            className="run-activity-group tool-runs"
            key={run.items[0].id}
          >
            <summary>
              <span className="run-activity-title">
                {toolCategoryIcon(summaryToolCategory(completed), 15)}
                {completedToolSummary(
                  completed,
                  run.items.length - completed.length,
                )}
              </span>
              <ChevronDown size={15} aria-hidden="true" />
            </summary>
            <div className="run-activity-items">
              {run.items.map((activity) => (
                <ToolActivityRow activity={activity} key={activity.id} />
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
});

const ToolActivityRow = memo(function ToolActivityRow({
  activity,
}: {
  activity: RunToolActivity;
}) {
  return (
    <div
      className={`run-activity-item tool-activity-row is-${activity.status}`}
      aria-label={`${activity.label}, ${toolActivityStatusLabel(activity.status)}`}
    >
      <span className="tool-activity-icon" aria-hidden="true">
        {toolCategoryIcon(activity.category, 15)}
      </span>
      <span className="tool-activity-label" title={activity.label}>
        {activity.label}
      </span>
      {activity.durationMs !== null ? (
        <span className="tool-activity-duration">
          {formatDuration(activity.durationMs)}
        </span>
      ) : null}
      {activity.safeDetails.length > 0 ? (
        <span className="tool-activity-details">
          {activity.safeDetails.map((detail) => (
            <span key={`${detail.label}:${detail.value}`}>
              <span className="sr-only">{detail.label}: </span>
              {detail.value}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
});

function toolCategoryIcon(category: RunToolActivity["category"], size: number) {
  switch (category) {
    case "browser":
      return <Globe2 size={size} aria-hidden="true" />;
    case "github":
      return <GitPullRequest size={size} aria-hidden="true" />;
    case "search":
      return <Search size={size} aria-hidden="true" />;
    case "collaboration":
      return <Users size={size} aria-hidden="true" />;
    default:
      return <Wrench size={size} aria-hidden="true" />;
  }
}

function summaryToolCategory(activities: RunToolActivity[]) {
  const category = activities[0]?.category ?? "integration";
  return activities.every((activity) => activity.category === category)
    ? category
    : "integration";
}

function completedToolSummary(
  activities: RunToolActivity[],
  recoveredCount = 0,
) {
  if (activities.length === 0) {
    return `${recoveredCount} ${
      recoveredCount === 1 ? "retry" : "retries"
    } recovered`;
  }
  const category = summaryToolCategory(activities);
  const categoryLabel =
    category === "integration"
      ? ""
      : category === "collaboration"
        ? " collaboration"
        : ` ${category}`;
  const completedSummary = `Used ${activities.length}${categoryLabel} ${
    activities.length === 1 ? "tool" : "tools"
  }`;
  return recoveredCount > 0
    ? `${completedSummary} · ${recoveredCount} ${
        recoveredCount === 1 ? "retry" : "retries"
      } recovered`
    : completedSummary;
}

function toolActivityStatusLabel(status: RunToolActivity["status"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "recovered":
      return "Recovered after retry";
    case "declined":
      return "Declined";
    case "interrupted":
      return "Interrupted";
    default:
      return "Failed";
  }
}

export const StreamEventRow = memo(function StreamEventRow({
  event,
  onOpenTranscriptLink,
}: {
  event: StreamActivityEvent;
  onOpenTranscriptLink?: (href: string) => boolean;
}) {
  const markdownComponents =
    usePreviewableMarkdownComponents(onOpenTranscriptLink);
  if (event.kind === "message") {
    return (
      <div className="stream-message" key={event.id}>
        <ReactMarkdown
          components={markdownComponents}
          {...TRANSCRIPT_MARKDOWN_PLUGINS}
          urlTransform={transcriptMarkdownUrlTransform}
        >
          {prepareStreamingMarkdown(
            normalizePreviewableMarkdownLinks(event.text),
          )}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div className={`stream-event ${event.kind}`} key={event.id}>
      {streamEventIcon(event.kind)}
      <span>{event.text}</span>
      {event.statusLabel ? (
        <span className="subagent-transcript-activity-status">
          {event.statusLabel}
        </span>
      ) : null}
    </div>
  );
});

function streamEventIcon(kind: StreamActivityEvent["kind"]) {
  switch (kind) {
    case "command":
      return <Terminal size={15} aria-hidden="true" />;
    case "file":
      return <FileText size={15} aria-hidden="true" />;
    case "reasoning":
      return <BrainCircuit size={15} aria-hidden="true" />;
    case "message":
      return <MessageSquare size={15} aria-hidden="true" />;
    default:
      return <Activity size={15} aria-hidden="true" />;
  }
}

export function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}hr ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function commandActionLabel(status: RunCommandActivity["status"]) {
  if (status === "failed") {
    return "Failed";
  }
  if (status === "declined") {
    return "Skipped";
  }
  if (status === "running") {
    return "Running";
  }
  if (status === "awaiting-approval") {
    return "Awaiting approval";
  }
  if (status === "pending") {
    return "Preparing";
  }
  return "Ran";
}

export function ActivityTimeline({
  items,
  onOpenTranscriptLink,
  renderSteer,
}: {
  items: TimelineItem[];
  onOpenTranscriptLink?: (href: string) => boolean;
  renderSteer?: (
    event: Extract<TimelineItem, { kind: "steer" }>["event"],
  ) => ReactNode;
}) {
  if (!items.length) return null;
  return (
    <div className="stream-event-list" aria-label="App-server stream">
      {items.map((item) =>
        item.kind === "steer" ? (
          <div key={item.event.id}>{renderSteer?.(item.event)}</div>
        ) : item.kind === "commands" ? (
          <div
            className="run-activity-groups"
            aria-label="Run activity groups"
            key={item.id}
          >
            <CommandsGroup commands={item.commands} />
          </div>
        ) : item.kind === "tools" ? (
          <div
            className="run-activity-groups"
            aria-label="Run activity groups"
            key={item.id}
          >
            <ToolActivitiesGroup activities={item.activities} />
          </div>
        ) : (
          <StreamEventRow
            key={item.event.id}
            event={item.event}
            onOpenTranscriptLink={onOpenTranscriptLink}
          />
        ),
      )}
    </div>
  );
}

export function activityStatusLabel(status: string, elapsedMs: number) {
  if (
    ["running", "active", "inProgress", "idle", "connecting"].includes(status)
  )
    return elapsedMs < 1000
      ? "Working"
      : `Working for ${formatDuration(elapsedMs)}`;
  if (["interrupted", "cancelled", "canceled"].includes(status))
    return `You stopped after ${formatDuration(elapsedMs)}`;
  if (status === "failed") return `Failed after ${formatDuration(elapsedMs)}`;
  return `Worked for ${formatDuration(elapsedMs)}`;
}

export function attentionTimelineItems(items: TimelineItem[]): TimelineItem[] {
  return items.flatMap((item): TimelineItem[] => {
    if (item.kind === "commands") {
      const commands = item.commands.filter(
        (command) => command.status !== "completed",
      );
      return commands.length ? [{ ...item, commands }] : [];
    }
    if (item.kind === "tools") {
      const activities = item.activities.filter(
        (activity) => !["completed", "recovered"].includes(activity.status),
      );
      return activities.length ? [{ ...item, activities }] : [];
    }
    return [];
  });
}

export function ActivityDisclosure({
  active,
  label,
  metrics,
  ariaLabel = "Run trace",
  onExpand,
  attention,
  children,
}: {
  active: boolean;
  label: string;
  metrics?: ReactNode;
  ariaLabel?: string;
  onExpand?: () => void;
  attention?: ReactNode;
  children: ReactNode;
}) {
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? active;
  useEffect(() => {
    if (open) onExpand?.();
  }, [open, onExpand]);
  return (
    <>
      <details
        className="stream-trace"
        open={open}
        onToggle={(event) => {
          if (event.currentTarget.open !== open)
            setChoice(event.currentTarget.open);
        }}
      >
        <summary
          className="run-live-metrics"
          aria-label={ariaLabel}
          onClick={(event) => {
            const scroller = event.currentTarget.closest<HTMLElement>(
              "[data-virtuoso-scroller]",
            );
            const anchor = captureTranscriptViewportAnchor(scroller);
            if (anchor)
              requestAnimationFrame(() =>
                restoreTranscriptViewportAnchor(anchor),
              );
          }}
        >
          <span>
            <Clock size={15} aria-hidden="true" />
            {label}
          </span>
          {metrics ? (
            <span className="stream-secondary-metrics">{metrics}</span>
          ) : null}
          <ChevronRight
            className="run-trace-chevron"
            size={15}
            aria-hidden="true"
          />
        </summary>
        {open ? children : null}
      </details>
      {!open ? attention : null}
    </>
  );
}

function activityRuns<T>(items: T[], collapse: (item: T) => boolean) {
  return items.reduce<Array<{ collapsed: boolean; items: T[] }>>(
    (runs, item) => {
      const collapsed = collapse(item);
      const previous = runs[runs.length - 1];
      if (previous?.collapsed === collapsed) previous.items.push(item);
      else runs.push({ collapsed, items: [item] });
      return runs;
    },
    [],
  );
}
