import {
  Check,
  CircleStop,
  Clock,
  Terminal,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { RunViewState } from "../lib/codexEventReducer";
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
};

export function TaskChatTranscript({ entries, onResolveRequest }: Props) {
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
          <article className="chat-message user-message">
            <div className="chat-bubble">
              <div className="chat-bubble-header">
                <strong>You</strong>
                <span>{formatSubmittedTime(entry.submittedAt)}</span>
              </div>
              <p>{entry.prompt}</p>
            </div>
          </article>

          <article className={`chat-message assistant-message status-${entry.status}`}>
            <div className="chat-bubble">
              <div className="chat-bubble-header">
                <strong>Codex</strong>
                <span className={`run-status ${entry.status}`}>{entry.status}</span>
              </div>

              <AssistantOutput runView={entry.runView} />

              <RunApprovalRequests
                runView={entry.runView}
                onResolveRequest={onResolveRequest}
              />

              <RunDetails runView={entry.runView} />
            </div>
          </article>
        </div>
      ))}
    </section>
  );
}

function AssistantOutput({ runView }: { runView: RunViewState }) {
  if (runView.finalMessage.trim()) {
    return <p className="assistant-output">{runView.finalMessage}</p>;
  }

  if (runView.status === "failed" && runView.error) {
    return <p className="assistant-output error">{runView.error}</p>;
  }

  if (runView.status === "completed") {
    return <p className="assistant-output muted">Codex completed without a final message.</p>;
  }

  return (
    <p className="assistant-output muted">
      <Clock size={15} aria-hidden="true" />
      Codex is working...
    </p>
  );
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

function RunDetails({ runView }: { runView: RunViewState }) {
  const activityLines = runView.console.filter((line) => line.kind !== "assistant");
  const hasActivity = activityLines.length > 0;
  const hasPlan = Boolean(runView.latestPlan);
  const hasDiff = Boolean(runView.latestDiff);
  const hasMetadata = Boolean(
    runView.threadId || runView.turnId || runView.tokenUsage,
  );

  if (!hasActivity && !hasPlan && !hasDiff && !hasMetadata && runView.status !== "interrupted") {
    return null;
  }

  return (
    <div className="chat-run-details">
      {hasMetadata ? (
        <div className="run-details">
          <div>
            <strong>Thread</strong>
            <span>{runView.threadId ?? "pending"}</span>
          </div>
          <div>
            <strong>Turn</strong>
            <span>{runView.turnId ?? "pending"}</span>
          </div>
          <div>
            <strong>Token usage</strong>
            <span>
              {runView.tokenUsage
                ? `${runView.tokenUsage.totalTokens.toLocaleString()} total`
                : "pending"}
            </span>
          </div>
        </div>
      ) : null}

      {hasActivity ? (
        <details className="chat-run-disclosure">
          <summary>
            <Terminal size={15} aria-hidden="true" />
            Activity
          </summary>
          <div className="console chat-console">
            {activityLines.map((line) => (
              <p className={line.kind} key={line.id}>
                <span>{line.kind}</span>
                {line.text}
              </p>
            ))}
          </div>
        </details>
      ) : null}

      {hasPlan ? (
        <details className="chat-run-disclosure">
          <summary>Latest plan</summary>
          <pre>{runView.latestPlan}</pre>
        </details>
      ) : null}

      {hasDiff ? (
        <details className="chat-run-disclosure">
          <summary>Latest diff</summary>
          <pre>{runView.latestDiff}</pre>
        </details>
      ) : null}

      {runView.status === "interrupted" ? (
        <p className="muted chat-interrupted">
          <CircleStop size={16} />
          Run was interrupted.
        </p>
      ) : null}
    </div>
  );
}

function formatSubmittedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
