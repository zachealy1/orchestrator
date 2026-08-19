import {
  CircleAlert,
  CircleCheck,
  Gauge,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  X,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import {
  ComposerStripRow,
  type ComposerStripTone,
} from "./ComposerStripRow";
import {
  goalElapsedSeconds,
  type GoalProgressIndicatorModel,
  type ThreadGoalStatus,
} from "../lib/goalProgress";

type Props = {
  progress: GoalProgressIndicatorModel;
  onPause: () => void;
  onResume: () => void;
  onEdit: () => void;
  onStop: () => void;
};

const STATUS_LABELS: Record<ThreadGoalStatus, string> = {
  active: "In progress",
  paused: "Paused",
  blocked: "Blocked",
  usageLimited: "Usage limited",
  budgetLimited: "Budget limited",
  complete: "Complete",
};

export const GoalProgressIndicator = memo(function GoalProgressIndicator({
  progress,
  onPause,
  onResume,
  onEdit,
  onStop,
}: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    if (progress.status !== "active") return;

    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [progress.observedAtMs, progress.status]);

  const pending = progress.actionPending !== null;
  const statusLabel =
    progress.actionPending === "pausing"
      ? "Pausing"
      : progress.actionPending === "resuming"
        ? "Resuming"
        : progress.actionPending === "stopping"
          ? "Stopping"
          : progress.actionPending === "editing"
            ? "Preparing edit"
            : STATUS_LABELS[progress.status];
  const elapsed = formatGoalDuration(goalElapsedSeconds(progress, nowMs));
  const canPause = progress.status === "active";
  const canResume = progress.status === "paused";
  const actionLabel = canPause ? "Pause goal" : canResume ? "Resume goal" : null;

  return (
    <ComposerStripRow
      className="goal-progress-indicator"
      state={progress.status}
      tone={goalProgressTone(progress.status)}
      ariaLabel="Goal progress"
      icon={
        <GoalStatusIcon
          status={progress.status}
          pending={progress.actionPending}
        />
      }
      title="Goal"
      meta={elapsed}
      description={progress.objective}
      descriptionTitle={progress.objective}
      descriptionAriaLabel={`Goal: ${progress.objective}`}
      status={statusLabel}
      statusTitle={statusLabel}
      statusAriaLive="polite"
      trailing={
        <>
          {actionLabel ? (
            <button
              className="native-plan-icon-action goal-progress-action implement"
              type="button"
              onClick={canPause ? onPause : onResume}
              disabled={pending}
              aria-label={actionLabel}
              data-tooltip={actionLabel}
            >
              {canPause ? (
                <Pause size={15} aria-hidden="true" />
              ) : (
                <Play size={15} aria-hidden="true" />
              )}
            </button>
          ) : null}
          <button
            className="native-plan-icon-action goal-progress-action"
            type="button"
            onClick={onEdit}
            disabled={pending}
            aria-label="Edit goal"
            data-tooltip="Edit goal"
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
          <button
            className="native-plan-icon-action goal-progress-action cancel"
            type="button"
            onClick={onStop}
            disabled={pending}
            aria-label="Stop goal"
            data-tooltip="Stop goal"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </>
      }
    />
  );
});

function goalProgressTone(status: ThreadGoalStatus): ComposerStripTone {
  switch (status) {
    case "active":
      return "active";
    case "paused":
      return "muted";
    case "blocked":
    case "usageLimited":
    case "budgetLimited":
      return "attention";
    case "complete":
      return "success";
  }
}

function GoalStatusIcon({
  status,
  pending,
}: {
  status: ThreadGoalStatus;
  pending: GoalProgressIndicatorModel["actionPending"];
}) {
  if (pending || status === "active") {
    return (
      <LoaderCircle
        className="goal-progress-spinner"
        size={15}
        aria-hidden="true"
      />
    );
  }
  if (status === "paused") {
    return <Pause size={15} aria-hidden="true" />;
  }
  if (status === "usageLimited" || status === "budgetLimited") {
    return <Gauge size={15} aria-hidden="true" />;
  }
  if (status === "complete") {
    return <CircleCheck size={15} aria-hidden="true" />;
  }
  return <CircleAlert size={15} aria-hidden="true" />;
}

function formatGoalDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}hr ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
