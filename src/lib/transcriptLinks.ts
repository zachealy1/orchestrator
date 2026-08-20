import type { Link, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

export type SubmittedPromptWebLink = {
  start: number;
  end: number;
  href: string;
  label: string;
};

const submittedPromptLinkParser = unified().use(remarkParse).use(remarkGfm);

export function normalizeExternalTranscriptUrl(href: string) {
  try {
    const url = new URL(href.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function findSubmittedPromptWebLinks(
  prompt: string,
): SubmittedPromptWebLink[] {
  if (!/https?:\/\//iu.test(prompt)) return [];

  const tree = submittedPromptLinkParser.parse(prompt) as Root;
  const links: SubmittedPromptWebLink[] = [];

  visit(tree, "link", (node: Link) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    const href = normalizeExternalTranscriptUrl(node.url);
    if (start === undefined || end === undefined || !href || end <= start) {
      return;
    }

    const source = prompt.slice(start, end);
    if (/^https?:\/\//iu.test(source)) {
      links.push({ start, end, href, label: source });
      return;
    }

    if (/^<https?:\/\//iu.test(source) && source.endsWith(">")) {
      links.push({
        start: start + 1,
        end: end - 1,
        href,
        label: source.slice(1, -1),
      });
      return;
    }

    if (source.startsWith("[") && source.includes("](")) {
      const label = node.children
        .map((child) => ("value" in child ? String(child.value) : ""))
        .join("")
        .trim();
      if (label) {
        links.push({ start, end, href, label });
      }
    }
  });

  return links.sort((left, right) => left.start - right.start);
}
