import { Activity, Clock3, Database, Gauge } from "lucide-react";
import type { ReactNode } from "react";
import type { AnalyticsSummary as AnalyticsSummaryType } from "../features/analytics/types";

type Props = {
  summary: AnalyticsSummaryType;
};

export function AnalyticsSummary({ summary }: Props) {
  const avgSeconds =
    summary.avg_duration_ms === null
      ? "n/a"
      : `${Math.round(summary.avg_duration_ms / 1000)}s`;

  return (
    <section className="surface analytics" aria-label="Analytics">
      <div className="surface-header">
        <div>
          <h2>Token and run health</h2>
        </div>
      </div>
      <div className="metric-grid">
        <Metric icon={<Activity size={18} />} label="Runs" value={summary.run_count} />
        <Metric icon={<Gauge size={18} />} label="Failed" value={summary.failed_count} />
        <Metric
          icon={<Database size={18} />}
          label="Tokens"
          value={summary.total_tokens.toLocaleString()}
        />
        <Metric icon={<Clock3 size={18} />} label="Avg duration" value={avgSeconds} />
      </div>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <article className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
