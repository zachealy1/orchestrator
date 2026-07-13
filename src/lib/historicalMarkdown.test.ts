import { describe, expect, it } from "vitest";
import { renderHistoricalMarkdown } from "./historicalMarkdown";

describe("renderHistoricalMarkdown", () => {
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
});
