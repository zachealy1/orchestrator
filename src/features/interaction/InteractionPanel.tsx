import {
  AlertCircle,
  CheckCircle2,
  Hand,
  Loader2,
  Monitor,
  Pause,
  Play,
  ShieldCheck,
  Square,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { readBrowserSessionSnapshot } from "../../codexClient";
import type { RunToolActivity } from "../../lib/codexEventReducer";
import type {
  BrowserSessionSnapshot,
  BrowserSessionState,
} from "../browser/types";
import type { InteractionSession } from "./types";

export function InteractionPanel({
  session,
  browserSession,
  latestActivity,
  onFocusBrowser,
  onPause,
  onTakeOver,
  onResume,
  onStop,
}: {
  session: InteractionSession | null;
  browserSession: BrowserSessionState | null;
  latestActivity: RunToolActivity | null;
  onFocusBrowser: () => void;
  onPause: () => void;
  onTakeOver: () => void;
  onResume: () => void;
  onStop: () => void;
}) {
  const [snapshot, setSnapshot] = useState<BrowserSessionSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState(false);
  const token = browserSession?.token ?? null;
  const canObserve = Boolean(
    token &&
      browserSession &&
      !["paused", "takeover", "stopping", "stopped", "error"].includes(
        browserSession.status,
      ),
  );

  useEffect(() => {
    setSnapshot(null);
    setSnapshotError(false);
  }, [token]);

  useEffect(() => {
    if (!token || !canObserve) return;
    let disposed = false;
    let inFlight = false;
    const capture = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await readBrowserSessionSnapshot(token);
        if (!disposed) {
          setSnapshot(next);
          setSnapshotError(false);
        }
      } catch {
        if (!disposed) setSnapshotError(true);
      } finally {
        inFlight = false;
      }
    };
    void capture();
    const timer = window.setInterval(() => void capture(), 2_500);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [canObserve, token]);

  const surface = useMemo(
    () =>
      session?.currentSurfaceId
        ? session.surfaces[session.currentSurfaceId] ?? null
        : Object.values(session?.surfaces ?? {})[0] ?? null,
    [session],
  );
  if (!session || (!browserSession && Object.keys(session.surfaces).length === 0)) {
    return null;
  }

  const paused = session.state === "paused" || session.state === "takeover";
  const terminal = ["completed", "failed", "stopped"].includes(session.state);
  const status = interactionStatus(session, latestActivity);

  return (
    <aside className="interaction-panel" aria-label="Agent interaction">
      <div className="interaction-panel-preview" aria-hidden="true">
        {snapshot ? (
          <img src={snapshot.dataUrl} alt="" />
        ) : snapshotError ? (
          <AlertCircle size={18} />
        ) : (
          <Monitor size={18} />
        )}
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
          {surface?.capabilities.arbitraryCode ? (
            <span className="interaction-risk-detail">Developer Mode</span>
          ) : null}
        </div>
      </div>
      {!terminal ? (
        <div className="interaction-panel-actions" aria-label="Interaction controls">
          {browserSession ? (
            <button
              type="button"
              aria-label="Focus browser"
              data-tooltip="Focus"
              onClick={onFocusBrowser}
            >
              <Monitor size={15} aria-hidden="true" />
            </button>
          ) : null}
          {browserSession ? (
            paused ? (
              <button
                type="button"
                aria-label="Resume interaction"
                data-tooltip="Resume"
                onClick={onResume}
              >
                <Play size={15} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Pause interaction"
                data-tooltip="Pause"
                onClick={onPause}
              >
                <Pause size={15} aria-hidden="true" />
              </button>
            )
          ) : null}
          {browserSession ? (
            <button
              type="button"
              aria-label="Take over interaction"
              data-tooltip="Take over"
              disabled={session.state === "takeover"}
              onClick={onTakeOver}
            >
              <Hand size={15} aria-hidden="true" />
            </button>
          ) : null}
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
