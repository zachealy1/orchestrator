const RECOVERABLE_CODEX_TRANSPORT_ERRORS = [
  /Timed out waiting for Codex response to/iu,
  /Codex response channel closed while waiting for/iu,
  /Codex app-server exited before responding/iu,
  /Codex app-server was stopped/iu,
  /Codex account -?\d+ is not connected/iu,
  /Failed to write to Codex/iu,
];

export function codexConnectionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isRecoverableCodexTransportError(error: unknown) {
  const message = codexConnectionErrorMessage(error);
  return RECOVERABLE_CODEX_TRANSPORT_ERRORS.some((pattern) =>
    pattern.test(message),
  );
}

export function codexAutomaticRecoveryFailedError(error: unknown) {
  return new Error(
    `Codex stopped responding and Orchestrator could not restart its app-server automatically. Restart Orchestrator and try again. ${codexConnectionErrorMessage(error)}`,
  );
}

export function codexDidNotRecoverError(error: unknown) {
  return new Error(
    `Codex did not respond after Orchestrator restarted its app-server. Restart Orchestrator and try again. ${codexConnectionErrorMessage(error)}`,
  );
}

export class CodexRecoveryBlockedError extends Error {
  constructor() {
    super(
      "Codex stopped responding, but Orchestrator did not restart its app-server because another task is already active on this account. Stop that task or restart Orchestrator, then retry.",
    );
    this.name = "CodexRecoveryBlockedError";
  }
}

export function codexRecoveryBlockedByActiveRunError() {
  return new CodexRecoveryBlockedError();
}
