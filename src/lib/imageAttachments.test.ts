import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCodexTurnInput,
  clearImageAttachmentPreviewCache,
  loadImageAttachmentPreview,
  prepareContextImageFiles,
} from "./imageAttachments";

const prepareImageAttachmentMock = vi.hoisted(() => vi.fn());

vi.mock("../codexClient", () => ({
  prepareImageAttachment: prepareImageAttachmentMock,
}));

describe("image attachments", () => {
  beforeEach(() => {
    clearImageAttachmentPreviewCache();
    prepareImageAttachmentMock.mockReset();
  });

  it("classifies images by native content and preserves validated metadata", async () => {
    prepareImageAttachmentMock.mockResolvedValue({
      path: "/private/workspace/reference",
      mimeType: "image/webp",
      width: 1200,
      height: 800,
      thumbnailDataUrl: "data:image/png;base64,preview",
    });

    await expect(
      prepareContextImageFiles([
        {
          path: "/workspace/reference",
          name: "reference",
          source: "picker",
          status: "ready",
        },
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        path: "/workspace/reference",
        canonicalPath: "/private/workspace/reference",
        mediaKind: "image",
        mimeType: "image/webp",
        width: 1200,
        height: 800,
        status: "ready",
      }),
    ]);
  });

  it("keeps non-image attachments as text context", async () => {
    prepareImageAttachmentMock.mockResolvedValue(null);

    await expect(
      prepareContextImageFiles([
        {
          path: "/workspace/README.md",
          name: "README.md",
          source: "picker",
          status: "ready",
        },
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        path: "/workspace/README.md",
      }),
    ]);
  });

  it("builds text and localImage turn inputs without including normal files", () => {
    expect(
      buildCodexTurnInput("Inspect these files", [
        {
          path: "/workspace/reference-link.png",
          canonicalPath: "/workspace/reference.png",
          name: "reference-link.png",
          source: "picker",
          mediaKind: "image",
        },
        {
          path: "/workspace/README.md",
          name: "README.md",
          source: "picker",
          mediaKind: "file",
        },
      ]),
    ).toEqual([
      {
        type: "text",
        text: "Inspect these files",
        text_elements: [],
      },
      {
        type: "localImage",
        path: "/workspace/reference.png",
        detail: "auto",
      },
    ]);
  });

  it("rejects image-looking attachments that native validation cannot decode", async () => {
    prepareImageAttachmentMock.mockRejectedValue(
      new Error("Selected image could not be decoded"),
    );

    await expect(
      prepareContextImageFiles([
        {
          path: "/workspace/broken.png",
          name: "broken.png",
          source: "picker",
          mediaKind: "image",
        },
      ]),
    ).rejects.toThrow(
      "Unable to prepare broken.png: Selected image could not be decoded",
    );
  });

  it("revalidates an image at submission instead of trusting its cached thumbnail", async () => {
    prepareImageAttachmentMock
      .mockResolvedValueOnce({
        path: "/workspace/reference.png",
        mimeType: "image/png",
        width: 100,
        height: 100,
        thumbnailDataUrl: "data:image/png;base64,preview",
      })
      .mockRejectedValueOnce(new Error("Selected image could not be decoded"));

    await loadImageAttachmentPreview("/workspace/reference.png");

    await expect(
      prepareContextImageFiles([
        {
          path: "/workspace/reference.png",
          name: "reference.png",
          source: "picker",
          mediaKind: "image",
        },
      ]),
    ).rejects.toThrow(
      "Unable to prepare reference.png: Selected image could not be decoded",
    );
    expect(prepareImageAttachmentMock).toHaveBeenCalledTimes(2);
  });
});
