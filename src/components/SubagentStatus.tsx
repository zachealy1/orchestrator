import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleX,
  LoaderCircle,
  Pause,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import {
  deriveSubagentComposerModel,
  isActiveSubagentStatus,
  subagentDurationMs,
  type SubagentLifecycleStatus,
  type SubagentRecord,
} from "../lib/subagents";
import {
  ComposerStripRow,
  type ComposerStripTone,
} from "./ComposerStripRow";

type Props = {
  records: readonly SubagentRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInspect: (subagent: SubagentRecord) => void;
};

type PopoverRow =
  | { kind: "header"; id: string; label: string; count: number }
  | { kind: "subagent"; id: string; record: SubagentRecord };

export const SubagentStatus = memo(function SubagentStatus({
  records,
  open,
  onOpenChange,
  onInspect,
}: Props) {
  const model = useMemo(() => deriveSubagentComposerModel(records), [records]);
  const popoverRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const rows = useMemo(() => buildPopoverRows(model.records), [model.records]);

  useEffect(() => {
    if (!open || model.activeCount === 0) return;
    const interval = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [model.activeCount, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        popoverRef.current?.contains(target) ||
        toggleRef.current?.contains(target)
      ) {
        return;
      }
      onOpenChange(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenChange(false);
      toggleRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onOpenChange, open]);

  useEffect(() => {
    if (records.length === 0 && open) onOpenChange(false);
  }, [onOpenChange, open, records.length]);

  if (records.length === 0) return null;

  const counts = `${model.activeCount} active · ${model.completedCount} completed`;
  const status =
    model.attentionCount > 0
      ? `${model.attentionCount} need${model.attentionCount === 1 ? "s" : ""} attention`
      : null;

  return (
    <ComposerStripRow
      className="subagent-status-row"
      state={model.attentionCount > 0 ? "needs-attention" : "active"}
      tone={model.attentionCount > 0 ? "attention" : subagentRowTone(model)}
      icon={<Bot size={15} aria-hidden="true" />}
      title="Subagents"
      description={counts}
      status={status}
      statusTitle={status ?? undefined}
      trailing={
        open ? (
          <ChevronDown size={15} aria-hidden="true" />
        ) : (
          <ChevronUp size={15} aria-hidden="true" />
        )
      }
      interactive={{
        buttonRef: toggleRef,
        label: `Subagents, ${counts}${status ? `, ${status}` : ""}. ${
          open ? "Close" : "Open"
        } subagent list`,
        expanded: open,
        controls: "subagent-status-popover",
        onClick: () => onOpenChange(!open),
      }}
    >
      {open ? (
        <div
          ref={popoverRef}
          id="subagent-status-popover"
          className="subagent-status-popover"
          role="region"
          aria-label="Subagents"
        >
          <Virtuoso
            className="subagent-status-list"
            data={rows}
            computeItemKey={(_, row) => row.id}
            increaseViewportBy={120}
            itemContent={(_, row) =>
              row.kind === "header" ? (
                <div className="subagent-status-section-heading">
                  <span>{row.label}</span>
                  <span>{row.count}</span>
                </div>
              ) : (
                <SubagentListItem
                  record={row.record}
                  nowMs={nowMs}
                  onClick={() => {
                    onInspect(row.record);
                    onOpenChange(false);
                  }}
                />
              )
            }
          />
        </div>
      ) : null}
    </ComposerStripRow>
  );
});

function buildPopoverRows(records: readonly SubagentRecord[]): PopoverRow[] {
  const active = records.filter((record) =>
    isActiveSubagentStatus(record.status),
  );
  const completed = records.filter(
    (record) => !isActiveSubagentStatus(record.status),
  );
  const rows: PopoverRow[] = [];
  if (active.length > 0) {
    rows.push({
      kind: "header",
      id: "active-heading",
      label: "Active",
      count: active.length,
    });
    active.forEach((record) =>
      rows.push({ kind: "subagent", id: record.id, record }),
    );
  }
  if (completed.length > 0) {
    rows.push({
      kind: "header",
      id: "completed-heading",
      label: "Completed",
      count: completed.length,
    });
    completed.forEach((record) =>
      rows.push({ kind: "subagent", id: record.id, record }),
    );
  }
  return rows;
}

const SubagentListItem = memo(function SubagentListItem({
  record,
  nowMs,
  onClick,
}: {
  record: SubagentRecord;
  nowMs: number;
  onClick: () => void;
}) {
  const status = statusLabel(record.status);
  const parentContext = record.parentTurnId
    ? `Parent turn ${compactId(record.parentTurnId)}`
    : `Depth ${Math.max(1, record.depth)}`;
  return (
    <button
      className="subagent-status-item"
      type="button"
      onClick={onClick}
      aria-label={`${record.task || "Subagent"}. ${status}. Open inspector`}
    >
      <span className="subagent-status-item-icon">
        <SubagentStatusIcon status={record.status} />
      </span>
      <span className="subagent-status-item-copy">
        <span title={record.task}>{record.task || "Subagent task"}</span>
        <small>
          {parentContext} · {formatElapsed(subagentDurationMs(record, nowMs))}
        </small>
      </span>
      <span
        className="subagent-status-item-state"
        data-status={record.status}
      >
        {status}
      </span>
    </button>
  );
});

function subagentRowTone(
  model: ReturnType<typeof deriveSubagentComposerModel>,
): ComposerStripTone {
  if (model.activeCount > 0) return "active";
  return "success";
}

export function SubagentStatusIcon({
  status,
}: {
  status: SubagentLifecycleStatus;
}) {
  switch (status) {
    case "starting":
    case "running":
    case "stopping":
      return <LoaderCircle className="spin" size={15} aria-hidden="true" />;
    case "waiting":
      return <Pause size={15} aria-hidden="true" />;
    case "needs-attention":
      return <CircleAlert size={15} aria-hidden="true" />;
    case "completed":
      return <CheckCircle2 size={15} aria-hidden="true" />;
    case "failed":
      return <CircleX size={15} aria-hidden="true" />;
    case "interrupted":
    case "stopped":
      return <CircleX size={15} aria-hidden="true" />;
  }
}

export function statusLabel(status: SubagentLifecycleStatus) {
  switch (status) {
    case "starting":
      return "Starting";
    case "running":
      return "Running";
    case "waiting":
      return "Waiting";
    case "needs-attention":
      return "Needs attention";
    case "stopping":
      return "Stopping";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "interrupted":
      return "Interrupted";
    case "stopped":
      return "Stopped";
  }
}

function compactId(value: string) {
  return value.length <= 10 ? value : value.slice(-8);
}

function formatElapsed(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}hr ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
