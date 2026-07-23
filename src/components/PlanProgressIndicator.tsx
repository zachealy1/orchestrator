import {
  CircleAlert,
  CircleX,
  LoaderCircle,
  Pause,
  ShieldCheck,
} from "lucide-react";
import { memo } from "react";
import type {
  PlanProgressIndicatorModel,
  PlanProgressIndicatorState,
} from "../lib/planProgress";

type Props = {
  progress: PlanProgressIndicatorModel;
};

const STATE_LABELS: Record<PlanProgressIndicatorState, string> = {
  "in-progress": "In progress",
  paused: "Paused",
  "waiting-approval": "Waiting for approval",
  blocked: "Blocked",
  failed: "Failed",
};

export const PlanProgressIndicator = memo(function PlanProgressIndicator({
  progress,
}: Props) {
  const stateLabel = STATE_LABELS[progress.state];

  return (
    <div
      className="plan-progress-indicator"
      data-state={progress.state}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <ProgressIcon state={progress.state} />
      <strong>
        Step {progress.currentStep} / {progress.totalSteps}
      </strong>
      {progress.stepLabel ? (
        <span className="plan-progress-label" title={progress.stepLabel}>
          {progress.stepLabel}
        </span>
      ) : null}
      <span className="plan-progress-state">{stateLabel}</span>
      <span className="plan-progress-track" aria-hidden="true">
        <span
          className="plan-progress-fill"
          style={{ width: `${progress.progressPercent}%` }}
        />
        {progress.state === "in-progress" ? (
          <span
            className="plan-progress-pulse"
            style={{ left: `${progress.progressPercent}%` }}
          />
        ) : null}
      </span>
    </div>
  );
});

function ProgressIcon({ state }: { state: PlanProgressIndicatorState }) {
  switch (state) {
    case "in-progress":
      return <LoaderCircle className="plan-progress-spinner" size={15} />;
    case "paused":
      return <Pause size={15} />;
    case "waiting-approval":
      return <ShieldCheck size={15} />;
    case "blocked":
      return <CircleAlert size={15} />;
    case "failed":
      return <CircleX size={15} />;
  }
}
