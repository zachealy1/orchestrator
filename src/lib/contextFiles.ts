import {
  ORCHESTRATOR_CONTEXT_FILE_MIME,
  type ComposerContextFile,
} from "../types";

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

function readContextFile(value: unknown): ComposerContextFile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const file = value as Record<string, unknown>;
  if (typeof file.path !== "string" || typeof file.name !== "string") {
    return null;
  }

  return {
    path: file.path,
    name: file.name,
    source: "explorer",
    status: "ready",
  };
}

function readNativeDroppedFile(file: File): ComposerContextFile | null {
  const path = readNativeFilePath(file);
  if (!path) {
    return null;
  }

  return {
    path,
    name: file.name || basename(path),
    source: "explorer",
    status: "ready",
  };
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
