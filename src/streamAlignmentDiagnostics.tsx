/** Opt-in fixtures shared by browser review and native sandbox verification. */
import { useEffect, useMemo, useState } from "react";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/ext-apps/app-bridge";
import { ActivityTimeline, ActivityDisclosure, activityStatusLabel, attentionTimelineItems } from "./components/TranscriptActivity";
import { StreamHostContext, type StreamHost } from "./components/StreamHost";
import { applyCodexMessage, emptyRunView, type RunViewState } from "./lib/codexEventReducer";
import { buildTimelineItems } from "./lib/runTimeline";
import { BoundedLruCache } from "./shared/cache/BoundedLruCache";
import { formatTokenCount } from "./lib/streamMetrics";
import { Check, Play, Columns2, Eye, EyeOff, Sun, Moon, Pause, Zap, Plus, Activity } from "lucide-react";
import "./App.css";

const patch = "diff --git a/example.ts b/example.ts\n--- a/example.ts\n+++ b/example.ts\n@@ -1 +1 @@\n-export const enabled = false;\n+export const enabled = true;\n";
const items = [
  { id: "read", type: "commandExecution", command: "sed -n '1,40p' example.ts", cwd: "/tmp/stream-fixture", commandActions: [{ type: "read", name: "example.ts", path: "example.ts" }], aggregatedOutput: "export const enabled = false;", durationMs: 1200 },
  { id: "edit", type: "fileChange", changes: [{ path: "/tmp/stream-fixture/example.ts", kind: { type: "update" }, diff: patch }] },
  { id: "command", type: "commandExecution", command: "npm test", aggregatedOutput: "3 tests passed", exitCode: 0, durationMs: 1800 },
  { id: "comment", type: "agentMessage", phase: "commentary", text: "The edit is ready. Here are the result and the remaining check." },
  { id: "failed", type: "commandExecution", command: "npm run lint", aggregatedOutput: "Missing script: lint", status: "failed", exitCode: 1 },
  { id: "compact", type: "contextCompaction" },
  { id: "file", type: "mcpToolCall", server: "fixture", tool: "report", result: { content: [{ type: "resource", name: "report.md", resource: { uri: "resource://report.md", mimeType: "text/markdown", text: "# Result\n\nThe recorded edit passed the tests." } }] } },
  { id: "widget", type: "mcpToolCall", server: "fixture", tool: "interactive_report", appContext: { resourceUri: "ui://fixture/report" }, arguments: { report: "example" }, result: { content: [{ type: "text", text: "Native fallback: the report is available." }] } },
];

const html = `<!doctype html><html><head><style>:root{color-scheme:light dark}body{font:14px system-ui;color:var(--color-text-primary,light-dark(#222,#ddd));background:var(--color-background-primary,light-dark(#fff,#202020));padding:12px}button{padding:8px;margin:8px 8px 8px 0}pre{white-space:pre-wrap}</style></head><body><strong>MCP Apps native fixture</strong><pre id="status">Initializing…</pre><button id="draft">Draft follow-up</button><button id="action">Request tool action</button><script>
let initialized=false; const checks={parentBlocked:false,ipcAbsent:!window.__TAURI_INTERNALS__,networkBlocked:false};
try { top.document.body; } catch { checks.parentBlocked=true; }
fetch('https://example.com/blocked-by-widget-csp').catch(()=>{checks.networkBlocked=true;show()});
function theme(context){if(context?.theme){document.documentElement.style.colorScheme=context.theme;checks.theme=context.theme;show()}}
function show(){document.getElementById('status').textContent=JSON.stringify(checks,null,2)}
const send=(method,params,id)=>parent.postMessage({jsonrpc:'2.0',method,params,...(id?{id}: {})},'*');
addEventListener('message',e=>{if(e.source!==parent)return; const m=e.data;if(m.id===1&&m.result){initialized=true;checks.initialized=true;theme(m.result.hostContext);send('ui/notifications/initialized',{});send('ui/notifications/size-changed',{height:270});send('resources/read',{uri:'resource://report.md'},2);show()}if(m.id===2){checks.resourceRead=!!m.result?.contents;show()}if(m.id===4){checks.toolActionCompleted=!!m.result;show()}if(m.method==='ui/notifications/host-context-changed')theme(m.params);if(m.method==='ui/notifications/tool-result'){checks.resultReceived=true;show()}if(m.method==='ui/resource-teardown')parent.postMessage({jsonrpc:'2.0',id:m.id,result:{}},'*')});
document.getElementById('draft').onclick=()=>send('ui/message',{role:'user',content:[{type:'text',text:'Review the report next.'}]},3);
document.getElementById('action').onclick=()=>send('tools/call',{name:'fixture_update',arguments:{value:1}},4);
send('ui/initialize',{protocolVersion:${JSON.stringify(SUPPORTED_PROTOCOL_VERSIONS[0])},appInfo:{name:'fixture',version:'1'},appCapabilities:{}},1);
</script></body></html>`;

export default function StreamAlignmentDiagnostics() {
  const [draft, setDraft] = useState(""); const [mutations, setMutations] = useState(0);
  const [active, setActive] = useState(true); const [mounted, setMounted] = useState(true); const [narrow, setNarrow] = useState(false);
  const [tokens, setTokens] = useState(2400);
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? "dark");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [compaction, setCompaction] = useState<"completed" | "inProgress" | "failed">("completed");
  useEffect(() => { const original = document.documentElement.dataset.theme; return () => { if (original === undefined) delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = original; }; }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const baseView = useMemo(() => items.reduce<RunViewState>((s, item) => applyCodexMessage(s, { method: "item/completed", params: { threadId: "fixture-thread", turnId: "fixture-turn", item: { status: "completed", ...item, ...(item.type === "contextCompaction" ? { status: compaction, ...(compaction === "failed" ? { error: { message: "The compaction request failed. Original context retained." } } : {}) } : {}) } } }), { ...emptyRunView, threadId: "fixture-thread", turnId: "fixture-turn", status: "completed", tokenUsageStartTotal: 50000, tokenUsageStartCachedInput: 0 }), [compaction]);
  const view = useMemo(() => applyCodexMessage({ ...baseView, status: active ? "running" : "completed", elapsedMs: 3000 }, {
    method: "thread/tokenUsage/updated", params: { threadId: "fixture-thread", turnId: "fixture-turn", tokenUsage: {
      total: { totalTokens: 50000 + tokens, cachedInputTokens: 0 }, last: { totalTokens: tokens, cachedInputTokens: 0 }, modelContextWindow: 128000,
    } },
  }), [baseView, active, tokens]);
  const host = useMemo<StreamHost>(() => ({ profileKey: "default", threadId: "fixture-thread", turnId: "fixture-turn", disclosures: new BoundedLruCache(100),
    readDetails: async a => items.find(i => i.id === a.id),
    readResource: async (_a, uri) => ({ contents: uri.startsWith("ui:") ? [{ uri, mimeType: "text/html;profile=mcp-app", text: html, _meta: { ui: { csp: {} } } }] : [{ uri, mimeType: "text/markdown", text: "Fixture resource" }] }),
    callTool: async () => { setMutations(n => n + 1); return { content: [{ type: "text", text: "Action completed" }] }; }, draft: setDraft,
  }), []);
  const timeline = buildTimelineItems(view);
  return <div className={`stream-alignment-demo${reducedMotion ? " is-reduced-motion" : ""}`} style={{ height: "100vh", overflow: "auto" }}><main style={{ margin: "48px auto", padding: 20, maxWidth: narrow ? 400 : 890 }}><h1>Stream alignment fixture</h1>
    <p>Native calls executed: <output>{mutations}</output></p>
    <div className="stream-demo-controls" role="toolbar" aria-label="Demo controls">
      <button className="icon-button activity-icon-button" aria-label={active ? "Complete turn" : "Resume turn"} data-tooltip={active ? "Complete turn" : "Resume turn"} onClick={() => setActive(v => !v)}>{active ? <Check size={16} /> : <Play size={16} />}</button>
      <button className="icon-button activity-icon-button" aria-label="Toggle narrow layout" aria-pressed={narrow} data-tooltip="Toggle 360px layout" onClick={() => setNarrow(v => !v)}><Columns2 size={16} /></button>
      <button className="icon-button activity-icon-button" aria-label={mounted ? "Unmount" : "Restore"} data-tooltip={mounted ? "Unmount" : "Restore"} onClick={() => setMounted(v => !v)}>{mounted ? <EyeOff size={16} /> : <Eye size={16} />}</button>
      <button className="icon-button activity-icon-button" aria-label="Toggle widget theme" data-tooltip="Toggle widget theme" onClick={() => setTheme(v => v === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
      <button className="icon-button activity-icon-button" aria-label="Reduce motion" aria-pressed={reducedMotion} data-tooltip="Reduce motion" onClick={() => setReducedMotion(v => !v)}>{reducedMotion ? <Play size={16} /> : <Pause size={16} />}</button>
      <button className="icon-button activity-icon-button" aria-label="Advance token usage" data-tooltip="Advance token usage" disabled={!active} onClick={() => setTokens(v => v + 800)}><Plus size={16} /></button>
      <button className="icon-button activity-icon-button" aria-label="Cycle compaction status" data-tooltip="Cycle compaction status" onClick={() => setCompaction(v => v === "completed" ? "inProgress" : v === "inProgress" ? "failed" : "completed")}><Activity size={16} /></button>
      {reducedMotion ? <span className="stream-demo-motion"><Zap size={14} /> Reduced motion</span> : null}
    </div>
    <div className="run-output-surface"><StreamHostContext.Provider value={host}>{mounted ? <ActivityDisclosure active={active} label={activityStatusLabel(view.status, view.elapsedMs)} metrics={formatTokenCount(view)} attention={<ActivityTimeline items={attentionTimelineItems(timeline)} />}><ActivityTimeline items={timeline} /></ActivityDisclosure> : null}</StreamHostContext.Provider></div>
    <label className="stream-demo-composer">Composer draft<textarea aria-label="Composer draft" value={draft} onChange={e => setDraft(e.target.value)} /></label>
  </main></div>;
}
