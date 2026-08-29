import { describe, expect, it } from "vitest";
import {
  acquireInteractionInputLease,
  beginInteractionAction,
  createInteractionSession,
  recordInteractionActionResult,
  recordInteractionObservation,
  registerInteractionSurface,
  resumeInteractionSession,
  transitionInteractionSession,
} from "./coordinator";
import type {
  InteractionAction,
  InteractionObservation,
  InteractionSession,
  InteractionSurface,
} from "./types";

const NOW = "2026-08-29T10:00:00.000Z";

function surface(): InteractionSurface {
  return {
    id: "browser:1",
    kind: "browser",
    provider: "browser",
    providerVersion: "26.818.41509",
    title: "Checkout",
    origin: "https://shop.example",
    bundleId: null,
    generation: 1,
    capabilities: {
      semanticElements: true,
      screenshots: true,
      coordinateActions: true,
      tabs: true,
      windows: true,
      dialogs: true,
      downloads: false,
      uploads: false,
      clipboard: false,
      arbitraryCode: false,
    },
  };
}

function observation(id = "observation-1", stateHash = "state-a"): InteractionObservation {
  return {
    id,
    sessionId: "session-1",
    surfaceId: "browser:1",
    generation: 1,
    observedAt: NOW,
    url: "https://shop.example/cart",
    title: "Cart",
    focusedElement: null,
    screenshotId: "screen-1",
    viewport: { width: 1280, height: 800, scale: 2 },
    dialogKinds: [],
    downloadCount: 0,
    stateHash,
  };
}

function action(overrides: Partial<InteractionAction> = {}): InteractionAction {
  return {
    id: "action-1",
    sessionId: "session-1",
    observationId: "observation-1",
    surfaceId: "browser:1",
    generation: 1,
    kind: "click",
    argumentHash: "args-none",
    target: {
      kind: "semantic",
      grounding: "accessibility",
      elementRef: "ax-42",
      role: "button",
      name: "Continue",
    },
    expectedEffect: "Advance to shipping",
    consequence: "reversible",
    idempotent: true,
    grounding: "accessibility",
    retryCount: 0,
    ...overrides,
  };
}

function observedSession(): InteractionSession {
  let session = createInteractionSession({
    id: "session-1",
    runId: 8,
    now: NOW,
    deadlineAt: "2099-01-01T00:00:00.000Z",
  });
  session = registerInteractionSurface(session, surface(), NOW);
  session = transitionInteractionSession(session, "observing", NOW);
  session = recordInteractionObservation(session, observation(), NOW);
  return acquireInteractionInputLease(session, "browser:1", NOW);
}

describe("InteractionCoordinator", () => {
  it("rejects actions grounded in stale observations", () => {
    const session = observedSession();
    expect(() =>
      beginInteractionAction(
        session,
        action({ generation: 0 }),
        NOW,
      ),
    ).toThrow(/stale/u);
  });

  it("rejects visual actions whose screenshot or viewport changed", () => {
    const session = observedSession();
    expect(() =>
      beginInteractionAction(
        session,
        action({
          grounding: "visual",
          target: {
            kind: "visual",
            grounding: "visual",
            screenshotId: "old-screen",
            x: 20,
            y: 40,
            viewport: { width: 1280, height: 800, scale: 2 },
          },
        }),
        NOW,
      ),
    ).toThrow(/current screenshot/u);
  });

  it("never permits an automatic retry of a consequential action", () => {
    const session = observedSession();
    expect(() =>
      beginInteractionAction(
        session,
        action({
          retryCount: 1,
          consequence: "external-side-effect",
          expectedEffect: "Submit the order",
        }),
        NOW,
      ),
    ).toThrow(/cannot be retried/u);
  });

  it("requires the third attempt to change grounding strategy", () => {
    let session = beginInteractionAction(
      observedSession(),
      action({ retryCount: 1 }),
      NOW,
    );
    session = recordInteractionActionResult(
      session,
      {
        actionId: "action-1",
        status: "no_effect",
        observationAfter: observation("observation-2", "state-a"),
        evidence: [],
        retryable: true,
        durationMs: 1,
        errorCode: "no-effect",
      },
      NOW,
    );
    session = { ...session, state: "observing" };
    session = recordInteractionObservation(
      session,
      observation("observation-3", "state-a"),
      NOW,
    );
    expect(() =>
      beginInteractionAction(
        session,
        action({ id: "action-2", observationId: "observation-3", retryCount: 2 }),
        NOW,
      ),
    ).toThrow(/change grounding strategy/u);
  });

  it("breaks a repeated no-progress loop after two identical actions", () => {
    let session = beginInteractionAction(observedSession(), action(), NOW);
    session = recordInteractionActionResult(
      session,
      {
        actionId: "action-1",
        status: "no_effect",
        observationAfter: observation("observation-2", "state-a"),
        evidence: [],
        retryable: true,
        durationMs: 100,
        errorCode: null,
      },
      NOW,
    );
    session = { ...session, state: "observing" };
    session = recordInteractionObservation(
      session,
      { ...observation("observation-3", "state-a"), id: "observation-3" },
      NOW,
    );
    session = beginInteractionAction(
      session,
      action({ id: "action-2", observationId: "observation-3" }),
      NOW,
    );
    session = recordInteractionActionResult(
      session,
      {
        actionId: "action-2",
        status: "no_effect",
        observationAfter: observation("observation-4", "state-a"),
        evidence: [],
        retryable: false,
        durationMs: 100,
        errorCode: "no-effect",
      },
      NOW,
    );
    expect(session.state).toBe("recovering");
    expect(session.attentionReason).toMatch(/no progress twice/u);
  });

  it("invalidates all observations and generations after takeover", () => {
    let session = observedSession();
    session = transitionInteractionSession(session, "takeover", NOW);
    session = resumeInteractionSession(session, NOW);
    expect(session.state).toBe("observing");
    expect(session.inputLease).toBeNull();
    expect(session.observations).toEqual({});
    expect(session.surfaces["browser:1"].generation).toBe(2);
  });

  it("rejects observations and results that arrive after stop", () => {
    let session = observedSession();
    session = transitionInteractionSession(session, "stopping", NOW);
    session = transitionInteractionSession(session, "stopped", NOW);
    expect(() =>
      recordInteractionObservation(session, observation("late-observation"), NOW),
    ).toThrow(/no longer active/u);
    expect(() =>
      recordInteractionActionResult(
        session,
        {
          actionId: "late-action",
          status: "applied",
          observationAfter: null,
          evidence: [],
          retryable: false,
          durationMs: 1,
          errorCode: null,
        },
        NOW,
      ),
    ).toThrow(/no longer active/u);
  });

  it("requires a fresh post-action observation before declaring success", () => {
    const session = beginInteractionAction(observedSession(), action(), NOW);
    expect(() =>
      recordInteractionActionResult(
        session,
        {
          actionId: "action-1",
          status: "applied",
          observationAfter: null,
          evidence: [{ kind: "state-change", summary: "Provider acknowledged" }],
          retryable: false,
          durationMs: 1,
          errorCode: null,
        },
        NOW,
      ),
    ).toThrow(/fresh post-action observation/u);
  });

  it("invalidates grounding before switching from browser to desktop", () => {
    let session = observedSession();
    session = registerInteractionSurface(
      session,
      {
        ...surface(),
        id: "desktop:1",
        kind: "desktop",
        title: "Finder",
        origin: null,
        bundleId: "com.apple.finder",
        capabilities: { ...surface().capabilities, tabs: false },
      },
      NOW,
    );
    session = acquireInteractionInputLease(session, "desktop:1", NOW);
    expect(session.state).toBe("observing");
    expect(session.inputLease).toBe("desktop");
    expect(session.latestObservationId).toBeNull();
    expect(session.surfaces["desktop:1"].generation).toBe(2);
  });
});
