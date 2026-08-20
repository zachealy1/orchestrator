import { act, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  preparePlaintextSourceDocument,
  type PreparedSourceDocument,
  type PrepareSourceDocumentInput,
} from "../lib/previewDocuments";
import { CodePreview } from "./CodePreview";

const mocks = vi.hoisted(() => ({
  prepareSource: vi.fn(),
}));

vi.mock("../runtime/AppServices", () => {
  const codePreviewHighlighting = { prepareSource: mocks.prepareSource };
  return {
    useAppServices: () => ({ codePreviewHighlighting }),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function highlightedDocument(
  input: PrepareSourceDocumentInput,
  lightColor = "#111111",
  darkColor = "#eeeeee",
): PreparedSourceDocument {
  const document = preparePlaintextSourceDocument(input);
  return {
    ...document,
    highlightingMode: "highlighted",
    lines: document.lines.map((line) =>
      line.map((token) => ({ ...token, lightColor, darkColor })),
    ),
  };
}

function previewContent(lineCount: number, prefix = "line") {
  return Array.from(
    { length: lineCount },
    (_, index) => `${prefix} ${index + 1}`,
  ).join("\n");
}

describe("CodePreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareSource.mockImplementation(
      async (input: PrepareSourceDocumentInput) => highlightedDocument(input),
    );
  });

  it("waits for a prepared highlighted document before showing source", async () => {
    const preparation = deferred<PreparedSourceDocument>();
    mocks.prepareSource.mockReturnValue(preparation.promise);
    const input = {
      path: "/repo/src/App.tsx",
      content: "export const value = 1;",
      language: "tsx",
      truncated: false,
      version: undefined,
    };

    render(
      <CodePreview
        path={input.path}
        content={input.content}
        resolvedTheme="light"
        truncated={false}
      />,
    );

    expect(screen.getByText("Preparing file preview…")).toBeInTheDocument();
    expect(screen.queryByText(input.content)).not.toBeInTheDocument();

    await act(async () => preparation.resolve(highlightedDocument(input)));
    const preview = await screen.findByLabelText("Highlighted file preview");
    expect(within(preview).getByText(input.content)).toHaveStyle({
      color: "#111111",
    });
  });

  it("switches themes from prepared tokens without another worker request", async () => {
    const { rerender } = render(
      <CodePreview
        path="/repo/src/App.tsx"
        content="export const value = 1;"
        resolvedTheme="light"
        truncated={false}
      />,
    );
    expect(await screen.findByText("export const value = 1;")).toHaveStyle({
      color: "#111111",
    });

    rerender(
      <CodePreview
        path="/repo/src/App.tsx"
        content="export const value = 1;"
        resolvedTheme="dark"
        truncated={false}
      />,
    );
    expect(screen.getByText("export const value = 1;")).toHaveStyle({
      color: "#eeeeee",
    });
    expect(mocks.prepareSource).toHaveBeenCalledOnce();
  });

  it("renders plaintext files immediately without preparation", () => {
    render(
      <CodePreview
        path="/repo/schema.custom"
        content="first line\nsecond line"
        lines={["first line", "second line"]}
        resolvedTheme="light"
        truncated={false}
      />,
    );
    const preview = screen.getByLabelText("Highlighted file preview");
    expect(within(preview).getByText("first line")).toBeInTheDocument();
    expect(preview.closest(".code-preview")).toHaveAttribute(
      "data-render-mode",
      "plaintext",
    );
    expect(mocks.prepareSource).not.toHaveBeenCalled();
  });

  it("keeps files above the highlighting budget permanently plaintext", () => {
    const lines = Array.from({ length: 1_000 }, (_, index) => `line ${index}`);
    render(
      <CodePreview
        path="/repo/large.ts"
        content=""
        lines={lines}
        resolvedTheme="dark"
        truncated
        complete
      />,
    );
    const preview = screen.getByLabelText("Highlighted file preview");
    expect(preview.closest(".code-preview")).toHaveAttribute(
      "data-render-mode",
      "plaintext",
    );
    expect(screen.getByText("Truncated preview")).toBeInTheDocument();
    expect(mocks.prepareSource).not.toHaveBeenCalled();
  });

  it("never renders an incomplete native chunk", () => {
    render(
      <CodePreview
        path="/repo/partial.ts"
        content="partial source"
        resolvedTheme="light"
        truncated={false}
        complete={false}
      />,
    );
    expect(screen.getByText("Preparing file preview…")).toBeInTheDocument();
    expect(screen.queryByText("partial source")).not.toBeInTheDocument();
    expect(mocks.prepareSource).not.toHaveBeenCalled();
  });

  it("uses bounded fixed-row virtualization for long documents", () => {
    const { container } = render(
      <CodePreview
        path="/repo/large.txt"
        content={previewContent(10_000)}
        resolvedTheme="light"
        truncated={false}
      />,
    );
    const preview = screen.getByLabelText("Highlighted file preview");
    expect(preview.closest(".code-preview")).toHaveAttribute(
      "data-line-count",
      "10000",
    );
    expect(container.querySelectorAll(".code-preview-line").length).toBeLessThan(
      200,
    );
    expect(container.querySelector(".code-preview-line")).toHaveStyle({
      transform: "translate3d(0, 12px, 0)",
    });
  });

  it("does not allow stale preparation to replace a newly selected file", async () => {
    const stale = deferred<PreparedSourceDocument>();
    mocks.prepareSource.mockImplementation((input: PrepareSourceDocumentInput) =>
      input.path.endsWith("A.tsx")
        ? stale.promise
        : Promise.resolve(highlightedDocument(input)),
    );
    const { rerender } = render(
      <CodePreview
        path="/repo/A.tsx"
        content="file A"
        resolvedTheme="light"
        truncated={false}
      />,
    );
    rerender(
      <CodePreview
        path="/repo/B.tsx"
        content="file B"
        resolvedTheme="light"
        truncated={false}
      />,
    );
    expect(await screen.findByText("file B")).toBeInTheDocument();

    await act(async () => {
      stale.resolve(
        highlightedDocument({
          path: "/repo/A.tsx",
          content: "file A",
          language: "tsx",
          truncated: false,
        }),
      );
      await stale.promise;
    });
    expect(screen.queryByText("file A")).not.toBeInTheDocument();
    expect(screen.getByText("file B")).toBeInTheDocument();
  });

  it("falls back once to stable plaintext when preparation fails", async () => {
    mocks.prepareSource.mockRejectedValue(new Error("grammar failed"));
    render(
      <CodePreview
        path="/repo/src/App.tsx"
        content="export const value = 1;"
        resolvedTheme="light"
        truncated={false}
      />,
    );
    expect(await screen.findByText("Plain text fallback")).toBeInTheDocument();
    expect(screen.getByText("export const value = 1;")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByLabelText("Highlighted file preview").closest(".code-preview"),
      ).toHaveAttribute("data-render-mode", "plaintext"),
    );
  });
});
