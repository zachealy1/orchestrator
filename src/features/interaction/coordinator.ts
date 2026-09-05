import type {
  InteractionSession,
  InteractionSessionState,
  InteractionSurface,
} from "./types";

const TERMINAL_STATES = new Set<InteractionSessionState>([
  "completed",
  "failed",
  "stopped",
]);

const TRANSITIONS: Record<InteractionSessionState, InteractionSessionState[]> = {
  provisioning: ["observing", "failed", "stopping", "paused", "takeover"],
  observing: ["awaiting-model", "recovering", "failed", "stopping", "paused", "takeover"],
  "awaiting-model": [
    "acting",
    "awaiting-confirmation",
    "observing",
    "completed",
    "failed",
    "stopping",
    "paused",
    "takeover",
  ],
  "awaiting-confirmation": ["acting", "awaiting-model", "failed", "stopping", "paused", "takeover"],
  acting: ["verifying", "recovering", "failed", "stopping", "paused", "takeover"],
  verifying: ["observing", "awaiting-model", "recovering", "failed", "stopping", "paused", "takeover"],
  recovering: ["observing", "awaiting-model", "failed", "stopping", "paused", "takeover"],
  paused: ["observing", "awaiting-model", "stopping", "takeover"],
  takeover: ["observing", "stopping", "paused"],
  completed: [],
  failed: [],
  stopping: ["stopped", "failed"],
  stopped: [],
};

export const DEFAULT_INTERACTION_MAX_STEPS = 120;
export const DEFAULT_INTERACTION_MAX_RETRIES = 2;

export function createInteractionSession(input: {
  id: string;
  runId: number | null;
  threadId?: string | null;
  turnId?: string | null;
  deadlineAt?: string;
  now?: string;
}): InteractionSession {
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id,
    runId: input.runId,
    threadId: input.threadId ?? null,
    turnId: input.turnId ?? null,
    state: "provisioning",
    stateBeforePause: null,
    currentSurfaceId: null,
    inputLease: null,
    providerVersions: {},
    surfaces: {},
    observations: {},
    latestObservationId: null,
    steps: [],
    noProgressCount: 0,
    recoveryCount: 0,
    maxSteps: DEFAULT_INTERACTION_MAX_STEPS,
    maxRetries: DEFAULT_INTERACTION_MAX_RETRIES,
    deadlineAt:
      input.deadlineAt ?? new Date(Date.parse(now) + 30 * 60_000).toISOString(),
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    errorCode: null,
    attentionReason: null,
  };
}

export function transitionInteractionSession(
  session: InteractionSession,
  next: InteractionSessionState,
  now = new Date().toISOString(),
): InteractionSession {
  if (session.state === next) return { ...session, updatedAt: now };
  if (!TRANSITIONS[session.state].includes(next)) {
    throw new Error(`Invalid interaction transition ${session.state} -> ${next}.`);
  }
  const terminal = TERMINAL_STATES.has(next);
  return {
    ...session,
    state: next,
    stateBeforePause:
      next === "paused" || next === "takeover" ? session.state : session.stateBeforePause,
    inputLease:
      next === "paused" || next === "takeover" || next === "stopping" || terminal
        ? null
        : session.inputLease,
    updatedAt: now,
    completedAt: terminal ? now : session.completedAt,
  };
}

export function registerInteractionSurface(
  session: InteractionSession,
  surface: InteractionSurface,
  now = new Date().toISOString(),
): InteractionSession {
  assertLive(session, now);
  return {
    ...session,
    surfaces: { ...session.surfaces, [surface.id]: surface },
    providerVersions: {
      ...session.providerVersions,
      ...(surface.providerVersion ? { [surface.kind]: surface.providerVersion } : {}),
    },
    currentSurfaceId: session.currentSurfaceId ?? surface.id,
    updatedAt: now,
  };
}

function assertLive(session: InteractionSession, now: string) {
  if (TERMINAL_STATES.has(session.state) || session.state === "stopping") {
    throw new Error("Interaction session is no longer active.");
  }
  if (Date.parse(now) >= Date.parse(session.deadlineAt)) {
    throw new Error("Interaction session deadline exceeded.");
  }
}
