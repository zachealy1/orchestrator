import { describe, expect, it } from "vitest";
import {
  createInteractionSession,
  registerInteractionSurface,
  transitionInteractionSession,
} from "./coordinator";
import type { InteractionSurface } from "./types";

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

describe("InteractionCoordinator", () => {
  it("creates and registers the first available surface", () => {
    const session = registerInteractionSurface(
      createInteractionSession({
        id: "session-1",
        runId: 8,
        now: NOW,
        deadlineAt: "2099-01-01T00:00:00.000Z",
      }),
      surface(),
      NOW,
    );

    expect(session.currentSurfaceId).toBe("browser:1");
    expect(session.providerVersions.browser).toBe("26.818.41509");
  });

  it("rejects invalid transitions and finalizes terminal states", () => {
    const session = createInteractionSession({
      id: "session-1",
      runId: 8,
      now: NOW,
      deadlineAt: "2099-01-01T00:00:00.000Z",
    });

    expect(() => transitionInteractionSession(session, "acting", NOW)).toThrow(
      /Invalid interaction transition/u,
    );
    const stopped = transitionInteractionSession(
      transitionInteractionSession(session, "stopping", NOW),
      "stopped",
      NOW,
    );
    expect(stopped.completedAt).toBe(NOW);
    expect(stopped.inputLease).toBeNull();
  });

  it("rejects surface registration after the session deadline", () => {
    const session = createInteractionSession({
      id: "session-1",
      runId: 8,
      now: NOW,
      deadlineAt: NOW,
    });
    expect(() => registerInteractionSurface(session, surface(), NOW)).toThrow(
      /deadline exceeded/u,
    );
  });
});
