import { describe, expect, it, vi } from "vitest";
import type { WorkspaceFilePreview } from "./types";
import {
  FILE_PREVIEW_MAX_BYTES,
  WorkspaceFilePreviewService,
  type WorkspaceFilePreviewReader,
} from "./WorkspaceFilePreviewService";

function preview(
  filePath: string,
  content: string,
  overrides: Partial<WorkspaceFilePreview> = {},
): WorkspaceFilePreview {
  return {
    path: filePath,
    relativePath: filePath.split("/").pop() ?? filePath,
    content,
    truncated: false,
    isBinary: false,
    ...overrides,
  };
}

function reader(overrides: Partial<WorkspaceFilePreviewReader>) {
  return {
    readInitial: vi.fn(),
    readChunk: vi.fn(),
    readVersion: vi.fn(),
    ...overrides,
  } as WorkspaceFilePreviewReader;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("WorkspaceFilePreviewService", () => {
  it("publishes the first chunk, assembles the file, and reuses the cached result", async () => {
    const initial = preview("/repo/file.txt", "first ", {
      complete: false,
      nextOffset: 6,
      totalBytes: 10,
      version: "v1",
    });
    const final = preview("/repo/file.txt", "tail", {
      complete: true,
      nextOffset: 10,
      totalBytes: 10,
      version: "v1",
    });
    const native = reader({
      readInitial: vi.fn().mockResolvedValue(initial),
      readChunk: vi.fn().mockResolvedValue(final),
    });
    const service = new WorkspaceFilePreviewService(native);
    const onInitialPreview = vi.fn();

    const loaded = await service.load("/repo", "/repo/file.txt", {
      onInitialPreview,
    });

    expect(onInitialPreview).toHaveBeenCalledWith(initial);
    expect(native.readChunk).toHaveBeenCalledWith(
      "/repo",
      "/repo/file.txt",
      6,
      "v1",
    );
    expect(loaded).toMatchObject({
      content: "first tail",
      complete: true,
      sourceCharacters: 10,
    });
    await expect(service.load("/repo", "/repo/file.txt")).resolves.toBe(loaded);
    expect(native.readInitial).toHaveBeenCalledOnce();
  });

  it("indexes very large files incrementally across a split CRLF boundary", async () => {
    const native = reader({
      readInitial: vi.fn().mockResolvedValue(
        preview("/repo/large.txt", "one\r", {
          complete: false,
          nextOffset: 4,
          totalBytes: 14,
          version: "large-v1",
        }),
      ),
      readChunk: vi.fn().mockResolvedValue(
        preview("/repo/large.txt", "\ntwo\nthree", {
          complete: true,
          nextOffset: 14,
          totalBytes: 14,
          version: "large-v1",
        }),
      ),
    });
    const service = new WorkspaceFilePreviewService(native, 8, 100, 3);

    const loaded = await service.load("/repo", "/repo/large.txt");

    expect(loaded.content).toBe("");
    expect(loaded.lines).toEqual(["one", "two", "three"]);
    expect(loaded.sourceCharacters).toBe(14);
  });

  it("stops at the preview byte limit and discards an incomplete trailing line", async () => {
    const native = reader({
      readInitial: vi.fn().mockResolvedValue(
        preview("/repo/huge.txt", "first\nunfinished", {
          complete: false,
          nextOffset: FILE_PREVIEW_MAX_BYTES - 4,
          totalBytes: FILE_PREVIEW_MAX_BYTES + 100,
          version: "huge-v1",
        }),
      ),
      readChunk: vi.fn().mockResolvedValue(
        preview("/repo/huge.txt", "-tail\ncut", {
          complete: false,
          nextOffset: FILE_PREVIEW_MAX_BYTES,
          totalBytes: FILE_PREVIEW_MAX_BYTES + 100,
          version: "huge-v1",
        }),
      ),
    });
    const service = new WorkspaceFilePreviewService(native);

    const loaded = await service.load("/repo", "/repo/huge.txt");

    expect(loaded).toMatchObject({
      complete: true,
      truncated: true,
      nextOffset: FILE_PREVIEW_MAX_BYTES,
      lines: ["first", "unfinished-tail"],
      sourceCharacters: 20,
    });
    expect(native.readChunk).toHaveBeenCalledOnce();
  });

  it("retries the bounded transfer when chunks belong to a stale version", async () => {
    const native = reader({
      readInitial: vi
        .fn()
        .mockResolvedValueOnce(
          preview("/repo/changing.txt", "old ", {
            complete: false,
            nextOffset: 4,
            totalBytes: 8,
            version: "old",
          }),
        )
        .mockResolvedValueOnce(
          preview("/repo/changing.txt", "new ", {
            complete: false,
            nextOffset: 4,
            totalBytes: 8,
            version: "new",
          }),
        ),
      readChunk: vi
        .fn()
        .mockResolvedValueOnce(
          preview("/repo/changing.txt", "tail", {
            complete: true,
            nextOffset: 8,
            totalBytes: 8,
            version: "new",
          }),
        )
        .mockResolvedValueOnce(
          preview("/repo/changing.txt", "tail", {
            complete: true,
            nextOffset: 8,
            totalBytes: 8,
            version: "new",
          }),
        ),
    });
    const service = new WorkspaceFilePreviewService(native);

    await expect(service.load("/repo", "/repo/changing.txt")).resolves.toMatchObject({
      content: "new tail",
      version: "new",
    });
    expect(native.readInitial).toHaveBeenCalledTimes(2);
  });

  it("invalidates an active generation so stale chunks cannot populate the cache", async () => {
    const pendingChunk = deferred<WorkspaceFilePreview>();
    const native = reader({
      readInitial: vi.fn().mockResolvedValue(
        preview("/repo/large.txt", "partial", {
          complete: false,
          nextOffset: 7,
          totalBytes: 11,
          version: "v1",
        }),
      ),
      readChunk: vi.fn().mockReturnValue(pendingChunk.promise),
    });
    const service = new WorkspaceFilePreviewService(native);
    const loading = service.load("/repo", "/repo/large.txt");
    await vi.waitFor(() => expect(native.readChunk).toHaveBeenCalledOnce());

    service.invalidate("/repo", "/repo/large.txt");
    pendingChunk.resolve(
      preview("/repo/large.txt", "tail", {
        complete: true,
        nextOffset: 11,
        totalBytes: 11,
        version: "v1",
      }),
    );

    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(service.getVisible("/repo", "/repo/large.txt")).toBeNull();
  });

  it("bounds completed previews by entry count and source characters using LRU eviction", async () => {
    const native = reader({
      readInitial: vi.fn((_workspacePath, filePath) =>
        Promise.resolve(preview(filePath, filePath.slice(-3), { complete: true })),
      ),
    });
    const service = new WorkspaceFilePreviewService(native, 2, 6);

    const first = await service.load("/repo", "/repo/one");
    await service.load("/repo", "/repo/two");
    expect(service.getCached("/repo", "/repo/one")).toBe(first);
    await service.load("/repo", "/repo/tri");

    expect(service.getCached("/repo", "/repo/two")).toBeNull();
    expect(service.getCached("/repo", "/repo/one")).toBe(first);
    expect(service.getStats()).toMatchObject({
      completeEntries: 2,
      sourceCharacters: 6,
    });
  });

  it("rejects a cached preview when its native version has changed", async () => {
    const native = reader({
      readInitial: vi.fn().mockResolvedValue(
        preview("/repo/changing.txt", "old", {
          complete: true,
          version: "old",
        }),
      ),
      readVersion: vi.fn().mockResolvedValue("new"),
    });
    const service = new WorkspaceFilePreviewService(native);
    await service.load("/repo", "/repo/changing.txt");

    await expect(
      service.getValidatedCached("/repo", "/repo/changing.txt"),
    ).resolves.toBeNull();
    expect(service.getCached("/repo", "/repo/changing.txt")).toBeNull();
  });
});
