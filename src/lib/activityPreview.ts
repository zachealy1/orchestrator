import type { ActivityContent } from "./streamActivity";

export type ActivityResource = Extract<ActivityContent, { type: "resource" }>;
type PreviewKind = "text" | "image" | "audio" | "video";

function mimePreviewKind(mimeType?: string): PreviewKind | null {
  const mime = mimeType?.split(";", 1)[0].trim().toLowerCase() ?? "";
  if (/^text\//.test(mime) || /^application\/(?:json|xml|[\w.-]+\+(?:json|xml))$/.test(mime)) return "text";
  if (/^image\/(?:png|jpeg|webp|gif)$/.test(mime)) return "image";
  if (/^audio\/(?:mpeg|mp3|mp4|wav|x-wav|ogg|webm|aac|flac)$/.test(mime)) return "audio";
  if (/^video\/(?:mp4|webm|ogg|quicktime)$/.test(mime)) return "video";
  return null;
}

export function resourceHasContent(resource: ActivityResource) {
  return typeof resource.text === "string" || typeof resource.blob === "string";
}

/** A read route alone does not imply that this application can preview its result. */
export function resourcePreviewKind(resource: ActivityResource, canRead = false): PreviewKind | null {
  if (resource.text) return "text";
  if (resource.blob || (canRead && !resourceHasContent(resource))) return mimePreviewKind(resource.mimeType);
  return null;
}

export function resourcePreviewContent(resource: ActivityResource): ActivityContent[] {
  const kind = resourcePreviewKind(resource);
  if (!kind) throw new Error("Preview unavailable for this resource");
  if (kind === "text") {
    const text = resource.text ?? new TextDecoder().decode(Uint8Array.from(atob(resource.blob!), c => c.charCodeAt(0)));
    const mime = resource.mimeType?.split(";", 1)[0].toLowerCase() ?? "";
    // HTML/XML are useful source previews; passing them as Markdown would strip
    // their tags and can leave an apparently available preview empty.
    if (mime === "text/html" || /(?:\/|\+)xml$/.test(mime)) {
      const fence = "`".repeat(Math.max(3, ...Array.from(text.matchAll(/`+/g), match => match[0].length + 1)));
      return [{ type: "text", text: `${fence}${mime === "text/html" ? "html" : "xml"}\n${text}\n${fence}` }];
    }
    return [{ type: "text", text }];
  }
  return [{ type: kind, url: `data:${resource.mimeType!.split(";", 1)[0]};base64,${resource.blob}` }];
}
