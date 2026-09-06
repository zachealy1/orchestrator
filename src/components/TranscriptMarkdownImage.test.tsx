import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppServices } from "../runtime/AppServices";
import { renderWithAppServices } from "../test/renderWithAppServices";
import {
  resolveLocalMarkdownImagePath,
  transcriptMarkdownUrlTransform,
  TranscriptMarkdownImage,
} from "./TranscriptMarkdownImage";

describe("TranscriptMarkdownImage", () => {
  it("loads an encoded absolute local path through the native preview cache", async () => {
    const services = new AppServices();
    const localPath =
      "/Users/test/Library/Application Support/orchestrator/mockup.jpg";
    services.imageAttachments.set(
      localPath,
      Promise.resolve({
        path: localPath,
        mimeType: "image/jpeg",
        width: 1512,
        height: 827,
        thumbnailDataUrl: "data:image/png;base64,local-preview",
      }),
    );

    renderWithAppServices(
      <TranscriptMarkdownImage
        src="/Users/test/Library/Application%20Support/orchestrator/mockup.jpg"
        alt="Local mockup"
      />,
      {},
      services,
    );

    expect(await screen.findByRole("img", { name: "Local mockup" })).toHaveAttribute(
      "src",
      "data:image/png;base64,local-preview",
    );
  });

  it("leaves remote image URLs unchanged", () => {
    renderWithAppServices(
      <TranscriptMarkdownImage
        src="https://cdn.example.com/mockup.png"
        alt="Remote mockup"
      />,
    );

    expect(screen.getByRole("img", { name: "Remote mockup" })).toHaveAttribute(
      "src",
      "https://cdn.example.com/mockup.png",
    );
  });

  it("shows an explicit unavailable state when a local file cannot be prepared", async () => {
    const services = new AppServices();
    const localPath = "/Users/test/missing.png";
    services.imageAttachments.set(localPath, Promise.resolve(null));

    renderWithAppServices(
      <TranscriptMarkdownImage src={localPath} alt="Missing mockup" />,
      {},
      services,
    );

    expect(
      await screen.findByRole("img", { name: "Missing mockup unavailable" }),
    ).toHaveTextContent("Image preview unavailable.");
  });

  it("recognizes file URLs and cross-platform absolute paths only", () => {
    expect(
      resolveLocalMarkdownImagePath(
        "file:///Users/test/Library/Application%20Support/mockup.png",
      ),
    ).toBe("/Users/test/Library/Application Support/mockup.png");
    expect(resolveLocalMarkdownImagePath("C:/Users/test/mockup.png")).toBe(
      "C:/Users/test/mockup.png",
    );
    expect(resolveLocalMarkdownImagePath("https://example.com/mockup.png")).toBeNull();
    expect(resolveLocalMarkdownImagePath("data:image/png;base64,preview")).toBeNull();
    expect(resolveLocalMarkdownImagePath("./artifacts/mockup.png")).toBeNull();
    expect(
      transcriptMarkdownUrlTransform(
        "file:///Users/test/Library/Application%20Support/mockup.png",
      ),
    ).toBe("file:///Users/test/Library/Application%20Support/mockup.png");
    expect(transcriptMarkdownUrlTransform("javascript:alert(1)")).toBe("");
  });
});
