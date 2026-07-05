import {
  Activity,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  MessageSquare,
  Pencil,
  Terminal,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type {
  RunCommandActivity,
  RunEditedFile,
  RunViewState,
  StreamEvent,
} from "../lib/codexEventReducer";
import type { CodexMessage } from "../types";

export type TaskChatEntry = {
  workspaceId: number;
  runId: number;
  taskId: number;
  prompt: string;
  submittedAt: string;
  status: RunViewState["status"];
  runView: RunViewState;
};

type Props = {
  entries: TaskChatEntry[];
  onResolveRequest: (request: CodexMessage, approved: boolean) => void;
  onOpenFileLink?: (href: string) => boolean;
};

export function TaskChatTranscript({
  entries,
  onResolveRequest,
  onOpenFileLink,
}: Props) {
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) {
      return;
    }

    transcript.scrollTop = transcript.scrollHeight;
  }, [entries]);

  return (
    <section
      className="task-chat-transcript"
      aria-label="Task chat transcript"
      ref={transcriptRef}
    >
      {entries.map((entry) => (
        <div className="task-chat-run" key={entry.runId}>
          <article className="submitted-prompt" aria-label="Submitted prompt">
            {entry.prompt}
          </article>
          <article className={`chat-message assistant-message status-${entry.status}`}>
            <AssistantRunOutput
              runView={entry.runView}
              onResolveRequest={onResolveRequest}
              onOpenFileLink={onOpenFileLink}
            />
          </article>
        </div>
      ))}
    </section>
  );
}

function AssistantRunOutput({
  runView,
  onResolveRequest,
  onOpenFileLink,
}: {
  runView: RunViewState;
  onResolveRequest: (request: CodexMessage, approved: boolean) => void;
  onOpenFileLink?: (href: string) => boolean;
}) {
  const completed =
    runView.status === "completed" ||
    runView.status === "failed" ||
    runView.status === "interrupted";

  if (completed) {
    const hasTrace =
      runView.streamEvents.length > 0 ||
      runView.editedFiles.length > 0 ||
      runView.commands.length > 0;

    return (
      <div className="run-output-surface completed">
        {hasTrace ? (
          <RunTraceDropdown runView={runView} />
        ) : (
          <RunMetrics runView={runView} />
        )}
        <RunSummary runView={runView} onOpenFileLink={onOpenFileLink} />
        <RunApprovalRequests
          runView={runView}
          onResolveRequest={onResolveRequest}
        />
      </div>
    );
  }

  const hasTimeline =
    runView.streamEvents.length > 0 ||
    runView.editedFiles.length > 0 ||
    runView.commands.length > 0;

  return (
    <div className="run-output-surface running" aria-label="Live run output">
      <RunMetrics runView={runView} />
      {hasTimeline ? (
        <RunTimeline runView={runView} />
      ) : (
        <p className="stream-placeholder">
          <Clock size={15} aria-hidden="true" />
          Waiting for app-server output...
        </p>
      )}
      <RunApprovalRequests runView={runView} onResolveRequest={onResolveRequest} />
    </div>
  );
}

function RunTraceDropdown({ runView }: { runView: RunViewState }) {
  return (
    <details className="stream-trace">
      <summary className="run-live-metrics" aria-label="Run trace">
        <span>
          <Clock size={15} aria-hidden="true" />
          {formatDuration(runView.elapsedMs)}
        </span>
        <span>{formatTokenCount(runView)}</span>
        <ChevronRight className="run-trace-chevron" size={15} aria-hidden="true" />
      </summary>
      <RunTimeline runView={runView} />
    </details>
  );
}

function RunMetrics({ runView }: { runView: RunViewState }) {
  return (
    <div className="run-live-metrics" aria-label="Run metrics">
      <span>
        <Clock size={15} aria-hidden="true" />
        {formatDuration(runView.elapsedMs)}
      </span>
      <span>{formatTokenCount(runView)}</span>
    </div>
  );
}

function RunSummary({
  runView,
  onOpenFileLink,
}: {
  runView: RunViewState;
  onOpenFileLink?: (href: string) => boolean;
}) {
  if (runView.status === "failed" && runView.error) {
    return (
      <div className="run-summary error" aria-label="Run error">
        {runView.error}
      </div>
    );
  }

  if (!runView.finalMessage.trim()) {
    return (
      <div className="run-summary muted" aria-label="Run summary">
        Completed without a final message.
      </div>
    );
  }

  return (
    <div className="run-summary markdown-summary" aria-label="Run summary">
      <ReactMarkdown
        components={{
          a: ({ href, children, ...props }) => (
            <a
              {...props}
              href={href}
              onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
                if (href && onOpenFileLink?.(href)) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {runView.finalMessage}
      </ReactMarkdown>
    </div>
  );
}

function RunTimeline({ runView }: { runView: RunViewState }) {
  const items = buildTimelineItems(runView);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="stream-event-list" aria-label="App-server stream">
      {items.map((item) => {
        if (item.kind === "files") {
          return (
            <RunActivityGroups key={item.id}>
              <EditedFilesGroup files={item.files} />
            </RunActivityGroups>
          );
        }

        if (item.kind === "commands") {
          return (
            <RunActivityGroups key={item.id}>
              <CommandsGroup commands={item.commands} />
            </RunActivityGroups>
          );
        }

        return <StreamEventRow event={item.event} key={item.event.id} />;
      })}
    </div>
  );
}

function RunActivityGroups({ children }: { children: ReactNode }) {
  return (
    <div className="run-activity-groups" aria-label="Run activity groups">
      {children}
    </div>
  );
}

type TimelineItem =
  | { kind: "event"; event: StreamEvent }
  | { kind: "files"; id: string; files: RunEditedFile[] }
  | { kind: "commands"; id: string; commands: RunCommandActivity[] };

function buildTimelineItems(runView: RunViewState): TimelineItem[] {
  const items: TimelineItem[] = [];
  const renderedFilePaths = new Set<string>();
  const renderedCommandIds = new Set<string>();

  for (const event of runView.streamEvents) {
    if (event.kind === "file") {
      const files = selectFilesForEvent(
        runView.editedFiles,
        event.activityIds,
        renderedFilePaths,
      );

      if (files.length > 0) {
        items.push({ kind: "files", id: `files-${event.id}`, files });
        files.forEach((file) => renderedFilePaths.add(file.path));
      } else if (runView.editedFiles.length === 0) {
        items.push({ kind: "event", event });
      }
      continue;
    }

    if (event.kind === "command") {
      const commands = selectCommandsForEvent(
        runView.commands,
        event.activityIds,
        renderedCommandIds,
      );

      if (commands.length > 0) {
        items.push({ kind: "commands", id: `commands-${event.id}`, commands });
        commands.forEach((command) => renderedCommandIds.add(command.id));
      } else if (runView.commands.length === 0) {
        items.push({ kind: "event", event });
      }
      continue;
    }

    items.push({ kind: "event", event });
  }

  const remainingFiles = runView.editedFiles.filter(
    (file) => !renderedFilePaths.has(file.path),
  );
  if (remainingFiles.length > 0) {
    items.push({ kind: "files", id: "files-remaining", files: remainingFiles });
  }

  const remainingCommands = runView.commands.filter(
    (command) => !renderedCommandIds.has(command.id),
  );
  if (remainingCommands.length > 0) {
    items.push({
      kind: "commands",
      id: "commands-remaining",
      commands: remainingCommands,
    });
  }

  return items;
}

function selectFilesForEvent(
  files: RunEditedFile[],
  activityIds: string[] | undefined,
  renderedFilePaths: Set<string>,
) {
  if (files.length === 0) {
    return [];
  }

  if (!activityIds || activityIds.length === 0) {
    return renderedFilePaths.size === 0 ? files : [];
  }

  const activityIdSet = new Set(activityIds);
  return files.filter(
    (file) => activityIdSet.has(file.path) && !renderedFilePaths.has(file.path),
  );
}

function selectCommandsForEvent(
  commands: RunCommandActivity[],
  activityIds: string[] | undefined,
  renderedCommandIds: Set<string>,
) {
  if (commands.length === 0) {
    return [];
  }

  if (!activityIds || activityIds.length === 0) {
    return renderedCommandIds.size === 0 ? commands : [];
  }

  const activityIdSet = new Set(activityIds);
  return commands.filter(
    (command) =>
      activityIdSet.has(command.id) && !renderedCommandIds.has(command.id),
  );
}

function EditedFilesGroup({ files }: { files: RunEditedFile[] }) {
  return (
    <details className="run-activity-group edited-files">
      <summary>
        <span className="run-activity-title">
          <Pencil size={15} aria-hidden="true" />
          Edited {files.length} {files.length === 1 ? "file" : "files"}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="run-activity-items">
        {files.map((file) => (
          <div className="run-activity-item edited-file-row" key={file.path}>
            <span>{fileActionLabel(file.status)}</span>
            <span className="activity-file-name" title={file.path}>
              {file.name}
            </span>
            <span className="activity-additions">+{file.additions}</span>
            <span className="activity-deletions">-{file.deletions}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function CommandsGroup({ commands }: { commands: RunCommandActivity[] }) {
  return (
    <details className="run-activity-group command-runs">
      <summary>
        <span className="run-activity-title">
          <Terminal size={15} aria-hidden="true" />
          Ran {commands.length} {commands.length === 1 ? "command" : "commands"}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="run-activity-items">
        {commands.map((command) => (
          <div className="run-activity-item command-row" key={command.id}>
            <span>{commandActionLabel(command.status)}</span>
            <span className="activity-command-text">{command.command}</span>
            {command.durationMs !== null ? (
              <span>for {formatDuration(command.durationMs)}</span>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}

function StreamEventRow({ event }: { event: StreamEvent }) {
  if (event.kind === "message") {
    return (
      <div className="stream-message" key={event.id}>
        {event.text}
      </div>
    );
  }

  return (
    <div className={`stream-event ${event.kind}`} key={event.id}>
      {streamEventIcon(event.kind)}
      <span>{event.text}</span>
    </div>
  );
}

function streamEventIcon(kind: StreamEvent["kind"]) {
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

function RunApprovalRequests({
  runView,
  onResolveRequest,
}: {
  runView: RunViewState;
  onResolveRequest: (request: CodexMessage, approved: boolean) => void;
}) {
  if (runView.serverRequests.length === 0) {
    return null;
  }

  return (
    <div className="approval-stack chat-approval-stack">
      {runView.serverRequests.map((request) => (
        <article className="approval" key={String(request.id)}>
          <div>
            <strong>{request.method}</strong>
            <pre>{JSON.stringify(request.params ?? {}, null, 2)}</pre>
          </div>
          <div className="approval-actions">
            <button
              className="small"
              type="button"
              onClick={() => onResolveRequest(request, true)}
            >
              <Check size={15} />
              Approve
            </button>
            <button
              className="small danger"
              type="button"
              onClick={() => onResolveRequest(request, false)}
            >
              <X size={15} />
              Deny
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatTokenCount(runView: RunViewState) {
  return `${(runView.tokenUsage?.totalTokens ?? 0).toLocaleString()} tokens`;
}

function fileActionLabel(status: RunEditedFile["status"]) {
  switch (status) {
    case "added":
      return "Added";
    case "deleted":
      return "Deleted";
    case "renamed":
      return "Renamed";
    case "copied":
      return "Copied";
    default:
      return "Edited";
  }
}

function commandActionLabel(status: RunCommandActivity["status"]) {
  if (status === "failed") {
    return "Failed";
  }
  if (status === "running") {
    return "Running";
  }
  return "Ran";
}
