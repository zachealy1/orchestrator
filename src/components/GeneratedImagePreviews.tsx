import { Image as ImageIcon, Loader2 } from "lucide-react";
import { memo, useEffect, useState } from "react";
import type {
  RunGeneratedImage,
  RunViewState,
} from "../lib/codexEventReducer";
import { loadImageAttachmentPreview } from "../lib/imageAttachments";
import { useAppServices } from "../runtime/AppServices";

export const GeneratedImagePreviews = memo(function GeneratedImagePreviews({
  runView,
}: {
  runView: RunViewState;
}) {
  const images = runView.generatedImageOrder
    .map((id) => runView.generatedImagesById[id])
    .filter((image): image is RunGeneratedImage => Boolean(image));
  if (images.length === 0) return null;

  return (
    <div
      className="generated-image-previews"
      aria-label={`Generated image${images.length === 1 ? "" : "s"}`}
    >
      {images.map((image, index) => (
        <GeneratedImagePreview key={image.id} image={image} index={index} />
      ))}
    </div>
  );
});

const GeneratedImagePreview = memo(function GeneratedImagePreview({
  image,
  index,
}: {
  image: RunGeneratedImage;
  index: number;
}) {
  const { imageAttachments } = useAppServices();
  const localPath =
    image.savedPath ??
    (image.result?.startsWith("/") ? image.result : null);
  const resultSource = resolveGeneratedImageResultSource(image.result);
  const directSource = localPath ? null : resultSource;
  const [preview, setPreview] = useState<{
    status: "idle" | "loading" | "ready" | "unavailable";
    source: string | null;
  }>({
    status: directSource ? "ready" : localPath ? "loading" : "idle",
    source: directSource,
  });

  useEffect(() => {
    let active = true;
    if (!localPath) {
      setPreview({
        status: directSource ? "ready" : "idle",
        source: directSource,
      });
      return () => {
        active = false;
      };
    }
    setPreview({ status: "loading", source: null });
    void loadImageAttachmentPreview(localPath, imageAttachments)
      .then((result) => {
        if (!active) return;
        setPreview(
          result
            ? { status: "ready", source: result.thumbnailDataUrl }
            : resultSource
              ? { status: "ready", source: resultSource }
              : { status: "unavailable", source: null },
        );
      })
      .catch(() => {
        if (active) {
          setPreview(
            resultSource
              ? { status: "ready", source: resultSource }
              : { status: "unavailable", source: null },
          );
        }
      });
    return () => {
      active = false;
    };
  }, [directSource, imageAttachments, localPath, resultSource]);

  const generating = image.status === "generating";
  const failed = image.status === "failed";
  const unavailable =
    image.status === "completed" &&
    (preview.status === "unavailable" ||
      (preview.status === "idle" && !preview.source));
  const message = failed
    ? image.error ?? "Image generation failed."
    : unavailable
      ? "Generated image preview unavailable."
      : generating || preview.status === "loading"
        ? "Creating image…"
        : null;

  return (
    <figure
      className={`generated-image-preview state-${
        failed ? "failed" : unavailable ? "unavailable" : image.status
      }`}
      aria-busy={generating || preview.status === "loading"}
    >
      {preview.source ? (
        <img
          src={preview.source}
          alt={`Generated image ${index + 1}`}
          draggable={false}
        />
      ) : (
        <div className="generated-image-placeholder">
          {generating || preview.status === "loading" ? (
            <Loader2 className="spin" size={22} aria-hidden="true" />
          ) : (
            <ImageIcon size={24} aria-hidden="true" />
          )}
          {message ? <span>{message}</span> : null}
        </div>
      )}
      {preview.source && message ? <figcaption>{message}</figcaption> : null}
    </figure>
  );
});

function resolveGeneratedImageResultSource(result: string | null) {
  if (!result || result.startsWith("/")) return null;
  if (
    result.startsWith("data:image/") ||
    result.startsWith("blob:") ||
    result.startsWith("https://") ||
    result.startsWith("http://")
  ) {
    return result;
  }
  return `data:image/png;base64,${result}`;
}
