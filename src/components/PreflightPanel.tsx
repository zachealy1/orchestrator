import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { PreflightReport, RecommendationDraft } from "../types";

type Props = {
  report: PreflightReport | null;
  onApplyRecommendation: (recommendation: RecommendationDraft) => void;
};

export function PreflightPanel({ report, onApplyRecommendation }: Props) {
  if (!report) {
    return (
      <section className="surface preflight" aria-label="Preflight">
        <div className="surface-header">
          <div>
            <p className="eyebrow">Preflight</p>
            <h2>Advisory checks</h2>
          </div>
        </div>
        <p className="muted">Run preflight to inspect the workspace, Codex setup, prompt budget, and routing recommendation.</p>
      </section>
    );
  }

  return (
    <section className="surface preflight" aria-label="Preflight">
      <div className="surface-header">
        <div>
          <p className="eyebrow">Preflight</p>
          <h2>Advisory checks</h2>
        </div>
        <span className="budget">
          {report.tokenEstimate.toLocaleString()} / {report.contextBudget.toLocaleString()}
        </span>
      </div>

      <div className="check-list">
        {report.checks.map((check) => (
          <article className={`check ${check.status}`} key={check.id}>
            {iconFor(check.status)}
            <div>
              <strong>{check.label}</strong>
              <p>{check.message}</p>
              {check.detail ? <small>{check.detail}</small> : null}
            </div>
          </article>
        ))}
      </div>

      {report.recommendations.length > 0 ? (
        <div className="recommendations">
          <h3>Recommendations</h3>
          {report.recommendations.map((recommendation) => (
            <article className="recommendation" key={`${recommendation.kind}-${recommendation.title}`}>
              <div>
                <strong>{recommendation.title}</strong>
                <p>{recommendation.body}</p>
              </div>
              <button
                className="small secondary"
                type="button"
                onClick={() => onApplyRecommendation(recommendation)}
              >
                Apply
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function iconFor(status: string) {
  if (status === "pass") return <CheckCircle2 size={18} />;
  if (status === "warn") return <AlertTriangle size={18} />;
  if (status === "fail") return <XCircle size={18} />;
  return <Info size={18} />;
}
