import type { Link } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { ComposerContextFile } from "../composer/types";
import type { KanbanGitBinding } from "../kanban/api";
import type { AdditionalContextEntry } from "./types";
import { isImageContextFile } from "../../lib/imageAttachments";

type RepositoryBinding = Pick<KanbanGitBinding, "sourceRepositoryPath" | "worktreePath">;

export type ExecutionContextAttachment = {
  original: ComposerContextFile;
  file: ComposerContextFile;
  worktree: boolean;
};

function normalizePath(path: string) {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (part === "." || !part) continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `${path.startsWith("/") ? "/" : ""}${parts.join("/")}`;
}

function within(path: string, root: string) {
  return path === root || path.startsWith(`${root}/`);
}

const linkParser = unified().use(remarkParse);

function rewriteFileLinks(prompt: string, mapPath: (path: string) => string) {
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  visit(linkParser.parse(prompt), "link", (node: Link) => {
    let path: string;
    try {
      path = decodeURIComponent(node.url);
    } catch {
      return;
    }
    if (!path.startsWith("/")) return;
    const suffix = path.match(/(?::\d+(?::\d+)?|#L\d+(?:-L\d+)?)$/)?.[0] ?? "";
    if (suffix) path = path.slice(0, -suffix.length);
    const mapped = mapPath(path);
    if (mapped === path) return;

    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    // Edit only the destination span, leaving the exact label, title and
    // surrounding Markdown intact. Code spans/blocks aren't link nodes.
    const labelEnd = node.children[node.children.length - 1]?.position?.end.offset ?? start + 1;
    const marker = prompt.indexOf("](", labelEnd);
    if (marker < start || marker >= end) return;
    let destinationStart = marker + 2;
    while (/\s/.test(prompt[destinationStart] ?? "")) destinationStart++;
    const angle = prompt[destinationStart] === "<";
    if (angle) destinationStart++;
    let destinationEnd = destinationStart;
    let depth = 0;
    while (destinationEnd < end) {
      const char = prompt[destinationEnd];
      if (char === "\\") {
        destinationEnd += 2;
        continue;
      }
      if (angle ? char === ">" : /\s/.test(char) || (char === ")" && depth === 0)) break;
      if (char === "(") depth++;
      if (char === ")") depth--;
      destinationEnd++;
    }
    replacements.push({
      start: destinationStart,
      end: destinationEnd,
      text: encodeURI(mapped + suffix).replace(/#/g, "%23").replace(/\?/g, "%3F")
        .replace(/\(/g, "%28").replace(/\)/g, "%29"),
    });
  });
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    prompt = prompt.slice(0, replacement.start) + replacement.text + prompt.slice(replacement.end);
  }
  return prompt;
}

export function resolveExecutionContext(
  prompt: string,
  files: ComposerContextFile[],
  bindings: readonly RepositoryBinding[],
) {
  const roots = bindings.map((binding) => ({
    source: normalizePath(binding.sourceRepositoryPath),
    worktree: normalizePath(binding.worktreePath),
  })).filter(({ source, worktree }) => source && worktree)
    .sort((a, b) => b.source.length - a.source.length);
  const resolvePath = (path: string) => {
    const normalized = normalizePath(path);
    if (roots.some((root) => within(normalized, root.worktree))) {
      return { path, worktree: true };
    }
    const root = roots.find((candidate) => within(normalized, candidate.source));
    return root
      ? { path: root.worktree + normalized.slice(root.source.length), worktree: true }
      : { path, worktree: false };
  };
  const attachments: ExecutionContextAttachment[] = files.map((original) => {
    let resolved = resolvePath(original.path);
    if (!resolved.worktree && original.canonicalPath) {
      resolved = resolvePath(original.canonicalPath);
    }
    return {
      original,
      file: resolved.worktree
        ? { ...original, path: resolved.path, canonicalPath: undefined }
        : { ...original },
      worktree: resolved.worktree,
    };
  });
  return {
    prompt: roots.length ? rewriteFileLinks(prompt, (path) => {
      const attachment = attachments.find(({ original }) => original.path === path);
      return attachment?.worktree ? attachment.file.path : resolvePath(path).path;
    }) : prompt,
    attachments,
  };
}

export async function readExecutionFileContext(
  attachments: ExecutionContextAttachment[],
  dependencies: {
    readFile: (path: string) => Promise<string>;
    prepareImage: (file: ComposerContextFile) => Promise<ComposerContextFile>;
  },
) {
  const additionalContext: Record<string, AdditionalContextEntry> = {};
  const errors = new Map<string, string>();
  const skippedFiles: string[] = [];
  const files: ComposerContextFile[] = [];
  let attachmentError: Error | null = null;
  for (const attachment of attachments) {
    const { original, file, worktree } = attachment;
    try {
      if (isImageContextFile(file)) {
        files.push(worktree ? await dependencies.prepareImage(file) : file);
      } else {
        const content = await dependencies.readFile(file.path);
        additionalContext[`file:${file.path}`] = {
          kind: "untrusted",
          value: `File: ${file.path}\n\n${content}`,
        };
        files.push(file);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const detail = worktree
        ? `Attachment ${original.name} (${original.path}) is unavailable in the isolated worktree at ${file.path}: ${message}`
        : message;
      errors.set(original.path, detail);
      if (worktree) {
        attachmentError = new Error(detail);
        break;
      }
      skippedFiles.push(original.name);
    }
  }
  return { files, additionalContext: Object.keys(additionalContext).length ? additionalContext : null,
    errors, skippedFiles, attachmentError };
}
