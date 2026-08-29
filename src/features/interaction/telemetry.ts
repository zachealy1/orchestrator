import type {
  InteractionAction,
  InteractionActionResult,
  InteractionSession,
} from "./types";

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

export type RedactedInteractionStepWrite = {
  id: string;
  sessionId: string;
  sequence: number;
  surfaceKind: string;
  actionKind: string;
  groundingKind: string;
  consequence: string;
  policyDecision: string;
  resultStatus: string | null;
  retryCount: number;
  durationMs: number | null;
  errorCode: string | null;
  observationGeneration: number;
  stateHashBefore: string | null;
  stateHashAfter: string | null;
  startedAt: string;
  completedAt: string | null;
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

export function redactInteractionStep(input: {
  session: InteractionSession;
  action: InteractionAction;
  result: InteractionActionResult | null;
  policyDecision: string;
  startedAt: string;
  completedAt: string | null;
}): RedactedInteractionStepWrite {
  const source = input.session.observations[input.action.observationId];
  const surface = input.session.surfaces[input.action.surfaceId];
  return {
    id: input.action.id,
    sessionId: input.session.id,
    sequence:
      input.session.steps.find((step) => step.action.id === input.action.id)
        ?.sequence ?? input.session.steps.length + 1,
    surfaceKind: surface?.kind ?? "unknown",
    actionKind: sanitizeIdentifier(input.action.kind),
    groundingKind: input.action.grounding,
    consequence: input.action.consequence,
    policyDecision: sanitizeIdentifier(input.policyDecision),
    resultStatus: input.result?.status ?? null,
    retryCount: input.action.retryCount,
    durationMs: input.result?.durationMs ?? null,
    errorCode: input.result?.errorCode
      ? sanitizeIdentifier(input.result.errorCode)
      : null,
    observationGeneration: input.action.generation,
    stateHashBefore: source?.stateHash ?? null,
    stateHashAfter: input.result?.observationAfter?.stateHash ?? null,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
  };
}

function sanitizeIdentifier(value: string) {
  return value.replace(/[^a-z0-9_.:-]/giu, "-").slice(0, 100);
}
