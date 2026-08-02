import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { TaskChatEntry } from "../conversations/types";

const PLAN_PREVIEW_BLOCK_LIMIT = 5;
const PLAN_PREVIEW_CHARACTER_LIMIT = 1_600;
const PLAN_PREVIEW_LINE_LIMIT = 14;

type PositionedMarkdownNode = {
  type: string;
  position?: {
    start: { offset?: number };
    end: { offset?: number };
  };
};

export type NativePlanPreview = {
  isLong: boolean;
  previewText: string;
};

export type NativePlanDisclosureChange = {
  anchorElement: HTMLElement;
  anchorTop: number;
  expanded: boolean;
  planKey: string;
};

export type NativePlanDisclosureChangeHandler = (
  change: NativePlanDisclosureChange,
) => void;

const planMarkdownParser = unified().use(remarkParse).use(remarkGfm);

function markdownNodeEndOffset(node: PositionedMarkdownNode) {
  return node.position?.end.offset ?? 0;
}

function markdownNodeSource(text: string, node: PositionedMarkdownNode) {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return "";
  return text.slice(start, end);
}

export function buildNativePlanPreview(text: string): NativePlanPreview {
  const lineCount = text.split(/\r?\n/).length;
  try {
    const tree = planMarkdownParser.parse(text) as unknown as {
      children: PositionedMarkdownNode[];
    };
    const definitions = tree.children.filter(
      (node) => node.type === "definition",
    );
    const content = tree.children.filter(
      (node) => node.type !== "definition",
    );
    const isLong =
      content.length > PLAN_PREVIEW_BLOCK_LIMIT ||
      text.length > PLAN_PREVIEW_CHARACTER_LIMIT ||
      lineCount > PLAN_PREVIEW_LINE_LIMIT;
    if (!isLong) return { isLong: false, previewText: text };

    const selected = content.slice(0, PLAN_PREVIEW_BLOCK_LIMIT);
    const boundary = selected.reduce(
      (furthest, node) => Math.max(furthest, markdownNodeEndOffset(node)),
      0,
    );
    const definitionText = definitions
      .filter((node) => (node.position?.start.offset ?? 0) >= boundary)
      .map((node) => markdownNodeSource(text, node))
      .filter(Boolean)
      .join("\n\n");
    const preview = text.slice(0, boundary || text.length).trimEnd();
    return {
      isLong: true,
      previewText: definitionText ? `${preview}\n\n${definitionText}` : preview,
    };
  } catch {
    return {
      isLong:
        text.length > PLAN_PREVIEW_CHARACTER_LIMIT ||
        lineCount > PLAN_PREVIEW_LINE_LIMIT,
      previewText: text,
    };
  }
}

export function nativePlanDisclosureKey(entry: TaskChatEntry) {
  const plan = entry.runView.nativePlan;
  const text = plan.completedText || plan.previewText;
  return [
    entry.clientId,
    plan.planItemId ?? "plan",
    plan.completedTurnId ?? "draft",
    contentRevision(text),
  ].join(":");
}

export function editedFilesDisclosureKey(entry: TaskChatEntry) {
  const revision = entry.runView.editedFiles
    .map(
      (file) =>
        `${file.path}:${file.status}:${file.additions}:${file.deletions}`,
    )
    .join("|");
  return `${entry.clientId}:edited-files:${contentRevision(revision)}`;
}

function contentRevision(text: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${text.length}-${(hash >>> 0).toString(36)}`;
}
