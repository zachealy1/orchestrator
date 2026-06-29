import { render, screen, waitFor, within } from "@testing-library/react";
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
  loadCodeHighlighter: vi.fn(),
}));

vi.mock("../lib/codePreview", () => ({
  applyPreviewSemanticTokenColors: mocks.applyPreviewSemanticTokenColors,
  codePreviewTheme: mocks.codePreviewTheme,
  detectPreviewLanguage: mocks.detectPreviewLanguage,
  loadCodeHighlighter: mocks.loadCodeHighlighter,
}));

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
    expect(within(preview).getByText("export")).toHaveStyle({
      color: "#d73a49",
    });
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
    expect(screen.getByText("Plain text")).toBeInTheDocument();
    expect(within(preview).getByText("1")).toBeInTheDocument();
    expect(within(preview).getByText("first line")).toBeInTheDocument();
    expect(mocks.loadCodeHighlighter).not.toHaveBeenCalled();
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

  it("keeps the code view usable when highlighting fails", async () => {
    mocks.loadCodeHighlighter.mockRejectedValue(new Error("grammar failed"));

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
