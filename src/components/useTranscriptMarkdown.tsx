import { useMemo, type MouseEvent as ReactMouseEvent } from "react";
import type { Components } from "react-markdown";
import { isPreviewableSummaryLink } from "../lib/summaryLinks";
import { normalizeExternalTranscriptUrl } from "../lib/transcriptLinks";
import { TranscriptMarkdownImage } from "./TranscriptMarkdownImage";

export function usePreviewableMarkdownComponents(
  onOpenTranscriptLink?: (href: string) => boolean,
) {
  return useMemo<Components>(
    () => ({
      a: ({ href, children, node: _node, ...props }) => {
        const previewable = Boolean(
          href && onOpenTranscriptLink && isPreviewableSummaryLink(href),
        );
        const external = Boolean(href && normalizeExternalTranscriptUrl(href));
        const className = [
          props.className,
          previewable ? "markdown-preview-link" : null,
          external ? "markdown-external-link" : null,
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <a
            {...props}
            className={className || undefined}
            href={href}
            title={previewable ? "Click to preview file" : props.title}
            onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
              if (href && onOpenTranscriptLink?.(href)) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
          >
            {children}
          </a>
        );
      },
      img: ({ node: _node, ...props }) => (
        <TranscriptMarkdownImage {...props} />
      ),
    }),
    [onOpenTranscriptLink],
  );
}
