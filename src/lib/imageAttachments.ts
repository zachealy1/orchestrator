import { prepareImageAttachment } from "../codexClient";
import type {
  ComposerContextFile,
  ImageAttachmentPreview,
} from "../types";

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

const previewRequests = new Map<
  string,
  Promise<ImageAttachmentPreview | null>
>();

function cachePreviewRequest(
  path: string,
  request: Promise<ImageAttachmentPreview | null>,
) {
  previewRequests.delete(path);
  previewRequests.set(path, request);
  while (previewRequests.size > MAX_CACHED_IMAGE_PREVIEWS) {
    const oldestKey = previewRequests.keys().next().value;
    if (typeof oldestKey !== "string") break;
    previewRequests.delete(oldestKey);
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
): Promise<ImageAttachmentPreview | null> {
  const cached = previewRequests.get(path);
  if (cached) {
    previewRequests.delete(path);
    previewRequests.set(path, cached);
    return cached;
  }

  const request = prepareImageAttachment(path).catch((error) => {
    previewRequests.delete(path);
    throw error;
  });
  cachePreviewRequest(path, request);
  return request;
}

export async function prepareContextImageFiles(
  files: ComposerContextFile[],
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
        cachePreviewRequest(file.path, cachedPreview);
        cachePreviewRequest(preview.path, cachedPreview);
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

export function clearImageAttachmentPreviewCache() {
  previewRequests.clear();
}
