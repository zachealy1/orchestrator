import { Image as ImageIcon, Loader2 } from "lucide-react";
import {
  memo,
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import { defaultUrlTransform } from "react-markdown";
import { loadImageAttachmentPreview } from "../lib/imageAttachments";
import { useAppServices } from "../runtime/AppServices";

type MarkdownImageState =
  | { path: string | null; status: "loading"; source: null }
  | { path: string; status: "ready"; source: string }
  | { path: string; status: "unavailable"; source: null };

export const TranscriptMarkdownImage = memo(function TranscriptMarkdownImage({
  src,
  alt,
  className,
  ...props
}: ComponentPropsWithoutRef<"img">) {
  const { imageAttachments } = useAppServices();
  const localPath = resolveLocalMarkdownImagePath(src);
  const [localPreview, setLocalPreview] = useState<MarkdownImageState>({
    path: localPath,
    status: "loading",
    source: null,
  });

  useEffect(() => {
    let active = true;
    if (!localPath) {
      return () => {
        active = false;
      };
    }

    setLocalPreview({ path: localPath, status: "loading", source: null });
    void loadImageAttachmentPreview(localPath, imageAttachments)
      .then((preview) => {
        if (!active) return;
        setLocalPreview(
          preview
            ? {
                path: localPath,
                status: "ready",
                source: preview.thumbnailDataUrl,
              }
            : { path: localPath, status: "unavailable", source: null },
        );
      })
      .catch(() => {
        if (active) {
          setLocalPreview({
            path: localPath,
            status: "unavailable",
            source: null,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [imageAttachments, localPath]);

  const imageClassName = ["transcript-markdown-image", className]
    .filter(Boolean)
    .join(" ");

  if (!localPath) {
    return (
      <img
        {...props}
        className={imageClassName}
        src={src}
        alt={alt ?? ""}
      />
    );
  }

  const currentPreview: MarkdownImageState =
    localPreview.path === localPath
      ? localPreview
      : { path: localPath, status: "loading", source: null };

  if (currentPreview.status === "ready") {
    return (
      <img
        {...props}
        className={imageClassName}
        src={currentPreview.source}
        alt={alt ?? ""}
        data-local-image-path={localPath}
      />
    );
  }

  const loading = currentPreview.status === "loading";
  return (
    <span
      className={`transcript-markdown-image-placeholder state-${currentPreview.status}`}
      role="img"
      aria-label={
        loading
          ? `${alt || "Local image"} loading`
          : `${alt || "Local image"} unavailable`
      }
      aria-busy={loading}
    >
      {loading ? (
        <Loader2 className="spin" size={22} aria-hidden="true" />
      ) : (
        <ImageIcon size={24} aria-hidden="true" />
      )}
      <span>{loading ? "Loading image…" : "Image preview unavailable."}</span>
    </span>
  );
});

export function resolveLocalMarkdownImagePath(source: string | undefined) {
  const value = source?.trim();
  if (!value) return null;

  if (/^[a-z]:[\\/]/iu.test(value) || value.startsWith("\\\\")) {
    return normalizeAbsolutePath(decodePath(value));
  }

  if (/^file:/iu.test(value)) {
    try {
      const url = new URL(value);
      if (url.protocol !== "file:") return null;
      return normalizeAbsolutePath(decodePath(url.pathname));
    } catch {
      return null;
    }
  }

  if (/^[a-z][a-z\d+.-]*:/iu.test(value)) return null;
  return normalizeAbsolutePath(decodePath(value));
}

export function transcriptMarkdownUrlTransform(value: string) {
  return resolveLocalMarkdownImagePath(value) ? value : defaultUrlTransform(value);
}

function decodePath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeAbsolutePath(value: string) {
  if (/^\/[a-z]:\//iu.test(value)) {
    return value.slice(1);
  }
  if (
    value.startsWith("/") ||
    value.startsWith("\\\\") ||
    /^[a-z]:[\\/]/iu.test(value)
  ) {
    return value;
  }
  return null;
}
