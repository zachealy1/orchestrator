import { describe, expect, it } from "vitest";
import {
  codexAutomaticRecoveryFailedError,
  codexDidNotRecoverError,
  isRecoverableCodexTransportError,
} from "./connectionRecovery";

describe("Codex connection recovery", () => {
  it.each([
    "Timed out waiting for Codex response to account/read",
    "Codex response channel closed while waiting for account/read",
    "Codex app-server exited before responding",
    "Codex app-server was stopped",
    "Codex account 0 is not connected",
    "Failed to write to Codex: Broken pipe",
    "App-server initialization failed: Timed out waiting for Codex response to initialize",
  ])("recognizes recoverable transport failures: %s", (message) => {
    expect(isRecoverableCodexTransportError(new Error(message))).toBe(true);
  });

  it.each([
    "Sign in to Codex before starting a run.",
    "Plan mode requires a supported Codex version.",
    "The selected workspace is unavailable.",
  ])("does not retry semantic failures: %s", (message) => {
    expect(isRecoverableCodexTransportError(new Error(message))).toBe(false);
  });

  it("keeps the final transport failure in actionable recovery errors", () => {
    expect(
      codexAutomaticRecoveryFailedError(new Error("restart failed")).message,
    ).toContain("restart failed");
    expect(
      codexDidNotRecoverError(new Error("second timeout")).message,
    ).toContain("second timeout");
  });
});
