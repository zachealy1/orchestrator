import { act, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CodePreview } from "./CodePreview";

const mocks = vi.hoisted(() => ({
  codeToTokens: vi.fn(),
  codePreviewTheme: vi.fn((theme: "light" | "dark") =>
    theme === "light" ? "github-light" : "github-dark",
  ),
  applyPreviewSemanticTokenColors: vi.fn((language: string, tokenLines: any[][]) => {
    if (language !== "json") {
      return tokenLines.map((line) =>
        line.map((token) => ({ ...token, semantic: undefined })),
      );
    }

    const flatTokens = tokenLines.flatMap((line, lineIndex) =>
      line.map((token, tokenIndex) => ({ lineIndex, tokenIndex, token })),
    );

    return tokenLines.map((line, lineIndex) =>
      line.map((token, tokenIndex) => {
        const flatIndex = flatTokens.findIndex(
          (entry) => entry.lineIndex === lineIndex && entry.tokenIndex === tokenIndex,
        );
        const nextToken = flatTokens
          .slice(flatIndex + 1)
          .find((entry) => entry.token.content.trim())?.token.content.trim();
        const content = token.content.trim();
        const isJsonString = /^"(?:\\.|[^"\\])*"$/.test(content);
        const isKey = isJsonString && nextToken?.startsWith(":");
        const isValue =
          !isKey &&
          (isJsonString ||
            /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(content) ||
            /^(?:true|false|null)$/.test(content));
        return {
          ...token,
          semantic: isKey ? "json-key" : isValue ? "json-value" : undefined,
        };
      }),
    );
  }),
  detectPreviewLanguage: vi.fn((path: string) =>
    path.endsWith(".tsx") ? "tsx" : path.endsWith(".json") ? "json" : "plaintext",
  ),
  highlightPreviewContent: vi.fn(),
  loadCodeHighlighter: vi.fn(),
}));

vi.mock("../lib/codePreview", () => ({
  applyPreviewSemanticTokenColors: mocks.applyPreviewSemanticTokenColors,
  codePreviewTheme: mocks.codePreviewTheme,
  detectPreviewLanguage: mocks.detectPreviewLanguage,
  highlightPreviewContent: mocks.highlightPreviewContent,
  loadCodeHighlighter: mocks.loadCodeHighlighter,
}));

vi.mock("../lib/codePreviewHighlighting", () => ({
  codePreviewHighlightingService: {
    highlight: mocks.highlightPreviewContent,
  },
}));

function previewContent(lineCount: number, prefix = "line") {
  return Array.from(
    { length: lineCount },
    (_, index) => `${prefix} ${index + 1}`,
  ).join("\n");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

describe("CodePreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.codeToTokens.mockReturnValue({
      tokens: [
        [
          { content: "export", color: "#d73a49" },
          { content: " const value = 1;", color: "#24292e" },
        ],
        [{ content: "console.log(value);", color: "#005cc5" }],
      ],
    });
    mocks.codePreviewTheme.mockImplementation((theme: "light" | "dark") =>
      theme === "light" ? "github-light" : "github-dark",
    );
    mocks.detectPreviewLanguage.mockImplementation((path: string) =>
      path.endsWith(".tsx") ? "tsx" : path.endsWith(".json") ? "json" : "plaintext",
    );
    mocks.loadCodeHighlighter.mockResolvedValue({
      codeToTokens: mocks.codeToTokens,
    });
    mocks.highlightPreviewContent.mockImplementation(
      async ({
        content,
        language,
        resolvedTheme,
      }: {
        content: string;
        language: string;
        resolvedTheme: "light" | "dark";
      }) => {
        const theme = mocks.codePreviewTheme(resolvedTheme);
        const result = mocks.codeToTokens(content, {
          lang: language,
          theme,
        });
        return mocks.applyPreviewSemanticTokenColors(language, result.tokens);
      },
    );
  });

  it("renders line numbers and highlighted tokens for known extensions", async () => {
    render(
      <CodePreview
        path="/repo/src/App.tsx"
        content={"export const value = 1;\nconsole.log(value);"}
        resolvedTheme="light"
        truncated={false}
      />,
    );

    const preview = screen.getByLabelText("Highlighted file preview");
    expect(preview.closest(".code-preview")).toHaveAttribute("data-language", "tsx");
    expect(preview.closest(".code-preview")).toHaveAttribute(
      "data-shiki-theme",
      "github-light",
    );
    expect(within(preview).getByText("1")).toBeInTheDocument();
    expect(within(preview).getByText("2")).toBeInTheDocument();

    await waitFor(() =>
      expect(mocks.codeToTokens).toHaveBeenCalledWith(
        "export const value = 1;\nconsole.log(value);",
        { lang: "tsx", theme: "github-light" },
      ),
    );
    await waitFor(() =>
      expect(within(preview).getByText("export")).toHaveStyle({
        color: "#d73a49",
      }),
    );
  });

  it("renders unknown extensions as plaintext with the same code layout", () => {
    render(
      <CodePreview
        path="/repo/schema.custom"
        content={"first line\nsecond line"}
        resolvedTheme="light"
        truncated={false}
      />,
    );

    const preview = screen.getByLabelText("Highlighted file preview");
    expect(preview.closest(".code-preview")).toHaveAttribute(
      "data-language",
      "plaintext",
    );
    expect(screen.queryByText("Plain text")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Preview metadata")).not.toBeInTheDocument();
    expect(within(preview).getByText("1")).toBeInTheDocument();
    expect(within(preview).getByText("first line")).toBeInTheDocument();
    expect(mocks.highlightPreviewContent).not.toHaveBeenCalled();
  });

  it("uses the dark Shiki theme when the app is in dark mode", async () => {
    render(
      <CodePreview
        path="/repo/src/App.tsx"
        content="export const value = 1;"
        resolvedTheme="dark"
        truncated={false}
      />,
    );

    await waitFor(() =>
      expect(mocks.codeToTokens).toHaveBeenCalledWith(
        "export const value = 1;",
        { lang: "tsx", theme: "github-dark" },
      ),
    );
    expect(mocks.codePreviewTheme).toHaveBeenCalledWith("dark");
  });

  it("adds contrasting semantic styles for JSON keys and values", async () => {
    mocks.codeToTokens.mockReturnValue({
      tokens: [
        [{ content: "{", color: "#24292e" }],
        [
          { content: "  ", color: "#24292e" },
          { content: "\"name\"", color: "#005cc5" },
          { content: ": ", color: "#24292e" },
          { content: "\"orchestrator\"", color: "#032f62" },
          { content: ",", color: "#24292e" },
        ],
        [
          { content: "  ", color: "#24292e" },
          { content: "\"enabled\"", color: "#005cc5" },
          { content: ": ", color: "#24292e" },
          { content: "true", color: "#005cc5" },
          { content: ",", color: "#24292e" },
        ],
        [
          { content: "  ", color: "#24292e" },
          { content: "\"count\"", color: "#005cc5" },
          { content: ": ", color: "#24292e" },
          { content: "42", color: "#005cc5" },
        ],
        [{ content: "}", color: "#24292e" }],
      ],
    });

    render(
      <CodePreview
        path="/repo/package.json"
        content={'{\n  "name": "orchestrator",\n  "enabled": true,\n  "count": 42\n}'}
        resolvedTheme="light"
        truncated={false}
      />,
    );

    await waitFor(() =>
      expect(mocks.codeToTokens).toHaveBeenCalledWith(
        '{\n  "name": "orchestrator",\n  "enabled": true,\n  "count": 42\n}',
        { lang: "json", theme: "github-light" },
      ),
    );

    await waitFor(() => expect(screen.getByText("\"name\"")).toBeInTheDocument());

    expect(screen.getByText("\"name\"")).toHaveClass("json-key");
    expect(screen.getByText("\"orchestrator\"")).toHaveClass("json-value");
    expect(screen.getByText("true")).toHaveClass("json-value");
    expect(screen.getByText("42")).toHaveClass("json-value");
    expect(screen.getByText("\"name\"")).not.toHaveStyle({ color: "#005cc5" });
    expect(screen.getByText("\"orchestrator\"")).not.toHaveStyle({
      color: "#032f62",
    });
  });

  it("shows truncated preview metadata", () => {
    render(
      <CodePreview
        path="/repo/large.txt"
        content="export const value = 1;"
        resolvedTheme="light"
        truncated
      />,
    );

    expect(screen.getByText("Truncated")).toBeInTheDocument();
  });

  it.each([
    { lineCount: 9, lineNumberDigits: 1 },
    { lineCount: 1_000, lineNumberDigits: 4 },
    { lineCount: 10_000, lineNumberDigits: 5 },
  ])(
    "sizes a bounded $lineCount-line preview from its $lineNumberDigits-digit maximum line number",
    ({ lineCount, lineNumberDigits }) => {
      const { container } = render(
        <CodePreview
          path={`/repo/${lineCount}-lines.txt`}
          content={previewContent(lineCount)}
          resolvedTheme="light"
          truncated={false}
        />,
      );

      const preview = container.querySelector(".code-preview");
      const renderedRows = container.querySelectorAll(".code-preview-line");

      expect(preview).toHaveAttribute("data-line-count", String(lineCount));
      expect(preview).toHaveAttribute(
        "data-line-number-digits",
        String(lineNumberDigits),
      );
      expect((preview as HTMLElement).style.getPropertyValue(
        "--code-preview-gutter-width",
      )).toBe(`calc(${lineNumberDigits}ch + 25px)`);
      expect(renderedRows.length).toBeGreaterThan(0);
      expect(renderedRows.length).toBeLessThanOrEqual(Math.min(lineCount, 99));
      expect(screen.getByText("line 1")).toBeInTheDocument();
    },
  );

  it.each([
    { content: "", expectedLines: 1, label: "an empty file" },
    { content: "line one\n", expectedLines: 2, label: "a trailing newline" },
  ])("keeps the final editable row for $label", ({ content, expectedLines }) => {
    const { container } = render(
      <CodePreview
        path="/repo/edge-case.txt"
        content={content}
        resolvedTheme="light"
        truncated={false}
      />,
    );

    expect(container.querySelector(".code-preview")).toHaveAttribute(
      "data-line-count",
      String(expectedLines),
    );
  });

  it("renders a usable virtualized fallback immediately while a large file is highlighting", () => {
    const pendingHighlight = deferred<any[][]>();
    mocks.highlightPreviewContent.mockReturnValue(pendingHighlight.promise);

    const { container } = render(
      <CodePreview
        path="/repo/large.tsx"
        content={previewContent(10_000, "pending line")}
        resolvedTheme="light"
        truncated={false}
      />,
    );

    expect(mocks.highlightPreviewContent).toHaveBeenCalledTimes(1);
    expect(screen.getByText("pending line 1")).toBeInTheDocument();
    expect(container.querySelectorAll(".code-preview-line").length).toBeLessThan(100);
    expect(container.querySelector(".code-preview")).toHaveAttribute(
      "data-line-count",
      "10000",
    );
    expect(screen.queryByLabelText("Preview metadata")).not.toBeInTheDocument();
  });

  it("keeps an incremental preview plaintext and preserves scroll when it completes", async () => {
    const initialContent = previewContent(1_000, "partial line");
    const completeContent = `${initialContent}\nfinal line`;
    const { rerender } = render(
      <CodePreview
        path="/repo/large.tsx"
        content={initialContent}
        resolvedTheme="light"
        truncated={false}
        complete={false}
        version="large-v1"
      />,
    );
    const scrollElement = screen.getByLabelText("Highlighted file preview");

    expect(screen.getByText("Loading complete file…")).toBeInTheDocument();
    expect(mocks.highlightPreviewContent).not.toHaveBeenCalled();
    scrollElement.scrollTop = 400;

    rerender(
      <CodePreview
        path="/repo/large.tsx"
        content={completeContent}
        resolvedTheme="light"
        truncated={false}
        complete
        version="large-v1"
      />,
    );

    expect(scrollElement.scrollTop).toBe(400);
    expect(screen.queryByText("Loading complete file…")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.highlightPreviewContent).toHaveBeenCalledOnce());
  });

  it("does not let a stale highlight replace a newly selected file", async () => {
    const staleHighlight = deferred<any[][]>();
    mocks.highlightPreviewContent.mockImplementation(({ path }: { path: string }) =>
      path.endsWith("/A.tsx")
        ? staleHighlight.promise
        : Promise.resolve([
            [{ content: "fresh highlighted B", color: "#005cc5" }],
          ]),
    );

    const { container, rerender } = render(
      <CodePreview
        path="/repo/A.tsx"
        content="raw file A"
        resolvedTheme="light"
        truncated={false}
      />,
    );

    expect(screen.getByText("raw file A")).toBeInTheDocument();
    const scrollElement = screen.getByLabelText("Highlighted file preview");
    scrollElement.scrollTop = 900;
    scrollElement.scrollLeft = 120;

    rerender(
      <CodePreview
        path="/repo/B.tsx"
        content="raw file B"
        resolvedTheme="light"
        truncated={false}
      />,
    );

    expect(screen.getByText("raw file B")).toBeInTheDocument();
    expect(scrollElement.scrollTop).toBe(0);
    expect(scrollElement.scrollLeft).toBe(0);
    expect(await screen.findByText("fresh highlighted B")).toHaveStyle({
      color: "#005cc5",
    });

    await act(async () => {
      staleHighlight.resolve([
        [{ content: "stale highlighted A", color: "#d73a49" }],
      ]);
      await staleHighlight.promise;
    });

    expect(screen.queryByText("stale highlighted A")).not.toBeInTheDocument();
    expect(screen.getByText("fresh highlighted B")).toBeInTheDocument();
    expect(container.querySelector(".code-preview")).toHaveAttribute(
      "data-line-count",
      "1",
    );
    expect(mocks.highlightPreviewContent).toHaveBeenCalledTimes(2);
  });

  it("keeps the code view usable when highlighting fails", async () => {
    mocks.highlightPreviewContent.mockRejectedValue(new Error("grammar failed"));

    render(
      <CodePreview
        path="/repo/src/App.tsx"
        content="export const value = 1;"
        resolvedTheme="light"
        truncated={false}
      />,
    );

    expect(screen.getByText("export const value = 1;")).toBeInTheDocument();
    expect(await screen.findByText("Plain text fallback")).toBeInTheDocument();
  });
});
