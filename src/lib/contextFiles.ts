import {
  ORCHESTRATOR_CONTEXT_FILE_MIME,
  type ComposerContextFile,
} from "../types";
import { normalizeContextFileMedia } from "./imageAttachments";

type ContextDataTransfer = Pick<DataTransfer, "getData" | "types"> & {
  files?: ArrayLike<File> | null;
};

export function hasContextFilePayload(dataTransfer: ContextDataTransfer) {
  const types = Array.from(dataTransfer.types ?? []);
  return (
    types.includes(ORCHESTRATOR_CONTEXT_FILE_MIME) ||
    types.includes("Files") ||
    (dataTransfer.files?.length ?? 0) > 0
  );
}

export function readDroppedContextFiles(dataTransfer: ContextDataTransfer) {
  const raw = dataTransfer.getData(ORCHESTRATOR_CONTEXT_FILE_MIME);
  const files: ComposerContextFile[] = [];
  let skipped = 0;

  if (raw) {
    try {
      const payload = JSON.parse(raw);
      const payloadFiles = Array.isArray(payload) ? payload : [payload];
      files.push(
        ...payloadFiles
          .map(readContextFile)
          .filter((file): file is ComposerContextFile => file !== null),
      );
    } catch {
      skipped += 1;
    }
  }

  for (const file of Array.from(dataTransfer.files ?? [])) {
    const dropped = readNativeDroppedFile(file);
    if (dropped) {
      files.push(dropped);
    } else {
      skipped += 1;
    }
  }

  return { files, skipped };
}

export function contextFileExtensionLabel(name: string) {
  const normalized = name.trim();
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === normalized.length - 1) {
    return "FILE";
  }
  return normalized.slice(dotIndex + 1).toUpperCase();
}

export function contextFileDisplayReference(file: ComposerContextFile) {
  return `${contextFileExtensionLabel(file.name)} ${file.name}`;
}

export function contextFileLineReference(
  file: ComposerContextFile,
  line = 1,
) {
  return `${file.path}:${line}`;
}

export function contextFileMarkdownReference(
  file: ComposerContextFile,
  line = 1,
) {
  const label = file.name.replace(/([\\\[\]])/g, "\\$1");
  const destination = encodeURI(contextFileLineReference(file, line))
    .replace(/#/g, "%23")
    .replace(/\?/g, "%3F")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
  return `[${label}](${destination})`;
}

export function contextFileInlineReferenceTokens(file: ComposerContextFile) {
  return Array.from(
    new Set([
      contextFileMarkdownReference(file),
      contextFileDisplayReference(file),
      file.name,
    ]),
  );
}

export function serializePromptInlineFileReferences(
  prompt: string,
  files: ComposerContextFile[],
) {
  return rewritePromptFileReferences(prompt, files, "markdown");
}

export function restorePromptInlineFileReferencesForComposer(
  prompt: string,
  files: ComposerContextFile[],
) {
  return rewritePromptFileReferences(prompt, files, "display", true);
}

function rewritePromptFileReferences(
  prompt: string,
  files: ComposerContextFile[],
  output: "markdown" | "display",
  markdownOnly = false,
) {
  const candidates = files
    .filter((file) => file.name.trim().length > 0)
    .flatMap((file) => {
      const markdownToken = contextFileMarkdownReference(file);
      const tokens = markdownOnly
        ? [markdownToken]
        : contextFileInlineReferenceTokens(file);
      return tokens.map((token) => ({ file, token, markdownToken }));
    })
    .sort((left, right) => right.token.length - left.token.length);

  if (candidates.length === 0) {
    return prompt;
  }

  let result = "";
  let cursor = 0;
  while (cursor < prompt.length) {
    const match = candidates.find(
      (candidate) =>
        prompt.startsWith(candidate.token, cursor) &&
        isPromptTokenBoundary(prompt, cursor, candidate.token),
    );
    if (!match) {
      result += prompt[cursor];
      cursor += 1;
      continue;
    }

    result +=
      output === "markdown"
        ? match.markdownToken
        : contextFileDisplayReference(match.file);
    cursor += match.token.length;
  }

  return result;
}

function isPromptTokenBoundary(prompt: string, index: number, token: string) {
  const before = index === 0 ? "" : prompt[index - 1];
  const after = prompt[index + token.length] ?? "";
  return !isFileNameCharacter(before) && !isFileNameCharacter(after);
}

function isFileNameCharacter(value: string) {
  return /[A-Za-z0-9_.-]/.test(value);
}

function readContextFile(value: unknown): ComposerContextFile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const file = value as Record<string, unknown>;
  if (typeof file.path !== "string" || typeof file.name !== "string") {
    return null;
  }

  return normalizeContextFileMedia({
    path: file.path,
    name: file.name,
    source: "explorer",
    status: "ready",
  });
}

function readNativeDroppedFile(file: File): ComposerContextFile | null {
  const path = readNativeFilePath(file);
  if (!path) {
    return null;
  }

  return normalizeContextFileMedia({
    path,
    name: file.name || basename(path),
    source: "explorer",
    status: "ready",
  });
}

function readNativeFilePath(file: File) {
  const candidate = file as File & { path?: unknown };
  return typeof candidate.path === "string" && candidate.path.trim()
    ? candidate.path
    : null;
}

function basename(path: string) {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? path;
}
