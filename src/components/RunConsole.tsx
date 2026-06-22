import { Check, CircleStop, Terminal, X } from "lucide-react";
import type { CodexMessage } from "../types";
import type { RunViewState } from "../lib/codexEventReducer";

type Props = {
  runView: RunViewState;
  onResolveRequest: (request: CodexMessage, approved: boolean) => void;
};

export function RunConsole({ runView, onResolveRequest }: Props) {
  return (
    <section className="surface console-surface" aria-label="Codex run console">
      <div className="surface-header">
        <div>
          <p className="eyebrow">Codex</p>
          <h2>Run console</h2>
        </div>
        <span className={`run-status ${runView.status}`}>{runView.status}</span>
      </div>

      {runView.serverRequests.length > 0 ? (
        <div className="approval-stack">
          {runView.serverRequests.map((request) => (
            <article className="approval" key={String(request.id)}>
              <div>
                <strong>{request.method}</strong>
                <pre>{JSON.stringify(request.params ?? {}, null, 2)}</pre>
              </div>
              <div className="approval-actions">
                <button className="small" type="button" onClick={() => onResolveRequest(request, true)}>
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
      ) : null}

      <div className="console">
        {runView.console.length === 0 ? (
          <p className="muted">
            <Terminal size={16} />
            Codex events will stream here after a run starts.
          </p>
        ) : (
          runView.console.map((line) => (
            <p className={line.kind} key={line.id}>
              <span>{line.kind}</span>
              {line.text}
            </p>
          ))
        )}
      </div>

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

      {runView.latestPlan ? (
        <div className="codex-block">
          <strong>Latest plan</strong>
          <pre>{runView.latestPlan}</pre>
        </div>
      ) : null}

      {runView.latestDiff ? (
        <div className="codex-block">
          <strong>Latest diff</strong>
          <pre>{runView.latestDiff}</pre>
        </div>
      ) : null}

      {runView.status === "interrupted" ? (
        <p className="muted">
          <CircleStop size={16} />
          Run was interrupted.
        </p>
      ) : null}
    </section>
  );
}
