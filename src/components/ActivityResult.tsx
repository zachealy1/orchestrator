import { useEffect, useState } from "react";
import { FileText, ChevronRight, Eye, EyeOff, Download, LoaderCircle } from "lucide-react";
import { object, string, type ActivityContent, type StreamActivity } from "../lib/streamActivity";
import { prepareImageAttachment } from "../codexClient";
import { StreamingMarkdown } from "./StreamingText";
import { usePreviewableMarkdownComponents } from "./useTranscriptMarkdown";
import { useStreamHost } from "./StreamHost";
import { commands } from "../generated/tauri";
import { resourceHasContent, resourcePreviewKind, resourcePreviewContent, type ActivityResource } from "../lib/activityPreview";

export function activityHref(uri: string, cwd = "") {
  if (/^(https?:|file:)/i.test(uri)) return uri;
  if (uri.startsWith("/") || /^[A-Za-z]:[\\/]/.test(uri)) return uri;
  if (!/^[\w+.-]+:/.test(uri) && cwd) return `${cwd.replace(/\/$/, "")}/${uri}`;
  return null;
}

export function ActivityFileLink({ path, cwd, name, onOpen }: { path: string; cwd?: string; name?: string; onOpen?: (href: string) => boolean }) {
  const href = activityHref(path, cwd);
  return href ? <a href={href} target="_blank" rel="noreferrer" onClick={e => { if (onOpen?.(href) || !/^https?:/i.test(href)) e.preventDefault(); }} title={path}>{name || path}</a> : <span title={path}>{name || path}</span>;
}

export function ActivityResult({ content, activity, onOpen }: { content: ActivityContent[]; activity?: StreamActivity; onOpen?: (href: string) => boolean }) {
  const components = usePreviewableMarkdownComponents(onOpen);
  if (content.length === 0) return null;
  return <div className="activity-results">{content.map((c, index) => {
    switch (c.type) {
      case "text": return <div className="markdown-summary" key={index}><StreamingMarkdown text={c.text} active={false} components={components} skipHtml /></div>;
      case "json": return <details key={index}><summary className="stream-detail-summary"><span>Structured result</span><ChevronRight size={15} className="stream-disclosure-chevron" aria-hidden="true" /></summary><pre className="activity-json">{JSON.stringify(c.value, null, 2)}</pre></details>;
      case "image": return <ActivityImage key={`${index}:${c.url}`} source={c.url} onOpen={onOpen} />;
      case "audio": case "video": {
        const safe = /^(https?:|blob:|data:(audio|video)\/)/i.test(c.url);
        return safe ? c.type === "audio" ? <audio key={index} controls preload="none" src={c.url} /> : <video key={index} controls preload="none" src={c.url} /> : <ActivityFileLink key={index} path={c.url} onOpen={onOpen} />;
      }
      case "resource": return <ResourceCard key={`${index}:${c.uri}`} resource={c} activity={activity} onOpen={onOpen} />;
    }
  })}</div>;
}

function ResourceCard({ resource, activity, onOpen }: { resource: ActivityResource; activity?: StreamActivity; onOpen?: (href: string) => boolean }) {
  const host = useStreamHost();
  const [loaded, setLoaded] = useState<{ source: ActivityResource; resource: ActivityResource } | null>(null);
  const [error, setError] = useState<{ source: ActivityResource; message: string } | null>(null);
  const [busy, setBusy] = useState<"preview" | "download" | null>(null);
  const [preview, setPreview] = useState<{ source: ActivityResource; content: ActivityContent[] } | null>(null);
  const [failedPreview, setFailedPreview] = useState<ActivityResource | null>(null);
  const current = loaded?.source === resource ? loaded.resource : resource;
  const showing = preview?.source === resource;
  const canRead = Boolean(host && activity?.payload.kind === "tool" && activity.payload.server);
  const canPreview = failedPreview !== resource && resourcePreviewKind(current, canRead) !== null;
  const canDownload = resourceHasContent(current) || canRead;
  const load = async () => {
    if (resourceHasContent(current)) return current;
    if (!host || !activity) throw new Error("Resource details unavailable");
    const response = object(await host.readResource(activity, resource.uri));
    const contents = Array.isArray(response.contents) ? response.contents.map(object) : [];
    const content = contents.find(c => c.uri === resource.uri);
    if (!content) throw new Error("Resource details unavailable");
    const next = { ...resource, mimeType: string(content.mimeType) || resource.mimeType, text: typeof content.text === "string" ? content.text : undefined, blob: typeof content.blob === "string" ? content.blob : undefined };
    if (!resourceHasContent(next)) throw new Error("Resource details unavailable");
    setLoaded({ source: resource, resource: next }); return next;
  };
  const perform = async (action: "preview" | "download") => {
    setBusy(action); setError(null);
    try {
      const c = await load();
      if (action === "download") await commands.saveActivityResource(c.name, c.text ?? null, c.blob ?? null);
      else setPreview({ source: resource, content: resourcePreviewContent(c) });
    } catch (e) {
      setError({ source: resource, message: e instanceof Error ? e.message : String(e) });
      if (action === "preview") setFailedPreview(resource);
    } finally { setBusy(null); host?.notifyLayoutChange?.(); }
  };
  return <article className="activity-artifact">
    <header>
      <div className="activity-artifact-identity"><FileText size={16} /><div className="activity-artifact-labels"><ActivityFileLink path={resource.uri} name={resource.name} onOpen={onOpen} />{current.mimeType ? <span>{current.mimeType}</span> : null}</div></div>
      {canPreview || canDownload ? <div className="activity-artifact-actions">
      {canPreview ? <button className="icon-button activity-icon-button" type="button" aria-label={showing ? "Hide preview" : "Preview"} data-tooltip={showing ? "Hide preview" : "Preview"} disabled={busy !== null} onClick={() => { if (showing) { setPreview(null); host?.notifyLayoutChange?.(); } else void perform("preview"); }}>{busy === "preview" ? <LoaderCircle size={16} className="spin" /> : showing ? <EyeOff size={16} /> : <Eye size={16} />}</button> : null}
      {canDownload ? <button className="icon-button activity-icon-button" type="button" aria-label="Download" data-tooltip="Download" disabled={busy !== null} onClick={() => void perform("download")}>{busy === "download" ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}</button> : null}
      </div> : null}
    </header>
    {error?.source === resource ? <p role="status">{error.message}</p> : null}
    {showing ? <ActivityResult content={preview.content} activity={activity} onOpen={onOpen} /> : null}
  </article>;
}

function ActivityImage({ source, onOpen }: { source: string; onOpen?: (href: string) => boolean }) {
  const [url, setUrl] = useState<string | null>(() => /^(https?:|blob:|data:image\/(png|jpeg|webp|gif);base64,)/i.test(source) ? source : null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!source.startsWith("/") && !source.startsWith("file:")) { if (!/^(https?:|blob:|data:image\/(png|jpeg|webp|gif);base64,)/i.test(source)) setFailed(true); return; }
    let live = true;
    const path = source.startsWith("file:") ? decodeURIComponent(new URL(source).pathname) : source;
    void prepareImageAttachment(path).then(image => { if (live) { setUrl(image?.thumbnailDataUrl ?? null); setFailed(!image); } }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [source]);
  return <figure className="activity-image">{url && !failed ? <img src={url} alt="Agent image" loading="lazy" onError={() => setFailed(true)} /> : <span>{failed ? "Image preview unavailable" : "Loading image…"}</span>}
    <figcaption><ActivityFileLink path={source} name="Open image" onOpen={onOpen} /></figcaption></figure>;
}
