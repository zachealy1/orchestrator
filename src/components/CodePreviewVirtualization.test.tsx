import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CodePreview } from "./CodePreview";

const mocks = vi.hoisted(() => ({
  totalSize: 20_024,
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getTotalSize: () => mocks.totalSize,
    getVirtualItems: () => [
      { index: 0, key: "first", start: 12, size: 20 },
    ],
  }),
}));

vi.mock("../runtime/AppServices", () => ({
  useAppServices: () => ({
    codePreviewHighlighting: { prepareSource: vi.fn() },
  }),
}));

describe("CodePreview fixed-row virtualization", () => {
  it("uses a deterministic virtual height and integer row transform", () => {
    const content = Array.from(
      { length: 1_000 },
      (_, index) => `line ${index + 1}`,
    ).join("\n");
    const { container } = render(
      <CodePreview
        path="/repo/large.txt"
        content={content}
        resolvedTheme="light"
        truncated={false}
      />,
    );

    expect(container.querySelector(".code-preview-virtualizer")).toHaveStyle({
      height: "20024px",
    });
    expect(container.querySelector(".code-preview-line")).toHaveStyle({
      transform: "translate3d(0, 12px, 0)",
    });
    expect(container.querySelector(".code-preview-line")).not.toHaveAttribute(
      "data-measured",
    );
  });

  it("keeps long lines on one editor row", () => {
    const { container } = render(
      <CodePreview
        path="/repo/long.txt"
        content={"x".repeat(500)}
        resolvedTheme="dark"
        truncated={false}
      />,
    );
    const virtualizer = container.querySelector(
      ".code-preview-virtualizer",
    ) as HTMLElement;
    expect(Number.parseFloat(virtualizer.style.width)).toBeGreaterThan(4_000);
  });
});
