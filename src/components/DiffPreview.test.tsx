import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiffPreview } from "./DiffPreview";
import type { WorkspaceGitDiffSection } from "../types";

const section: WorkspaceGitDiffSection = {
  kind: "unstaged",
  title: "Working tree changes",
  baseLabel: "Index:README.txt",
  headLabel: "Working tree:README.txt",
  baseContent: "A\nOld\nZ\n",
  headContent: "A\nNew\nZ\n",
  baseTruncated: false,
  headTruncated: false,
  content: "",
  isBinary: false,
};

function mockScrollableDiff(
  container: HTMLElement,
  metrics = { scrollHeight: 1000, clientHeight: 100 },
) {
  const scrollElement = container.querySelector(
    ".diff-preview-scroll",
  ) as HTMLDivElement;
  Object.defineProperty(scrollElement, "clientHeight", {
    configurable: true,
    value: metrics.clientHeight,
  });
  Object.defineProperty(scrollElement, "scrollHeight", {
    configurable: true,
    value: metrics.scrollHeight,
  });
  Object.defineProperty(scrollElement, "scrollTop", {
    configurable: true,
    value: 0,
    writable: true,
  });
  fireEvent.scroll(scrollElement);
  return scrollElement;
}

function mockOverviewTrack(container: HTMLElement, height = 100) {
  const track = container.querySelector(".diff-overview-track") as HTMLDivElement;
  Object.defineProperty(track, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: height,
      height,
      left: 0,
      right: 16,
      top: 0,
      width: 16,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    }),
  });
  return track;
}

describe("DiffPreview", () => {
  it("renders side-by-side full-file rows with old and new line numbers", async () => {
    const { container } = render(
      <DiffPreview
        path="README.txt"
        sections={[section]}
        resolvedTheme="dark"
        layout="side-by-side"
      />,
    );

    await waitFor(() => expect(screen.getByText("Original")).toBeInTheDocument());
    expect(screen.getByText("Modified")).toBeInTheDocument();
    expect(screen.getAllByText("A")).toHaveLength(2);
    expect(screen.getByText("Old")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getAllByText("Z")).toHaveLength(2);

    const grid = screen.getByRole("table", { name: "Side-by-side diff" });
    expect(within(grid).getAllByText("2")).toHaveLength(2);
    expect(
      container.querySelector(".diff-preview-scroll")?.textContent,
    ).not.toContain("Original");
    expect(
      container.querySelector(".diff-preview-scroll")?.textContent,
    ).not.toContain("Working tree changes");
    expect(
      container.querySelector(".diff-preview-pinned-column-header"),
    ).toHaveTextContent("OriginalModified");

    const previewText = container.querySelector(".diff-preview")?.textContent ?? "";
    expect(previewText.indexOf("Working tree changes")).toBeLessThan(
      previewText.indexOf("Original"),
    );
  });

  it("renders the inline fallback layout with full-file content", async () => {
    render(
      <DiffPreview
        path="README.txt"
        sections={[section]}
        resolvedTheme="light"
        layout="inline"
      />,
    );

    const inline = await screen.findByRole("table", { name: "Inline diff" });
    expect(inline).toHaveTextContent("A");
    expect(inline).toHaveTextContent("Old");
    expect(inline).toHaveTextContent("New");
    expect(inline).toHaveTextContent("Z");
  });

  it("uses the same semantic token classes as CodePreview", async () => {
    render(
      <DiffPreview
        path="package.json"
        sections={[
          {
            ...section,
            baseContent: '{\n  "name": "old"\n}',
            headContent: '{\n  "name": "new"\n}',
          },
        ]}
        resolvedTheme="light"
        layout="side-by-side"
      />,
    );

    await waitFor(() =>
      expect(screen.getAllByText("\"name\"")[0]).toHaveClass("json-key"),
    );
    expect(screen.getAllByText("\"old\"")[0]).toHaveClass("json-value");
    expect(screen.getAllByText("\"new\"")[0]).toHaveClass("json-value");
  });

  it("renders an overview ruler with diff markers when the diff overflows", async () => {
    const { container } = render(
      <DiffPreview
        path="README.txt"
        sections={[
          {
            ...section,
            baseContent: "A\nOld\nRemoved\nZ\n",
            headContent: "A\nNew\nZ\nAdded\n",
          },
        ]}
        resolvedTheme="dark"
        layout="side-by-side"
      />,
    );

    mockScrollableDiff(container);

    await waitFor(() =>
      expect(
        screen.getByRole("scrollbar", { name: "Diff overview scroller" }),
      ).toBeInTheDocument(),
    );
    expect(container.querySelectorAll(".diff-overview-marker").length).toBeGreaterThan(0);
  });

  it("does not render the overview ruler when the diff does not overflow", async () => {
    render(
      <DiffPreview
        path="README.txt"
        sections={[section]}
        resolvedTheme="dark"
        layout="side-by-side"
      />,
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("scrollbar", { name: "Diff overview scroller" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("clicks and drags the overview ruler to update the scroll position", async () => {
    const { container } = render(
      <DiffPreview
        path="README.txt"
        sections={[
          {
            ...section,
            baseContent: "A\nOld\nRemoved\nZ\n",
            headContent: "A\nNew\nZ\nAdded\n",
          },
        ]}
        resolvedTheme="dark"
        layout="side-by-side"
      />,
    );

    const scrollElement = mockScrollableDiff(container);
    await screen.findByRole("scrollbar", { name: "Diff overview scroller" });
    const track = mockOverviewTrack(container);

    fireEvent.pointerDown(track, { clientY: 50, pointerId: 1 });
    expect(scrollElement.scrollTop).toBe(450);

    fireEvent.pointerMove(track, { clientY: 80, pointerId: 1 });
    expect(scrollElement.scrollTop).toBe(720);
  });

  it("supports keyboard navigation on the overview ruler", async () => {
    const { container } = render(
      <DiffPreview
        path="README.txt"
        sections={[
          {
            ...section,
            baseContent: "A\nOld\nRemoved\nZ\n",
            headContent: "A\nNew\nZ\nAdded\n",
          },
        ]}
        resolvedTheme="dark"
        layout="side-by-side"
      />,
    );

    const scrollElement = mockScrollableDiff(container);
    const ruler = await screen.findByRole("scrollbar", {
      name: "Diff overview scroller",
    });

    fireEvent.keyDown(ruler, { key: "End" });
    expect(scrollElement.scrollTop).toBe(900);

    fireEvent.keyDown(ruler, { key: "Home" });
    expect(scrollElement.scrollTop).toBe(0);
  });
});
