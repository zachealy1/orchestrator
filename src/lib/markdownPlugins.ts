import type { Element, Root } from "hast";
import remarkGfm from "remark-gfm";
import { SKIP, visit } from "unist-util-visit";

// Use the same table structure in React and worker-prepared historical HTML.
// Keep the native table display so column sizing and accessibility stay intact.
export function rehypeMarkdownTables() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "table" || index === undefined || !parent) return;

      node.properties.className = ["markdown-table"];
      node.properties.dir = "auto";
      parent.children[index] = {
        type: "element",
        tagName: "div",
        properties: {
          className: ["markdown-table-scroll"],
          role: "region",
          ariaLabel: "Table",
          tabIndex: 0,
        },
        children: [node],
      };
      return SKIP;
    });
  };
}

export const TRANSCRIPT_MARKDOWN_PLUGINS = {
  remarkPlugins: [remarkGfm],
  rehypePlugins: [rehypeMarkdownTables],
};
