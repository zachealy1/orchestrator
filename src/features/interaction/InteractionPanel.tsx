import {
  AlertCircle,
  CheckCircle2,
  Hand,
  Loader2,
  Monitor,
  Pause,
  ShieldCheck,
  Square,
} from "lucide-react";
import { useMemo } from "react";
import type { RunToolActivity } from "../../lib/codexEventReducer";
import type { InteractionSession } from "./types";

export function InteractionPanel({
  session,
  latestActivity,
  onStop,
}: {
  session: InteractionSession | null;
  latestActivity: RunToolActivity | null;
  onStop: () => void;
}) {
  const surface = useMemo(
    () =>
      session?.currentSurfaceId
        ? session.surfaces[session.currentSurfaceId] ?? null
        : Object.values(session?.surfaces ?? {})[0] ?? null,
    [session],
  );
  if (!session || Object.keys(session.surfaces).length === 0) {
    return null;
  }

  const terminal = ["completed", "failed", "stopped"].includes(session.state);
  const status = interactionStatus(session, latestActivity);

  return (
    <aside className="interaction-panel" aria-label="Agent interaction">
      <div className="interaction-panel-preview" aria-hidden="true">
        <Monitor size={18} />
      </div>
      <div className="interaction-panel-summary">
        <div className="interaction-panel-heading">
          <strong>{surface?.title || "Agent interaction"}</strong>
          <span className={`interaction-state interaction-state-${session.state}`}>
            {status.label}
          </span>
        </div>
        <div className="interaction-panel-detail" role="status" aria-live="polite">
          {status.icon}
          <span>{latestActivity?.label ?? status.detail}</span>
          {latestActivity?.safeDetails.map((detail) => (
            <span className="interaction-safe-detail" key={`${detail.label}:${detail.value}`}>
              {detail.value}
            </span>
          ))}
        </div>
      </div>
      {!terminal ? (
        <div className="interaction-panel-actions" aria-label="Interaction controls">
          <button
            className="danger"
            type="button"
            aria-label="Stop agent interaction"
            data-tooltip="Stop"
            onClick={onStop}
          >
            <Square size={14} fill="currentColor" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function interactionStatus(
  session: InteractionSession,
  activity: RunToolActivity | null,
) {
  if (session.state === "takeover") {
    return {
      label: "Takeover",
      detail: "Automation is paused while you have control.",
      icon: <Hand size={14} aria-hidden="true" />,
    };
  }
  if (session.state === "paused") {
    return {
      label: "Paused",
      detail: "No browser or desktop input will be sent.",
      icon: <Pause size={14} aria-hidden="true" />,
    };
  }
  if (session.state === "awaiting-confirmation") {
    return {
      label: "Confirm",
      detail: "Waiting for action-specific confirmation.",
      icon: <ShieldCheck size={14} aria-hidden="true" />,
    };
  }
  if (session.state === "recovering") {
    return {
      label: "Recovering",
      detail: session.attentionReason ?? "Refreshing state and changing strategy.",
      icon: <AlertCircle size={14} aria-hidden="true" />,
    };
  }
  if (activity?.status === "completed") {
    return {
      label: "Observed",
      detail: "The provider reported the last operation complete.",
      icon: <CheckCircle2 size={14} aria-hidden="true" />,
    };
  }
  if (session.state === "failed") {
    return {
      label: "Failed",
      detail: session.attentionReason ?? "Interaction stopped after a provider failure.",
      icon: <AlertCircle size={14} aria-hidden="true" />,
    };
  }
  return {
    label: session.state === "provisioning" ? "Connecting" : "Active",
    detail: "Observing the current surface before the next action.",
    icon: <Loader2 className="spin" size={14} aria-hidden="true" />,
  };
}
