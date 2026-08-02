import { prepareImageAttachment } from "../codexClient";
import type { ComposerContextFile, ImageAttachmentPreview } from "../features/composer/types";
import { BoundedLruCache } from "../shared/cache/BoundedLruCache";

const IMAGE_EXTENSIONS = new Set(["gif", "jpeg", "jpg", "png", "webp"]);
const MAX_CACHED_IMAGE_PREVIEWS = 64;

type CodexTextInput = {
  type: "text";
  text: string;
  text_elements: [];
};

type CodexLocalImageInput = {
  type: "localImage";
  path: string;
  detail: "auto";
};

export type CodexTurnInput = CodexTextInput | CodexLocalImageInput;

export class ImageAttachmentPreviewCache {
  readonly #requests = new BoundedLruCache<
    string,
    Promise<ImageAttachmentPreview | null>
  >(MAX_CACHED_IMAGE_PREVIEWS);

  get(path: string) {
    return this.#requests.get(path);
  }

  set(path: string, request: Promise<ImageAttachmentPreview | null>) {
    this.#requests.set(path, request);
  }

  delete(path: string) {
    this.#requests.delete(path);
  }

  clear() {
    this.#requests.clear();
  }
}

export function inferContextFileMediaKind(
  file: Pick<ComposerContextFile, "name" | "mediaKind">,
) {
  if (file.mediaKind) {
    return file.mediaKind;
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(extension) ? "image" : "file";
}

export function normalizeContextFileMedia(
  file: ComposerContextFile,
): ComposerContextFile {
  const mediaKind = inferContextFileMediaKind(file);
  return {
    ...file,
    ...(mediaKind === "image" || file.mediaKind
      ? { mediaKind }
      : {}),
  };
}

export function isImageContextFile(
  file: Pick<ComposerContextFile, "name" | "mediaKind">,
) {
  return inferContextFileMediaKind(file) === "image";
}

export function loadImageAttachmentPreview(
  path: string,
  cache: ImageAttachmentPreviewCache,
): Promise<ImageAttachmentPreview | null> {
  const cached = cache.get(path);
  if (cached) {
    return cached;
  }

  const request = prepareImageAttachment(path).catch((error) => {
    cache.delete(path);
    throw error;
  });
  cache.set(path, request);
  return request;
}

export async function prepareContextImageFiles(
  files: ComposerContextFile[],
  cache: ImageAttachmentPreviewCache,
): Promise<ComposerContextFile[]> {
  return Promise.all(
    files.map(async (sourceFile) => {
      const file = { ...sourceFile };
      try {
        const preview = await prepareImageAttachment(file.path);
        if (!preview) {
          return {
            ...file,
            status: file.status === "error" ? file.status : ("ready" as const),
          };
        }
        const cachedPreview = Promise.resolve(preview);
        cache.set(file.path, cachedPreview);
        cache.set(preview.path, cachedPreview);
        return {
          ...file,
          canonicalPath: preview.path,
          mediaKind: "image" as const,
          mimeType: preview.mimeType,
          width: preview.width,
          height: preview.height,
          status: "ready" as const,
          error: null,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          !isImageContextFile(file) &&
          !message.startsWith("Image attachment")
        ) {
          return file;
        }
        throw new Error(`Unable to prepare ${file.name}: ${message}`);
      }
    }),
  );
}

export function buildCodexTurnInput(
  text: string,
  files: ComposerContextFile[],
): CodexTurnInput[] {
  return [
    { type: "text", text, text_elements: [] },
    ...files
      .filter(isImageContextFile)
      .map((file): CodexLocalImageInput => ({
        type: "localImage",
        path: file.canonicalPath ?? file.path,
        detail: "auto",
      })),
  ];
}
