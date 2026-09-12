import type { Element, Root } from "hast";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { rehypeMarkdownTables } from "./markdownPlugins";
import {
  isPreviewableSummaryLink,
  normalizePreviewableMarkdownLinks,
} from "./summaryLinks";

const historicalMarkdownSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), "file"],
  },
};

function markPreviewableLinks() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a") return;
      const href = node.properties?.href;
      if (typeof href !== "string" || !isPreviewableSummaryLink(href)) return;

      const currentClassName = node.properties.className;
      const classNames = Array.isArray(currentClassName)
        ? currentClassName.map(String)
        : typeof currentClassName === "string"
          ? currentClassName.split(/\s+/u).filter(Boolean)
          : [];
      if (!classNames.includes("markdown-preview-link")) {
        classNames.push("markdown-preview-link");
      }
      node.properties.className = classNames;
      node.properties.title = "Click to preview file";
    });
  };
}

const historicalMarkdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize, historicalMarkdownSchema)
  .use(rehypeMarkdownTables)
  .use(markPreviewableLinks)
  .use(rehypeStringify);

export async function renderHistoricalMarkdown(markdown: string) {
  const result = await historicalMarkdownProcessor.process(
    normalizePreviewableMarkdownLinks(markdown),
  );
  return String(result);
}

export function hashHistoricalMarkdown(markdown: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < markdown.length; index += 1) {
    hash ^= markdown.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}
