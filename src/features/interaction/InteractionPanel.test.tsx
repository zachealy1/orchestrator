import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  createInteractionSession,
  registerInteractionSurface,
  transitionInteractionSession,
} from "./coordinator";
import { InteractionPanel } from "./InteractionPanel";

function session() {
  return transitionInteractionSession(
    registerInteractionSurface(
      createInteractionSession({
        id: "interaction-1",
        runId: 3,
        deadlineAt: "2099-01-01T00:00:00.000Z",
      }),
      {
        id: "browser-1",
        kind: "browser",
        provider: "browser:control-in-app-browser",
        providerVersion: "26.818.41509",
        title: "Research task",
        origin: null,
        bundleId: "com.google.Chrome",
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
      },
    ),
    "observing",
  );
}

describe("InteractionPanel", () => {
  it("shows plugin interaction state and exposes the shared stop control", async () => {
    const onStop = vi.fn();
    render(
      <InteractionPanel
        session={session()}
        latestActivity={null}
        onStop={onStop}
      />,
    );

    expect(screen.getByRole("complementary", { name: "Agent interaction" })).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Stop agent interaction" }));
    expect(onStop).toHaveBeenCalledOnce();
  });
});
