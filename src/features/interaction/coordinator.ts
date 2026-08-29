import type {
  InteractionAction,
  InteractionActionResult,
  InteractionObservation,
  InteractionSession,
  InteractionSessionState,
  InteractionStep,
  InteractionSurface,
  InteractionSurfaceKind,
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

export function acquireInteractionInputLease(
  session: InteractionSession,
  surfaceId: string,
  now = new Date().toISOString(),
): InteractionSession {
  assertLive(session, now);
  if (["paused", "takeover", "stopping"].includes(session.state)) {
    throw new Error("Interaction input is not available while control is paused.");
  }
  const surface = session.surfaces[surfaceId];
  if (!surface) throw new Error("The requested interaction surface is unavailable.");
  const switchingSurface =
    session.currentSurfaceId !== null && session.currentSurfaceId !== surfaceId;
  const surfaces = switchingSurface
    ? {
        ...session.surfaces,
        [surfaceId]: { ...surface, generation: surface.generation + 1 },
      }
    : session.surfaces;
  return {
    ...session,
    state: switchingSurface ? "observing" : session.state,
    surfaces,
    currentSurfaceId: surfaceId,
    inputLease: surface.kind,
    latestObservationId: switchingSurface ? null : session.latestObservationId,
    updatedAt: now,
  };
}

export function recordInteractionObservation(
  session: InteractionSession,
  observation: InteractionObservation,
  now = new Date().toISOString(),
): InteractionSession {
  assertLive(session, now);
  if (!["observing", "verifying", "recovering"].includes(session.state)) {
    throw new Error("The session is not accepting a fresh observation.");
  }
  const surface = session.surfaces[observation.surfaceId];
  if (!surface || observation.sessionId !== session.id) {
    throw new Error("Observation does not belong to this interaction session.");
  }
  if (observation.generation < surface.generation) {
    throw new Error("Observation is stale for the current surface generation.");
  }
  return {
    ...session,
    state: "awaiting-model",
    surfaces: {
      ...session.surfaces,
      [surface.id]: { ...surface, generation: observation.generation },
    },
    observations: { ...session.observations, [observation.id]: observation },
    latestObservationId: observation.id,
    currentSurfaceId: observation.surfaceId,
    updatedAt: now,
  };
}

export function beginInteractionAction(
  session: InteractionSession,
  action: InteractionAction,
  now = new Date().toISOString(),
): InteractionSession {
  assertLive(session, now);
  if (
    session.state !== "awaiting-model" &&
    session.state !== "awaiting-confirmation"
  ) {
    throw new Error("The session is not ready to perform an action.");
  }
  if (session.steps.length >= session.maxSteps) {
    throw new Error("Interaction step budget exhausted.");
  }
  if (action.sessionId !== session.id) {
    throw new Error("Action does not belong to this interaction session.");
  }
  const observation = session.observations[action.observationId];
  const surface = session.surfaces[action.surfaceId];
  if (!observation || !surface || observation.surfaceId !== action.surfaceId) {
    throw new Error("Action is not grounded in a known observation.");
  }
  if (session.inputLease !== surface.kind) {
    throw new Error("The requested surface does not hold the interaction input lease.");
  }
  if (
    action.generation !== observation.generation ||
    action.generation !== surface.generation
  ) {
    throw new Error("Action target is stale for the current surface generation.");
  }
  if (
    action.target.kind === "visual" &&
    (action.target.screenshotId !== observation.screenshotId ||
      !sameViewport(action.target.viewport, observation.viewport))
  ) {
    throw new Error("Visual action is not grounded in the current screenshot.");
  }
  if (action.retryCount > session.maxRetries) {
    throw new Error("Interaction retry budget exhausted.");
  }
  if (
    action.retryCount > 0 &&
    (!action.idempotent ||
      action.consequence === "external-side-effect" ||
      action.consequence === "sensitive" ||
      action.consequence === "blocked")
  ) {
    throw new Error("This consequential action cannot be retried automatically.");
  }
  if (action.retryCount >= 2) {
    const previousAttempt = [...session.steps]
      .reverse()
      .find(
        (candidate) =>
          candidate.action.surfaceId === action.surfaceId &&
          candidate.action.kind === action.kind &&
          candidate.action.argumentHash === action.argumentHash &&
          candidate.action.expectedEffect === action.expectedEffect,
      );
    if (
      !previousAttempt ||
      previousAttempt.action.retryCount !== action.retryCount - 1 ||
      previousAttempt.action.grounding === action.grounding
    ) {
      throw new Error(
        "A third attempt must change grounding strategy after the prior attempt.",
      );
    }
  }
  const step: InteractionStep = {
    sequence: session.steps.length + 1,
    action,
    result: null,
    fingerprint: interactionActionFingerprint(action),
    startedAt: now,
    completedAt: null,
  };
  return {
    ...session,
    state: "acting",
    currentSurfaceId: action.surfaceId,
    inputLease: surface.kind,
    steps: [...session.steps, step],
    updatedAt: now,
  };
}

export function recordInteractionActionResult(
  session: InteractionSession,
  result: InteractionActionResult,
  now = new Date().toISOString(),
): InteractionSession {
  assertLive(session, now);
  if (session.state !== "acting" && session.state !== "verifying") {
    throw new Error("The session is not verifying an interaction action.");
  }
  const index = session.steps.findIndex((step) => step.action.id === result.actionId);
  if (index < 0) throw new Error("Interaction result has no matching action.");
  const step = session.steps[index];
  if (step.result) throw new Error("Interaction action already has a result.");
  if (
    (result.status === "applied" || result.status === "no_effect") &&
    !result.observationAfter
  ) {
    throw new Error("A completed mutation requires a fresh post-action observation.");
  }
  if (
    result.observationAfter &&
    (result.observationAfter.sessionId !== session.id ||
      result.observationAfter.surfaceId !== step.action.surfaceId ||
      result.observationAfter.generation < step.action.generation)
  ) {
    throw new Error("The post-action observation is stale or belongs to another surface.");
  }
  const sourceObservation = session.observations[step.action.observationId];
  const madeProgress = Boolean(
    result.observationAfter &&
      sourceObservation &&
      result.observationAfter.stateHash !== sourceObservation.stateHash,
  );
  const noProgress = result.status === "no_effect" ||
    (result.status === "applied" && !madeProgress && result.evidence.length === 0);
  const previous = session.steps
    .slice(0, index)
    .reverse()
    .find((candidate) => candidate.result);
  const repeatedNoProgress = Boolean(
    noProgress &&
      previous?.fingerprint === step.fingerprint &&
      stepMadeNoProgress(previous, session.observations),
  );
  const noProgressCount = repeatedNoProgress
    ? session.noProgressCount + 1
    : noProgress
      ? 1
      : 0;
  const steps = [...session.steps];
  steps[index] = { ...step, result, completedAt: now };
  let nextState: InteractionSessionState = "observing";
  let attentionReason = session.attentionReason;
  if (result.status === "blocked" || result.status === "uncertain") {
    nextState = "takeover";
    attentionReason =
      result.status === "uncertain"
        ? "The last action may have had an effect and will not be repeated automatically."
        : "The requested action is blocked by interaction policy.";
  } else if (result.status === "failed" || result.status === "stale" || noProgressCount >= 2) {
    nextState = "recovering";
    attentionReason = noProgressCount >= 2
      ? "The same action made no progress twice."
      : attentionReason;
  }
  const observations = result.observationAfter
    ? {
        ...session.observations,
        [result.observationAfter.id]: result.observationAfter,
      }
    : session.observations;
  const surfaces = result.observationAfter
    ? {
        ...session.surfaces,
        [step.action.surfaceId]: {
          ...session.surfaces[step.action.surfaceId],
          generation: result.observationAfter.generation,
        },
      }
    : session.surfaces;
  return {
    ...session,
    state: nextState,
    inputLease: nextState === "takeover" ? null : session.inputLease,
    observations,
    surfaces,
    latestObservationId:
      result.observationAfter?.id ?? session.latestObservationId,
    steps,
    noProgressCount,
    recoveryCount:
      nextState === "recovering" ? session.recoveryCount + 1 : session.recoveryCount,
    attentionReason,
    updatedAt: now,
  };
}

export function resumeInteractionSession(
  session: InteractionSession,
  now = new Date().toISOString(),
): InteractionSession {
  assertLive(session, now);
  if (session.state !== "paused" && session.state !== "takeover") {
    throw new Error("Only paused or takeover sessions can resume.");
  }
  const surfaces = Object.fromEntries(
    Object.entries(session.surfaces).map(([id, surface]) => [
      id,
      { ...surface, generation: surface.generation + 1 },
    ]),
  );
  return {
    ...transitionInteractionSession(session, "observing", now),
    surfaces,
    observations: {},
    latestObservationId: null,
    stateBeforePause: null,
    attentionReason: null,
  };
}

export function interactionActionFingerprint(action: InteractionAction) {
  const target =
    action.target.kind === "semantic"
      ? `${action.target.grounding}:${action.target.elementRef}`
      : action.target.kind === "visual"
        ? `visual:${action.target.screenshotId}:${Math.round(action.target.x)}:${Math.round(action.target.y)}`
        : `surface:${action.target.surfaceId}`;
  return [
    action.surfaceId,
    action.kind,
    target,
    action.argumentHash,
    action.expectedEffect,
  ].join("|");
}

export function interactionStateAcceptsInput(state: InteractionSessionState) {
  return !TERMINAL_STATES.has(state) &&
    !["paused", "takeover", "stopping", "awaiting-confirmation"].includes(state);
}

export function interactionSurfaceKind(
  session: InteractionSession,
): InteractionSurfaceKind | null {
  return session.currentSurfaceId
    ? session.surfaces[session.currentSurfaceId]?.kind ?? null
    : null;
}

function sameViewport(
  left: { width: number; height: number; scale: number },
  right: { width: number; height: number; scale: number } | null,
) {
  return Boolean(
    right &&
      left.width === right.width &&
      left.height === right.height &&
      left.scale === right.scale,
  );
}

function stepMadeNoProgress(
  step: InteractionStep | undefined,
  observations: InteractionSession["observations"],
) {
  if (!step?.result) return false;
  if (step.result.status === "no_effect") return true;
  if (step.result.status !== "applied" || step.result.evidence.length > 0) {
    return false;
  }
  const before = observations[step.action.observationId];
  const after = step.result.observationAfter;
  return Boolean(before && after && before.stateHash === after.stateHash);
}

function assertLive(session: InteractionSession, now: string) {
  if (TERMINAL_STATES.has(session.state) || session.state === "stopping") {
    throw new Error("Interaction session is no longer active.");
  }
  if (Date.parse(now) >= Date.parse(session.deadlineAt)) {
    throw new Error("Interaction session deadline exceeded.");
  }
}
