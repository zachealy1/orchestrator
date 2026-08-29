import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { readBrowserSessionSnapshot } from "../../codexClient";
import type { BrowserSessionState } from "../browser/types";
import {
  createInteractionSession,
  registerInteractionSurface,
  transitionInteractionSession,
} from "./coordinator";
import { InteractionPanel } from "./InteractionPanel";

vi.mock("../../codexClient", () => ({
  readBrowserSessionSnapshot: vi.fn(),
}));

const browserSession: BrowserSessionState = {
  token: "0123456789abcdef0123456789abcdef",
  status: "running",
  target: {
    profileKey: "default",
    workspaceId: 1,
    chatId: 2,
    runId: 3,
    entryId: "entry-1",
    threadId: "thread-1",
    turnId: "turn-1",
    accessMode: "ask-for-approval",
    developerModeEnabled: false,
    chatTitle: "Research task",
  },
  browserPid: null,
  error: null,
  backend: "browser-bridge",
  browser: null,
  extensionConnected: true,
  chatGroupKey: "group-1",
  controlledTabId: 4,
  unavailableReason: null,
  browserSkillVersion: "26.818.41509",
  browserServiceCompatible: true,
  backendHealthy: true,
};

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
        provider: "browser-bridge",
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
  it("shows a temporary live preview and exposes explicit controls", async () => {
    vi.mocked(readBrowserSessionSnapshot).mockResolvedValue({
      dataUrl: "data:image/png;base64,aGVsbG8=",
      generation: 2,
      capturedAt: "2026-08-29T08:00:00.000Z",
    });
    const onPause = vi.fn();
    const onTakeOver = vi.fn();
    const onStop = vi.fn();
    render(
      <InteractionPanel
        session={session()}
        browserSession={browserSession}
        latestActivity={null}
        onFocusBrowser={vi.fn()}
        onPause={onPause}
        onTakeOver={onTakeOver}
        onResume={vi.fn()}
        onStop={onStop}
      />,
    );

    expect(screen.getByRole("complementary", { name: "Agent interaction" })).toBeVisible();
    await waitFor(() => expect(readBrowserSessionSnapshot).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Pause interaction" }));
    await user.click(screen.getByRole("button", { name: "Take over interaction" }));
    await user.click(screen.getByRole("button", { name: "Stop agent interaction" }));
    expect(onPause).toHaveBeenCalledOnce();
    expect(onTakeOver).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
  });
});
