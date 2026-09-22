import type { RunViewState } from "./codexEventReducer";

/** Turn usage is authoritative; cumulative thread usage is not a substitute. */
export function formatTokenCount(runView: Pick<RunViewState, "tokenUsage" | "status">) {
  if (runView.tokenUsage?.turnTokens != null) {
    return `${runView.tokenUsage.turnTokens.toLocaleString()} tokens`;
  }
  if (runView.tokenUsage === null && ["idle", "connecting", "running"].includes(runView.status)) {
    return "Token usage pending";
  }
  return "Token usage unavailable";
}

export function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}hr ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}
