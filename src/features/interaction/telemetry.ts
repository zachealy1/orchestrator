import type { InteractionSession } from "./types";

export type RedactedInteractionSessionWrite = {
  id: string;
  runId: number | null;
  threadId: string | null;
  turnId: string | null;
  state: string;
  currentSurfaceKind: string | null;
  browserProviderVersion: string | null;
  desktopProviderVersion: string | null;
  startedAt: string;
  completedAt: string | null;
  errorCode: string | null;
};

export function redactInteractionSession(
  session: InteractionSession,
): RedactedInteractionSessionWrite {
  const surface = session.currentSurfaceId
    ? session.surfaces[session.currentSurfaceId]
    : null;
  return {
    id: session.id,
    runId: session.runId,
    threadId: session.threadId,
    turnId: session.turnId,
    state: session.state,
    currentSurfaceKind: surface?.kind ?? null,
    browserProviderVersion: session.providerVersions.browser ?? null,
    desktopProviderVersion: session.providerVersions.desktop ?? null,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    errorCode: session.errorCode,
  };
}
