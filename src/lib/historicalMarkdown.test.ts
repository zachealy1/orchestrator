import { describe, expect, it } from "vitest";
import { renderHistoricalMarkdown } from "./historicalMarkdown";

describe("renderHistoricalMarkdown", () => {
  it("wraps each nested table without changing fenced examples or admitting raw HTML", async () => {
    const markdown = "| Name | Value |\n| --- | ---: |\n| Item | 42 |";
    const html = await renderHistoricalMarkdown([
      "- Nested table", "", ...markdown.split("\n").map((line) => `  ${line}`),
      "", ...markdown.split("\n").map((line) => `> ${line}`),
      "", "```md", markdown, "```", "",
      '<table onclick="alert(1)"><tr><td>Unsafe</td></tr></table>',
    ].join("\n"));
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelectorAll(".markdown-table-scroll > table")).toHaveLength(2);
    expect(document.querySelector("li .markdown-table-scroll")).not.toBeNull();
    expect(document.querySelector("blockquote .markdown-table-scroll")).not.toBeNull();
    expect(document.querySelector("pre code")?.textContent?.trim()).toBe(markdown);
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("Unsafe");
  });

  it("preserves Markdown structure and marks local file links as previewable", async () => {
    const html = await renderHistoricalMarkdown(
      [
        "## Updated",
        "",
        "- Added `hello-world.txt`",
        "- Verified the change",
        "",
        "[Open file](http://localhost:1420/Users/test/hello-world.txt)",
      ].join("\n"),
    );

    expect(html).toContain("<h2>Updated</h2>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<code>hello-world.txt</code>");
    expect(html).toContain('class="markdown-preview-link"');
    expect(html).toContain('title="Click to preview file"');
  });

  it("drops raw HTML and strips dangerous link protocols", async () => {
    const html = await renderHistoricalMarkdown(
      [
        "Before <script>alert('unsafe')</script> after.",
        "",
        "[Unsafe](javascript:alert('unsafe'))",
      ].join("\n"),
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Unsafe");
  });

  it("preserves file URLs for delegated preview handling", async () => {
    const html = await renderHistoricalMarkdown(
      "[Preview](file:///Users/test/project/src/App.tsx)",
    );

    expect(html).toContain('href="file:///Users/test/project/src/App.tsx"');
    expect(html).toContain('class="markdown-preview-link"');
  });

  it("repairs absolute macOS file links containing spaces", async () => {
    const html = await renderHistoricalMarkdown(
      "Added [batman.txt](/Users/test/Library/Application Support/com.example/card/batman.txt).",
    );

    expect(html).toContain(
      'href="/Users/test/Library/Application%20Support/com.example/card/batman.txt"',
    );
    expect(html).toContain('class="markdown-preview-link"');
    expect(html).not.toContain("[batman.txt](");
  });

  it("linkifies bare web URLs without weakening sanitization", async () => {
    const html = await renderHistoricalMarkdown(
      "Review https://example.com/docs?mode=full#setup, then continue.",
    );

    expect(html).toContain(
      '<a href="https://example.com/docs?mode=full#setup">https://example.com/docs?mode=full#setup</a>',
    );
    expect(html).not.toContain("href=\"javascript:");
  });
});
