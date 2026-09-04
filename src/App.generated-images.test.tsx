import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitCodexNotification,
  getMocks,
  prepareDefaults,
  prepareSignedInRun,
  renderApp,
  setWindowWidth,
  startMockRun,
} from "./test/appRuntimeHarness";

const mocks = getMocks();

describe("Generated image runtime integration", () => {
  beforeEach(() => {
    mocks.listeners.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    setWindowWidth(1024);
    document.documentElement.removeAttribute("data-theme");
    mocks.virtuosoState = {
      ranges: [{ startIndex: 0, endIndex: 0 }],
      scrollTop: 0,
    };
    prepareDefaults();
  });

  it("renders and persists image-generation notifications as transcript previews", async () => {
    prepareSignedInRun();
    const { user } = await renderApp();
    await startMockRun(user, "Produce a visual concept");

    await emitCodexNotification({
      method: "item/started",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: { type: "imageGeneration", id: "image-1" },
      },
    });
    expect(await screen.findByText("Creating image…")).toBeInTheDocument();

    const canonicalPath =
      "/Users/test/.codex/generated_images/thread-1/concept.png";
    await emitCodexNotification({
      method: "item/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          type: "imageGeneration",
          id: "image-1",
          status: "completed",
          savedPath: canonicalPath,
          result: "cHJldmlldw==",
        },
      },
    });

    await waitFor(() =>
      expect(mocks.appendRunEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "item/completed",
          payload: expect.objectContaining({
            params: expect.objectContaining({
              item: expect.objectContaining({
                type: "imageGeneration",
                savedPath: canonicalPath,
              }),
            }),
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(mocks.prepareImageAttachmentMock).toHaveBeenCalledWith(
        canonicalPath,
      ),
    );
    expect(
      await screen.findByRole("img", { name: "Generated image 1" }),
    ).toHaveAttribute(
      "src",
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
    );
  });
});
