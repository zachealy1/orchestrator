import {
  readWorkspaceFilePreview,
  readWorkspaceFilePreviewChunk,
  readWorkspaceFilePreviewVersion,
} from "../../codexClient";
import type { WorkspaceFilePreview } from "./types";

export const FILE_PREVIEW_CACHE_MAX_ENTRIES = 8;
export const FILE_PREVIEW_CACHE_MAX_CHARACTERS = 12_000_000;
export const FILE_PREVIEW_MONOLITHIC_MAX_BYTES = 2 * 1024 * 1024;

export type WorkspaceFilePreviewReader = {
  readInitial: (
    workspacePath: string,
    filePath: string,
  ) => Promise<WorkspaceFilePreview>;
  readChunk: (
    workspacePath: string,
    filePath: string,
    offset: number,
    version: string,
  ) => Promise<WorkspaceFilePreview>;
  readVersion: (workspacePath: string, filePath: string) => Promise<string>;
};

export type WorkspaceFilePreviewLoadOptions = {
  forceRefresh?: boolean;
  onInitialPreview?: (preview: WorkspaceFilePreview) => void;
  shouldContinue?: () => boolean;
};

type CachedPreview = {
  preview: WorkspaceFilePreview;
  sourceCharacters: number;
};

type IncrementalPreviewLineIndex = {
  lines: string[];
  remainderSegments: string[];
  pendingCarriageReturn: boolean;
  sourceCharacters: number;
};

const nativeReader: WorkspaceFilePreviewReader = {
  readInitial: readWorkspaceFilePreview,
  readChunk: readWorkspaceFilePreviewChunk,
  readVersion: readWorkspaceFilePreviewVersion,
};

export function workspacePreviewCacheKey(
  workspacePath: string,
  filePath: string,
) {
  return `${workspacePath}\u0000${filePath}`;
}

export function workspaceFilePreviewIsComplete(
  preview: WorkspaceFilePreview,
) {
  return preview.complete !== false;
}

export function previewFileSourceCharacters(preview: WorkspaceFilePreview) {
  return preview.sourceCharacters ?? preview.content.length;
}

export class WorkspaceFilePreviewService {
  readonly #complete = new Map<string, CachedPreview>();
  readonly #partial = new Map<string, WorkspaceFilePreview>();
  readonly #requests = new Map<string, Promise<WorkspaceFilePreview>>();
  readonly #generations = new Map<string, number>();
  #cachedSourceCharacters = 0;

  constructor(
    private readonly reader: WorkspaceFilePreviewReader = nativeReader,
    private readonly maxEntries = FILE_PREVIEW_CACHE_MAX_ENTRIES,
    private readonly maxSourceCharacters =
      FILE_PREVIEW_CACHE_MAX_CHARACTERS,
    private readonly monolithicMaxBytes =
      FILE_PREVIEW_MONOLITHIC_MAX_BYTES,
  ) {}

  getCached(workspacePath: string, filePath: string) {
    const key = workspacePreviewCacheKey(workspacePath, filePath);
    const cached = this.#complete.get(key);
    if (!cached) {
      return null;
    }

    this.#complete.delete(key);
    this.#complete.set(key, cached);
    return cached.preview;
  }

  getPartial(workspacePath: string, filePath: string) {
    return (
      this.#partial.get(workspacePreviewCacheKey(workspacePath, filePath)) ??
      null
    );
  }

  getVisible(workspacePath: string, filePath: string) {
    return (
      this.getCached(workspacePath, filePath) ??
      this.getPartial(workspacePath, filePath)
    );
  }

  async getValidatedCached(workspacePath: string, filePath: string) {
    const cached = this.getCached(workspacePath, filePath);
    if (!cached?.version) {
      return cached;
    }

    try {
      const currentVersion = await this.reader.readVersion(
        workspacePath,
        filePath,
      );
      if (currentVersion === cached.version) {
        return cached;
      }
    } catch {
      // A version read failure makes the cached bytes unsafe to reuse. The
      // following load will surface a native read error if the file is gone.
    }

    this.invalidate(workspacePath, filePath);
    return null;
  }

  load(
    workspacePath: string,
    filePath: string,
    options: WorkspaceFilePreviewLoadOptions = {},
  ) {
    if (options.forceRefresh) {
      this.invalidate(workspacePath, filePath);
    }

    const cached = this.getCached(workspacePath, filePath);
    if (cached) {
      return Promise.resolve(cached);
    }

    const key = workspacePreviewCacheKey(workspacePath, filePath);
    const existing = this.#requests.get(key);
    if (existing) {
      return existing;
    }

    const generation = this.#generations.get(key) ?? 0;
    const shouldContinue = () =>
      (this.#generations.get(key) ?? 0) === generation &&
      (options.shouldContinue?.() ?? true);
    const request = this.#readComplete(
      workspacePath,
      filePath,
      (preview) => {
        if (!shouldContinue()) {
          return;
        }
        if (workspaceFilePreviewIsComplete(preview)) {
          this.#partial.delete(key);
        } else {
          this.#partial.set(key, preview);
        }
        options.onInitialPreview?.(preview);
      },
      shouldContinue,
    )
      .then((preview) => {
        if (!shouldContinue()) {
          throw filePreviewLoadCancelledError();
        }
        this.#partial.delete(key);
        this.#cacheComplete(key, preview);
        return preview;
      })
      .catch((error) => {
        if (
          error instanceof Error &&
          error.name === "AbortError" &&
          (this.#generations.get(key) ?? 0) === generation
        ) {
          this.#partial.delete(key);
        }
        throw error;
      });

    this.#requests.set(key, request);
    void request
      .finally(() => {
        if (this.#requests.get(key) === request) {
          this.#requests.delete(key);
        }
      })
      .catch(() => undefined);
    return request;
  }

  invalidate(workspacePath: string, filePath?: string) {
    const prefix = `${workspacePath}\u0000`;
    const targetKey = filePath
      ? workspacePreviewCacheKey(workspacePath, filePath)
      : null;
    const keys = new Set<string>();

    if (targetKey) {
      keys.add(targetKey);
    } else {
      for (const collection of [
        this.#complete,
        this.#partial,
        this.#requests,
        this.#generations,
      ]) {
        for (const key of collection.keys()) {
          if (key.startsWith(prefix)) {
            keys.add(key);
          }
        }
      }
    }

    for (const key of keys) {
      this.#generations.set(key, (this.#generations.get(key) ?? 0) + 1);
      this.#deleteComplete(key);
      this.#partial.delete(key);
      this.#requests.delete(key);
    }
  }

  clear() {
    const keys = new Set([
      ...this.#complete.keys(),
      ...this.#partial.keys(),
      ...this.#requests.keys(),
    ]);
    for (const key of keys) {
      this.#generations.set(key, (this.#generations.get(key) ?? 0) + 1);
    }
    this.#complete.clear();
    this.#partial.clear();
    this.#requests.clear();
    this.#cachedSourceCharacters = 0;
  }

  getStats() {
    return {
      completeEntries: this.#complete.size,
      partialEntries: this.#partial.size,
      inFlightRequests: this.#requests.size,
      sourceCharacters: this.#cachedSourceCharacters,
    };
  }

  #cacheComplete(key: string, preview: WorkspaceFilePreview) {
    this.#deleteComplete(key);
    const sourceCharacters = previewFileSourceCharacters(preview);
    if (
      !workspaceFilePreviewIsComplete(preview) ||
      this.maxEntries <= 0 ||
      this.maxSourceCharacters <= 0 ||
      sourceCharacters > this.maxSourceCharacters
    ) {
      return;
    }

    this.#complete.set(key, { preview, sourceCharacters });
    this.#cachedSourceCharacters += sourceCharacters;
    while (
      this.#complete.size > this.maxEntries ||
      this.#cachedSourceCharacters > this.maxSourceCharacters
    ) {
      const oldestKey = this.#complete.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.#deleteComplete(oldestKey);
    }
  }

  #deleteComplete(key: string) {
    const cached = this.#complete.get(key);
    if (!cached) {
      return;
    }
    this.#complete.delete(key);
    this.#cachedSourceCharacters -= cached.sourceCharacters;
  }

  async #readComplete(
    workspacePath: string,
    filePath: string,
    onInitialPreview: (preview: WorkspaceFilePreview) => void,
    shouldContinue: () => boolean,
  ) {
    // Retry the bounded transfer once if native version validation reports
    // that the file changed between chunks.
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!shouldContinue()) {
        throw filePreviewLoadCancelledError();
      }
      try {
        const initial = await this.reader.readInitial(workspacePath, filePath);
        onInitialPreview(initial);
        if (initial.isBinary || workspaceFilePreviewIsComplete(initial)) {
          return initial;
        }
        if (!shouldContinue()) {
          throw filePreviewLoadCancelledError();
        }

        const totalBytes = initial.totalBytes;
        const version = initial.version;
        let nextOffset = initial.nextOffset;
        if (
          !Number.isSafeInteger(totalBytes) ||
          !Number.isSafeInteger(nextOffset) ||
          typeof version !== "string" ||
          !version ||
          (nextOffset ?? 0) <= 0 ||
          (totalBytes ?? -1) < (nextOffset ?? 0)
        ) {
          throw new Error("File preview returned invalid chunk metadata.");
        }

        const lineIndex =
          (totalBytes as number) > this.monolithicMaxBytes
            ? createPreviewLineIndex()
            : null;
        const chunks = lineIndex ? null : [initial.content];
        if (lineIndex) {
          appendPreviewLineChunk(lineIndex, initial.content);
        }

        while ((nextOffset as number) < (totalBytes as number)) {
          if (!shouldContinue()) {
            throw filePreviewLoadCancelledError();
          }
          const chunk = await this.reader.readChunk(
            workspacePath,
            filePath,
            nextOffset as number,
            version,
          );
          if (!shouldContinue()) {
            throw filePreviewLoadCancelledError();
          }
          if (chunk.version !== version) {
            throw new Error("File changed while its preview was loading.");
          }
          if (chunk.isBinary) {
            return {
              ...initial,
              ...chunk,
              content: "",
              truncated: false,
              complete: true,
            };
          }

          const chunkNextOffset = chunk.nextOffset;
          if (
            !Number.isSafeInteger(chunkNextOffset) ||
            (chunkNextOffset ?? 0) <= (nextOffset as number) ||
            (chunkNextOffset ?? 0) > (totalBytes as number)
          ) {
            throw new Error("File preview did not advance to the next chunk.");
          }
          if (lineIndex) {
            appendPreviewLineChunk(lineIndex, chunk.content);
          } else {
            chunks?.push(chunk.content);
          }
          nextOffset = chunkNextOffset;
        }

        const indexedLines = lineIndex
          ? finishPreviewLineIndex(lineIndex)
          : undefined;
        return {
          ...initial,
          content: chunks?.join("") ?? "",
          truncated: false,
          isBinary: false,
          complete: true,
          nextOffset: totalBytes,
          lines: indexedLines,
          sourceCharacters:
            lineIndex?.sourceCharacters ??
            chunks?.reduce((total, chunk) => total + chunk.length, 0),
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        lastError = error;
      }
    }

    throw lastError;
  }
}

function filePreviewLoadCancelledError() {
  const error = new Error("File preview loading was cancelled.");
  error.name = "AbortError";
  return error;
}

function createPreviewLineIndex(): IncrementalPreviewLineIndex {
  return {
    lines: [],
    remainderSegments: [],
    pendingCarriageReturn: false,
    sourceCharacters: 0,
  };
}

function appendPreviewLineChunk(
  index: IncrementalPreviewLineIndex,
  chunk: string,
  complete = false,
) {
  index.sourceCharacters += chunk.length;
  let cursor = 0;
  const finishLine = () => {
    index.lines.push(index.remainderSegments.join(""));
    index.remainderSegments = [];
  };

  if (index.pendingCarriageReturn) {
    finishLine();
    index.pendingCarriageReturn = false;
    if (chunk.startsWith("\n")) {
      cursor = 1;
    }
  }

  for (let indexInChunk = cursor; indexInChunk < chunk.length; indexInChunk += 1) {
    const character = chunk.charCodeAt(indexInChunk);
    if (character !== 10 && character !== 13) {
      continue;
    }
    if (indexInChunk > cursor) {
      index.remainderSegments.push(chunk.slice(cursor, indexInChunk));
    }
    if (character === 13 && indexInChunk + 1 === chunk.length && !complete) {
      index.pendingCarriageReturn = true;
      return;
    }

    finishLine();
    if (character === 13 && chunk.charCodeAt(indexInChunk + 1) === 10) {
      indexInChunk += 1;
    }
    cursor = indexInChunk + 1;
  }

  if (cursor < chunk.length) {
    index.remainderSegments.push(chunk.slice(cursor));
  }
}

function finishPreviewLineIndex(index: IncrementalPreviewLineIndex) {
  appendPreviewLineChunk(index, "", true);
  index.lines.push(index.remainderSegments.join(""));
  index.remainderSegments = [];
  return index.lines;
}
