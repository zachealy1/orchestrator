import {
  Circle,
  CircleAlert,
  CircleCheck,
  CircleX,
  LoaderCircle,
  Pause,
  ShieldCheck,
} from "lucide-react";
import { memo, useId, useState } from "react";
import {
  ComposerStripRow,
  type ComposerStripTone,
} from "./ComposerStripRow";
import type {
  PlanProgressIndicatorModel,
  PlanProgressIndicatorState,
  RunPlanStepStatus,
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
  const tooltipId = useId();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const tooltipVisible = isHovered || isFocused;

  return (
    <ComposerStripRow
      className="plan-progress-indicator"
      state={progress.state}
      tone={planProgressTone(progress.state)}
      tooltipVisible={tooltipVisible}
      tabIndex={0}
      ariaDescribedBy={tooltipVisible ? tooltipId : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      contentRole="status"
      contentAriaLive="polite"
      contentAriaAtomic
      icon={<ProgressIcon state={progress.state} />}
      title={`Step ${progress.currentStep} / ${progress.totalSteps}`}
      description={progress.stepLabel || null}
      descriptionTitle={progress.stepLabel || undefined}
      status={stateLabel}
      statusTitle={stateLabel}
      trailing={
        <span className="plan-progress-track" aria-hidden="true">
          <span
            className="plan-progress-fill"
            style={{ width: `${progress.progressPercent}%` }}
          />
        </span>
      }
    >
      <div
        id={tooltipId}
        className="plan-progress-tooltip"
        role="tooltip"
        aria-hidden={!tooltipVisible}
      >
        <ol className="plan-progress-tooltip-list">
          {progress.steps.map((step, index) => {
            const label = STEP_STATUS_LABELS[step.status];
            return (
              <li
                key={`${index}:${step.step}`}
                className="plan-progress-tooltip-step"
                data-status={step.status}
                aria-label={`${label}: ${step.step || `Step ${index + 1}`}`}
              >
                <StepStatusIcon status={step.status} />
                <span>{step.step || `Step ${index + 1}`}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </ComposerStripRow>
  );
});

function planProgressTone(
  state: PlanProgressIndicatorState,
): ComposerStripTone {
  switch (state) {
    case "in-progress":
      return "active";
    case "paused":
      return "muted";
    case "waiting-approval":
    case "blocked":
      return "attention";
    case "failed":
      return "danger";
  }
}

const STEP_STATUS_LABELS: Record<RunPlanStepStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
  paused: "Paused",
  blocked: "Blocked",
  failed: "Failed",
  cancelled: "Cancelled",
  unknown: "Status unavailable",
};

function ProgressIcon({ state }: { state: PlanProgressIndicatorState }) {
  switch (state) {
    case "in-progress":
      return (
        <LoaderCircle
          className="plan-progress-spinner"
          size={15}
          aria-hidden="true"
        />
      );
    case "paused":
      return <Pause size={15} aria-hidden="true" />;
    case "waiting-approval":
      return <ShieldCheck size={15} aria-hidden="true" />;
    case "blocked":
      return <CircleAlert size={15} aria-hidden="true" />;
    case "failed":
      return <CircleX size={15} aria-hidden="true" />;
  }
}

function StepStatusIcon({ status }: { status: RunPlanStepStatus }) {
  switch (status) {
    case "completed":
      return <CircleCheck size={14} aria-hidden="true" />;
    case "in_progress":
      return (
        <LoaderCircle
          className="plan-progress-tooltip-spinner"
          size={14}
          aria-hidden="true"
        />
      );
    case "paused":
      return <Pause size={14} aria-hidden="true" />;
    case "blocked":
      return <CircleAlert size={14} aria-hidden="true" />;
    case "failed":
    case "cancelled":
      return <CircleX size={14} aria-hidden="true" />;
    case "pending":
    case "unknown":
      return <Circle size={14} aria-hidden="true" />;
  }
}
