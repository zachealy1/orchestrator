import { memo } from "react";

type OrchestratorMarkProps = {
  className?: string;
};

export const OrchestratorMark = memo(function OrchestratorMark({
  className,
}: OrchestratorMarkProps) {
  const classes = ["orchestrator-mark", className].filter(Boolean).join(" ");

  return (
    <svg
      className={classes}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="orchestrator-mark-connector"
        d="M21 13h22a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H21a8 8 0 0 1-8-8V21a8 8 0 0 1 8-8Zm0 6a2 2 0 0 0-2 2v22a2 2 0 0 0 2 2h22a2 2 0 0 0 2-2V21a2 2 0 0 0-2-2H21Z"
      />
      <rect
        className="orchestrator-mark-node orchestrator-mark-node-primary"
        x="4"
        y="4"
        width="24"
        height="24"
        rx="7"
      />
      <rect
        className="orchestrator-mark-node orchestrator-mark-node-surface"
        x="36"
        y="4"
        width="24"
        height="24"
        rx="7"
      />
      <rect
        className="orchestrator-mark-node orchestrator-mark-node-success"
        x="4"
        y="36"
        width="24"
        height="24"
        rx="7"
      />
      <rect
        className="orchestrator-mark-node orchestrator-mark-node-surface"
        x="36"
        y="36"
        width="24"
        height="24"
        rx="7"
      />
    </svg>
  );
});
