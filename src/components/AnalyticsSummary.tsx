import {
  Activity,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  Gauge,
  Layers3,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AnalyticsActivityPoint,
  AnalyticsDateRange,
  AnalyticsSummary as AnalyticsSummaryType,
} from "../features/analytics/types";
import type { Workspace } from "../features/workspaces/types";
import { ComposerSelect } from "./ComposerSelect";

type Props = {
  summary: AnalyticsSummaryType;
  activity: AnalyticsActivityPoint[];
  workspaces: Workspace[];
  workspaceFilter: number[] | null;
  range: AnalyticsDateRange;
  loading?: boolean;
  onWorkspaceFilterChange: (workspaceIds: number[] | null) => void;
  onRangeChange: (range: AnalyticsDateRange) => void;
};

const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
] satisfies Array<{ value: AnalyticsDateRange; label: string }>;

export function AnalyticsSummary({
  summary,
  activity,
  workspaces,
  workspaceFilter,
  range,
  loading = false,
  onWorkspaceFilterChange,
  onRangeChange,
}: Props) {
  const terminalRuns = summary.completed_count + summary.failed_count;
  const successRate = percentage(summary.completed_count, terminalRuns);
  const cacheRate = percentage(summary.cached_tokens, summary.total_tokens);
  const freshTokens = Math.max(0, summary.total_tokens - summary.cached_tokens);

  return (
    <section
      className={`analytics-dashboard${loading ? " is-loading" : ""}`}
      aria-label="Analytics"
      aria-busy={loading}
    >
      <header className="analytics-page-header">
        <div className="analytics-page-heading">
          <h1>Analytics</h1>
        </div>
        <div className="analytics-page-filters" aria-label="Analytics filters">
          <WorkspaceFilter
            workspaces={workspaces}
            value={workspaceFilter}
            onChange={onWorkspaceFilterChange}
          />
          <ComposerSelect
            ariaLabel="Date range"
            className="analytics-date-select"
            value={range}
            options={RANGE_OPTIONS}
            placeholder="Choose a date range"
            icon={<CalendarDays size={17} />}
            onChange={(value) => onRangeChange(value as AnalyticsDateRange)}
          />
        </div>
      </header>

      <div className="analytics-metric-grid">
        <Metric
          icon={<Activity size={20} />}
          label="Total runs"
          value={summary.run_count.toLocaleString()}
          detail={`${terminalRuns.toLocaleString()} finished`}
        />
        <Metric
          icon={<CheckCircle2 size={20} />}
          label="Success rate"
          value={formatPercent(successRate)}
          detail={`${summary.completed_count.toLocaleString()} completed`}
          tone="success"
        />
        <Metric
          icon={<Database size={20} />}
          label="Total tokens"
          value={formatCompactNumber(summary.total_tokens)}
          detail={`${formatPercent(cacheRate)} cached`}
        />
        <Metric
          icon={<Clock3 size={20} />}
          label="Average duration"
          value={formatDuration(summary.avg_duration_ms)}
          detail="Across finished runs"
        />
      </div>

      <div className="analytics-main-grid">
        <article className="analytics-card analytics-activity-card">
          <div className="analytics-card-header">
            <div>
              <h2>Run activity</h2>
              <p>Daily outcomes for the selected scope</p>
            </div>
            <div className="analytics-legend" aria-label="Chart legend">
              <span><i className="completed" />Completed</span>
              <span><i className="failed" />Failed</span>
            </div>
          </div>
          <ActivityChart points={activity} />
        </article>

        <article className="analytics-card analytics-health-card">
          <div className="analytics-card-header">
            <div>
              <h2>Run health</h2>
              <p>Finished run outcomes</p>
            </div>
          </div>
          <div className="analytics-health-visual">
            <div
              className="analytics-health-ring"
              style={{ "--success-angle": `${successRate * 3.6}deg` } as CSSProperties}
              role="img"
              aria-label={`${formatPercent(successRate)} success rate`}
            >
              <div>
                <strong>{formatPercent(successRate)}</strong>
                <span>Success rate</span>
              </div>
            </div>
          </div>
          <div className="analytics-health-breakdown">
            <div>
              <span><i className="completed" />Successful</span>
              <strong>{summary.completed_count.toLocaleString()}</strong>
            </div>
            <div>
              <span><i className="failed" />Failed</span>
              <strong>{summary.failed_count.toLocaleString()}</strong>
            </div>
          </div>
        </article>
      </div>

      <article className="analytics-card analytics-token-card">
        <div className="analytics-token-main">
          <div className="analytics-card-header">
            <div>
              <h2>Token efficiency</h2>
              <p>How much context was reused</p>
            </div>
            <span className="analytics-cache-badge">{formatPercent(cacheRate)} cached</span>
          </div>
          <div
            className="analytics-token-track"
            role="img"
            aria-label={`${formatPercent(cacheRate)} cached tokens and ${formatPercent(100 - cacheRate)} fresh tokens`}
          >
            <span style={{ width: `${cacheRate}%` }} />
          </div>
          <div className="analytics-token-stats">
            <div>
              <span><i className="cached" />Cached</span>
              <strong>{formatCompactNumber(summary.cached_tokens)}</strong>
            </div>
            <div>
              <span><i className="fresh" />Fresh</span>
              <strong>{formatCompactNumber(freshTokens)}</strong>
            </div>
          </div>
        </div>
        <AnalyticsInsights
          cacheRate={cacheRate}
          successRate={successRate}
          totalRuns={terminalRuns}
        />
      </article>
    </section>
  );
}

function WorkspaceFilter({
  workspaces,
  value,
  onChange,
}: {
  workspaces: Workspace[];
  value: number[] | null;
  onChange: (workspaceIds: number[] | null) => void;
}) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selected = value
    ? workspaces.filter((workspace) => value.includes(workspace.id))
    : workspaces;
  const allSelected = value === null;
  const label = allSelected
    ? "All workspaces"
    : selected.length === 1
      ? selected[0]?.label ?? "1 workspace"
      : `${selected.length} workspaces`;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function toggleWorkspace(workspaceId: number) {
    if (value === null) {
      onChange([workspaceId]);
      return;
    }
    const next = value.includes(workspaceId)
      ? value.filter((id) => id !== workspaceId)
      : [...value, workspaceId];
    if (next.length === 0 || next.length === workspaces.length) {
      onChange(null);
      return;
    }
    onChange(next);
  }

  return (
    <div className={`analytics-workspace-filter${open ? " open" : ""}`} ref={rootRef}>
      <button
        className="analytics-filter-trigger"
        type="button"
        ref={triggerRef}
        aria-label="Filter by workspace"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={workspaces.length === 0}
        onClick={() => setOpen((current) => !current)}
      >
        <Layers3 size={17} aria-hidden="true" />
        <span>{label}</span>
        <b>{selected.length}</b>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="analytics-workspace-menu" id={menuId} role="menu">
          <div className="analytics-workspace-menu-heading">
            <strong>Filter workspaces</strong>
            <span>Select one or more</span>
          </div>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={allSelected}
            onClick={() => onChange(null)}
          >
            <span className="analytics-filter-check" aria-hidden="true">
              {allSelected ? <Check size={13} /> : null}
            </span>
            <span>All workspaces</span>
            <small>{workspaces.length}</small>
          </button>
          <div className="analytics-workspace-menu-separator" />
          {workspaces.map((workspace) => {
            const isSelected = value === null || value.includes(workspace.id);
            return (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={isSelected}
                key={workspace.id}
                onClick={() => toggleWorkspace(workspace.id)}
              >
                <span className="analytics-filter-check" aria-hidden="true">
                  {isSelected ? <Check size={13} /> : null}
                </span>
                <span title={workspace.path}>{workspace.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
  tone = "accent",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail: string;
  tone?: "accent" | "success";
}) {
  return (
    <article className={`analytics-metric analytics-metric-${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      <i>{icon}</i>
    </article>
  );
}

function ActivityChart({ points }: { points: AnalyticsActivityPoint[] }) {
  const gradientId = useId().replace(/:/g, "");
  const dimensions = { width: 760, height: 266, left: 44, right: 12, top: 14, bottom: 32 };
  const plotWidth = dimensions.width - dimensions.left - dimensions.right;
  const plotHeight = dimensions.height - dimensions.top - dimensions.bottom;
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => [point.completed_count, point.failed_count]),
  );
  const roundedMax = Math.max(4, Math.ceil(maxValue / 4) * 4);
  const x = (index: number) =>
    dimensions.left + (points.length <= 1 ? 0 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) =>
    dimensions.top + plotHeight - (value / roundedMax) * plotHeight;
  const completedPath = linePath(points.map((point) => point.completed_count), x, y);
  const failedPath = linePath(points.map((point) => point.failed_count), x, y);
  const completedArea = points.length
    ? `${completedPath} L ${x(points.length - 1)} ${dimensions.top + plotHeight} L ${x(0)} ${dimensions.top + plotHeight} Z`
    : "";
  const labelIndexes = useMemo(() => {
    if (points.length <= 1) return points.length ? [0] : [];
    return [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  }, [points.length]);

  if (points.length === 0) {
    return (
      <div className="analytics-chart-empty">
        <TrendingUp size={22} />
        <strong>No run activity yet</strong>
        <span>Runs in this scope will appear here.</span>
      </div>
    );
  }

  return (
    <div className="analytics-chart-wrap">
      <svg
        className="analytics-chart"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        role="img"
        aria-label="Completed and failed runs over time"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-primary)" stopOpacity="0.24" />
            <stop offset="1" stopColor="var(--color-primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = (roundedMax / 4) * tick;
          const tickY = y(value);
          return (
            <g key={tick}>
              <line
                x1={dimensions.left}
                x2={dimensions.left + plotWidth}
                y1={tickY}
                y2={tickY}
              />
              <text x={dimensions.left - 10} y={tickY + 4} textAnchor="end">
                {Math.round(value)}
              </text>
            </g>
          );
        })}
        {completedArea ? <path className="analytics-chart-area" d={completedArea} fill={`url(#${gradientId})`} /> : null}
        <path className="analytics-chart-line completed" d={completedPath} />
        <path className="analytics-chart-line failed" d={failedPath} />
        {labelIndexes.map((index) => {
          const point = points[index];
          return point ? (
            <text
              className="analytics-chart-x-label"
              x={x(index)}
              y={dimensions.height - 5}
              textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
              key={point.date}
            >
              {formatChartDate(point.date)}
            </text>
          ) : null;
        })}
      </svg>
    </div>
  );
}

function AnalyticsInsights({
  cacheRate,
  successRate,
  totalRuns,
}: {
  cacheRate: number;
  successRate: number;
  totalRuns: number;
}) {
  const cacheInsight = cacheRate >= 30
    ? { title: "Great caching", body: "Cached context is reducing repeated token usage." }
    : { title: "Caching opportunity", body: "Reusing more context can reduce fresh token usage." };
  const healthInsight = totalRuns === 0
    ? { title: "Waiting for runs", body: "Health guidance appears after a run finishes." }
    : successRate >= 90
      ? { title: "Healthy run rate", body: "Most finished runs are completing successfully." }
      : { title: "Review failures", body: "Failed runs are having a meaningful impact on health." };

  return (
    <div className="analytics-insights">
      <div>
        <span><Sparkles size={17} /></span>
        <p><strong>{cacheInsight.title}</strong>{cacheInsight.body}</p>
      </div>
      <div>
        <span><Gauge size={17} /></span>
        <p><strong>{healthInsight.title}</strong>{healthInsight.body}</p>
      </div>
    </div>
  );
}

function linePath(
  values: number[],
  x: (index: number) => number,
  y: (value: number) => number,
) {
  return values
    .map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`)
    .join(" ");
}

function percentage(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

function formatPercent(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toFixed(Number.isInteger(rounded) ? 0 : 1)}%`;
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDuration(value: number | null) {
  if (value === null) return "n/a";
  const seconds = Math.max(0, Math.round(value / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function formatChartDate(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(`${date}T00:00:00`),
  );
}
