import { describe, expect, it } from "vitest";
import {
  beginInteractionAction,
  acquireInteractionInputLease,
  createInteractionSession,
  recordInteractionObservation,
  registerInteractionSurface,
  transitionInteractionSession,
} from "./coordinator";
import { redactInteractionSession, redactInteractionStep } from "./telemetry";
import type { InteractionAction } from "./types";

describe("interaction telemetry redaction", () => {
  it("keeps page content and action values out of persisted metadata", () => {
    let session = createInteractionSession({
      id: "session-1",
      runId: 4,
      deadlineAt: "2099-01-01T00:00:00.000Z",
    });
    session = registerInteractionSurface(session, {
      id: "browser-1",
      kind: "browser",
      provider: "browser-bridge",
      providerVersion: "26.818.41509",
      title: "Private account statement",
      origin: "https://bank.example",
      bundleId: null,
      generation: 1,
      capabilities: {
        semanticElements: true,
        screenshots: true,
        coordinateActions: true,
        tabs: true,
        windows: true,
        dialogs: true,
        downloads: true,
        uploads: false,
        clipboard: false,
        arbitraryCode: false,
      },
    });
    session = transitionInteractionSession(session, "observing");
    session = recordInteractionObservation(session, {
      id: "observation-1",
      sessionId: session.id,
      surfaceId: "browser-1",
      generation: 1,
      observedAt: "2026-08-29T08:00:00.000Z",
      url: "https://bank.example/statement?token=secret",
      title: "Private account statement",
      focusedElement: "Password: secret-value",
      screenshotId: "private-image",
      viewport: { width: 1280, height: 800, scale: 2 },
      dialogKinds: [],
      downloadCount: 0,
      stateHash: "hash-before",
    });
    session = acquireInteractionInputLease(session, "browser-1");
    const action: InteractionAction = {
      id: "action-1",
      sessionId: session.id,
      observationId: "observation-1",
      surfaceId: "browser-1",
      generation: 1,
      kind: "type",
      argumentHash: "redacted-argument-hash",
      target: {
        kind: "semantic",
        grounding: "accessibility",
        elementRef: "ax-password",
      },
      expectedEffect: "Set secret-value in Password",
      consequence: "sensitive",
      idempotent: false,
      grounding: "accessibility",
      retryCount: 0,
    };
    session = beginInteractionAction(session, action);

    const persisted = JSON.stringify({
      session: redactInteractionSession(session),
      step: redactInteractionStep({
        session,
        action,
        result: null,
        policyDecision: "takeover",
        startedAt: "2026-08-29T08:00:01.000Z",
        completedAt: null,
      }),
    });
    expect(persisted).not.toContain("secret-value");
    expect(persisted).not.toContain("bank.example");
    expect(persisted).not.toContain("private-image");
    expect(persisted).toContain("accessibility");
    expect(persisted).toContain("sensitive");
  });
});
