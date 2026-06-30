import {
  Check,
  Clock,
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
              <div className="chat-bubble-header meta-only">
                <span>{formatSubmittedTime(entry.submittedAt)}</span>
              </div>
              <div className="chat-message-body user-prompt" aria-label="Submitted prompt">
                {entry.prompt}
              </div>
            </div>
          </article>

          <article className={`chat-message assistant-message status-${entry.status}`}>
            <div className="chat-bubble">
              <AssistantOutput runView={entry.runView} />

              <RunApprovalRequests
                runView={entry.runView}
                onResolveRequest={onResolveRequest}
              />
            </div>
          </article>
        </div>
      ))}
    </section>
  );
}

function AssistantOutput({ runView }: { runView: RunViewState }) {
  if (runView.finalMessage.trim()) {
    return (
      <div className="chat-message-body assistant-output" aria-label="Assistant response">
        {runView.finalMessage}
      </div>
    );
  }

  if (runView.status === "failed" && runView.error) {
    return (
      <div
        className="chat-message-body assistant-output error"
        aria-label="Assistant error"
      >
        {runView.error}
      </div>
    );
  }

  if (runView.status === "completed") {
    return (
      <div
        className="chat-message-body assistant-output muted"
        aria-label="Assistant response"
      >
        Completed without a final message.
      </div>
    );
  }

  return (
    <div className="chat-message-body assistant-output muted" aria-label="Assistant status">
      <Clock size={15} aria-hidden="true" />
      Working...
    </div>
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
