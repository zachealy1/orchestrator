import { describe, expect, it } from "vitest";
import {
  createInteractionSession,
  registerInteractionSurface,
} from "./coordinator";
import { redactInteractionSession } from "./telemetry";

describe("interaction telemetry redaction", () => {
  it("keeps page content out of persisted session metadata", () => {
    let session = createInteractionSession({
      id: "session-1",
      runId: 4,
      deadlineAt: "2099-01-01T00:00:00.000Z",
    });
    session = registerInteractionSurface(session, {
      id: "browser-1",
      kind: "browser",
      provider: "browser:control-in-app-browser",
      providerVersion: "26.818.41509",
      title: "Private account statement",
      origin: "https://bank.example/statement?token=secret",
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

    const persisted = JSON.stringify(redactInteractionSession(session));
    expect(persisted).not.toContain("bank.example");
    expect(persisted).not.toContain("Private account statement");
    expect(persisted).toContain("26.818.41509");
  });
});
