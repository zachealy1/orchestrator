import { memo } from "react";
import orchestratorMark from "../assets/brand/orchestrator-mark.png";

export const OrchestratorBetaBrand = memo(function OrchestratorBetaBrand() {
  return (
    <div className="orchestrator-beta-brand" aria-label="Orchestrator beta">
      <img
        className="orchestrator-beta-brand-mark"
        src={orchestratorMark}
        alt=""
        aria-hidden="true"
      />
      <span className="orchestrator-beta-brand-name">Orchestrator</span>
      <span className="orchestrator-beta-tag">BETA</span>
    </div>
  );
});
