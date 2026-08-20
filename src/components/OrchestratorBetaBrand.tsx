import { memo } from "react";
import { OrchestratorMark } from "./OrchestratorMark";

export const OrchestratorBetaBrand = memo(function OrchestratorBetaBrand() {
  return (
    <div className="orchestrator-beta-brand" aria-label="Orchestrator beta">
      <OrchestratorMark className="orchestrator-beta-brand-mark" />
      <span className="orchestrator-beta-brand-name">Orchestrator</span>
      <span className="orchestrator-beta-tag">BETA</span>
    </div>
  );
});
