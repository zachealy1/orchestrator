import { render, screen, waitFor, within } from "@testing-library/react";
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

describe("DiffPreview", () => {
  it("renders side-by-side full-file rows with old and new line numbers", async () => {
    render(
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
});
