import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, RotateCw, Play, X } from "lucide-react";
import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { commands } from "../generated/tauri";
import { object, string, type StreamActivity } from "../lib/streamActivity";
import { useStreamHost } from "./StreamHost";
import { activityHref } from "./ActivityResult";

type ToolResult = Parameters<AppBridge["sendToolResult"]>[0];
type PendingAction = { name: string; arguments: unknown; run: () => Promise<void>; cancel: () => void };

export function McpAppWidget({ activity, onOpen }: { activity: StreamActivity; onOpen?: (href: string) => boolean }) {
  const host = useStreamHost();
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(activity); latest.current = activity;
  const openLink = useRef(onOpen); openLink.current = onOpen;
  const bridgeRef = useRef<AppBridge | null>(null);
  const pendingRef = useRef<PendingAction | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [height, setHeight] = useState(320);
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const resourceUri = activity.payload.kind === "tool" ? activity.payload.resourceUri : null;

  useEffect(() => {
    if (!host || !resourceUri || !frame.current) return;
    let live = true; let token: string | null = null; let bridge: AppBridge | null = null;
    setReady(false); setError(null);
    const timer = window.setTimeout(() => { if (live) setError("Tool interface did not initialize. The result remains available below."); }, 15000);
    const observer = new MutationObserver(() => {
      if (bridge) void Promise.resolve(bridge.sendHostContextChange({ theme: document.documentElement.dataset.theme === "light" ? "light" : "dark" })).catch(() => {});
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const start = async () => {
      if (!isTauri()) throw new Error("Interactive tool interfaces require the desktop app. The native result remains available.");
      const resource = object(await host.readResource(latest.current, resourceUri));
      const contents = Array.isArray(resource.contents) ? resource.contents.map(object) : [];
      const htmlResource = contents.find(c => string(c.mimeType).startsWith("text/html") && typeof c.text === "string");
      if (!htmlResource) throw new Error("This tool does not provide a compatible HTML interface.");
      const policy = object(object(htmlResource._meta).ui).csp ?? {};
      token = await commands.widgetSandboxCreate(string(htmlResource.text), policy);
      if (!live) { await commands.widgetSandboxClose(token); return; }
      bridge = new AppBridge(null, { name: "Orchestrator", version: "0.2.0" }, {
        openLinks: {}, serverResources: {}, serverTools: {}, downloadFile: {}, ...(host.draft ? { message: { text: {} } } : {}),
      }, { hostContext: { theme: document.documentElement.dataset.theme === "light" ? "light" : "dark", displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"] } });
      bridgeRef.current = bridge;
      bridge.addEventListener("sandboxready", () => { if (live) void bridge!.sendSandboxResourceReady({ html: string(htmlResource.text), sandbox: "allow-scripts" }).catch(fail); });
      bridge.addEventListener("initialized", () => {
        if (!live) return; clearTimeout(timer); setReady(true); setError(null);
        const p = latest.current.payload;
        if (p.kind === "tool") {
          void bridge!.sendToolInput({ arguments: p.arguments }).catch(fail);
          if (p.result) void bridge!.sendToolResult(p.result as ToolResult).catch(fail);
        }
      });
      bridge.addEventListener("sizechange", ({ height: h }) => { if (live && typeof h === "number") setHeight(Math.max(120, Math.min(h, 900))); });
      bridge.onrequestdisplaymode = async ({ mode }) => { setExpanded(mode === "fullscreen"); return { mode: mode === "fullscreen" ? "fullscreen" : "inline" }; };
      bridge.onopenlink = async ({ url }) => {
        if (!/^https?:/i.test(url) || !activityHref(url)) return { isError: true };
        return { isError: !openLink.current?.(url) };
      };
      bridge.onmessage = async ({ content }) => {
        if (!host.draft) return { isError: true };
        host.draft(content.filter(c => c.type === "text").map(c => string(object(c).text)).join("\n"));
        return {};
      };
      bridge.onreadresource = async ({ uri }) => await host.readResource(latest.current, uri) as Awaited<ReturnType<NonNullable<AppBridge["onreadresource"]>>>;
      bridge.ondownloadfile = async ({ contents: downloads }) => {
        for (const content of downloads) {
          const c = object(content); let r = object(c.resource);
          if (c.type === "resource_link") {
            const response = object(await host.readResource(latest.current, string(c.uri)));
            r = object(Array.isArray(response.contents) ? response.contents[0] : null);
          }
          const saved = await commands.saveActivityResource(string(c.name) || string(r.uri).split("/").pop() || "artifact", typeof r.text === "string" ? r.text : null, typeof r.blob === "string" ? r.blob : null);
          if (!saved) return { isError: true };
        }
        return {};
      };
      // A frame request is not evidence of a user gesture. Keep actions pending
      // until the user activates the host's Run button; replay is read-only.
      bridge.oncalltool = ({ name, arguments: args }) => new Promise<ToolResult>((resolve, reject) => {
        if (pendingRef.current) { reject(new Error("Another tool action is pending")); return; }
        const clear = () => { pendingRef.current = null; if (live) setPending(null); };
        const action: PendingAction = { name, arguments: args, cancel: () => { clear(); reject(new Error("Tool action cancelled")); }, run: async () => {
          try { resolve(await host.callTool(latest.current, name, args) as ToolResult); } catch (e) { reject(e); } finally { clear(); }
        } };
        pendingRef.current = action; setPending(action);
      });
      const target = frame.current!;
      await bridge.connect(new PostMessageTransport(target.contentWindow!, target.contentWindow!));
      if (live) target.src = `${convertFileSrc(token, "orchestrator-widget")}/proxy`;
    };
    const fail = (e: unknown) => { if (live) { clearTimeout(timer); setError(e instanceof Error ? e.message : String(e)); } };
    void start().catch(fail);
    return () => {
      live = false; clearTimeout(timer); observer.disconnect(); pendingRef.current?.cancel(); bridgeRef.current = null;
      if (bridge) { void bridge.teardownResource({}, { timeout: 500 }).catch(() => {}).finally(() => bridge?.close()); }
      if (token) void commands.widgetSandboxClose(token).catch(() => {});
    };
  }, [host, resourceUri, activity.key, attempt]);
  useEffect(() => {
    if (!ready || !bridgeRef.current) return;
    if (["interrupted", "declined"].includes(activity.status)) void bridgeRef.current.sendToolCancelled({ reason: activity.status }).catch(() => {});
    else if (activity.payload.kind === "tool" && activity.payload.result) void bridgeRef.current.sendToolResult(activity.payload.result as ToolResult).catch(() => {});
  }, [activity, ready]);
  useEffect(() => {
    if (ready && bridgeRef.current) void Promise.resolve(bridgeRef.current.sendHostContextChange({ displayMode: expanded ? "fullscreen" : "inline" })).catch(() => {});
  }, [expanded, ready]);
  useEffect(() => { host?.notifyLayoutChange?.(); }, [host, height, expanded, ready, error, pending]);
  if (!host) return <p className="activity-widget-fallback">Interactive view unavailable for this historical result.</p>;
  return <section className={`activity-widget ${expanded ? "is-expanded" : ""}`} aria-label="Interactive tool result">
    <header><span>Tool interface</span><button className="icon-button activity-icon-button" type="button" aria-label={expanded ? "Collapse" : "Expand"} data-tooltip={expanded ? "Collapse" : "Expand"} onClick={() => setExpanded(v => !v)}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button></header>
    {error ? <p role="status">{error} <button className="icon-button activity-icon-button" type="button" aria-label="Retry" data-tooltip="Retry" onClick={() => setAttempt(n => n + 1)}><RotateCw size={16} /></button></p> : !ready ? <p role="status">Loading tool interface…</p> : null}
    <iframe ref={frame} title="Tool interface sandbox" sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" style={{ height: expanded ? "75vh" : height, display: error ? "none" : "block" }} />
    {pending ? <div className="widget-pending-action"><strong>Run {pending.name}</strong><pre>{JSON.stringify(pending.arguments, null, 2)}</pre><button className="icon-button activity-icon-button" type="button" aria-label="Run tool" data-tooltip="Run tool" onClick={() => { const action = pending; setPending(null); void action.run(); }}><Play size={16} /></button><button className="icon-button activity-icon-button" type="button" aria-label="Cancel" data-tooltip="Cancel" onClick={pending.cancel}><X size={16} /></button></div> : null}
  </section>;
}
