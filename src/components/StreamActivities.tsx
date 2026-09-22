import { BookOpen, Pencil, Terminal, Wrench, CircleAlert, ChevronRight, Clock, Image as ImageIcon, Activity, Users, RotateCw } from "lucide-react";
import { memo, useState, useEffect } from "react";
import { activitySummary, standaloneActivity, reduceStreamActivity, emptyActivityStore, object, type StreamActivity, type FileEdit } from "../lib/streamActivity";
import { formatDuration } from "../lib/streamMetrics";
import { ActivityFileLink, ActivityResult } from "./ActivityResult";
import { DiffPreview } from "./DiffPreview";
import { useStreamHost, useStreamPlan } from "./StreamHost";
import { McpAppWidget } from "./McpAppWidget";
import { GeneratedImagePreview } from "./GeneratedImagePreviews";

export function ActivityIcon({ activities }: { activities: StreamActivity[] }) {
  const icon = activities.some(a => a.status === "failed") ? CircleAlert : activities.some(a => a.payload.kind === "edit") ? Pencil
    : activities.some(a => a.payload.kind === "command" && a.payload.actions.some(c => c.type !== "unknown")) ? BookOpen
    : activities.some(a => a.payload.kind === "command") ? Terminal : activities.some(a => a.payload.kind === "image") ? ImageIcon
    : activities.some(a => a.itemType === "sleep") ? Clock : activities.some(a => a.payload.kind === "tool") ? Wrench : Activity;
  const Icon = icon; return <Icon size={15} aria-hidden="true" />;
}

export const StreamActivities = memo(function StreamActivities({ activities, active = false, onOpen }: {
  activities: StreamActivity[]; active?: boolean; onOpen?: (href: string) => boolean;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
  const host = useStreamHost();
  const scope = JSON.stringify([host?.profileKey, host?.threadId, host?.turnId]);
  const isOpen = (key: string) => open[key] ?? host?.disclosures?.get(`${scope}:item:${key}`) ?? false;
  const groups: { id: string; collapsed: boolean; activities: StreamActivity[] }[] = [];
  for (const activity of activities) {
    const collapsed = activity.status === "completed" && !standaloneActivity(activity);
    const last = groups[groups.length - 1];
    if (last?.collapsed === collapsed) last.activities.push(activity);
    else groups.push({ id: activity.key, collapsed, activities: [activity] });
  }
  const row = (activity: StreamActivity) => <ActivityRow key={activity.key} activity={activity} active={active} onOpen={onOpen}
    editOpen={path => isOpen(`${activity.key}:file:${path}`)} onEditToggle={(path, value) => { const key = `${activity.key}:file:${path}`; host?.notifyLayoutChange?.(); host?.disclosures?.set(`${scope}:item:${key}`, value); setOpen(prev => ({ ...prev, [key]: value })); }}
    open={isOpen(activity.key)} onToggle={value => { if (value !== isOpen(activity.key)) host?.notifyLayoutChange?.(); host?.disclosures?.set(`${scope}:item:${activity.key}`, value); setOpen(prev => prev[activity.key] === value ? prev : { ...prev, [activity.key]: value }); }} />;
  return <div className="structured-activity-groups">{groups.map(group => group.collapsed ?
    <details className="run-activity-group mixed-activity-group" key={group.id} open={groupOpen[group.id] ?? host?.disclosures?.get(`${scope}:group:${group.id}`) ?? group.activities.some(a => isOpen(a.key))}
      onToggle={e => { if (e.target !== e.currentTarget) return; const value = e.currentTarget.open; host?.disclosures?.set(`${scope}:group:${group.id}`, value); setGroupOpen(prev => prev[group.id] === value ? prev : ({ ...prev, [group.id]: value })); }}>
      <summary><span className="run-activity-title"><ActivityIcon activities={group.activities} /><span>{activitySummary(group.activities)}</span></span><ChevronRight size={15} className="stream-disclosure-chevron" aria-hidden="true" /></summary>
      <div className="run-activity-items">{group.activities.map(row)}</div>
    </details> : <div className="run-activity-items" key={group.id}>{group.activities.map(row)}</div>)}</div>;
});

function ActivityRow({ activity, active, open, onToggle, onOpen, editOpen, onEditToggle }: { activity: StreamActivity; active: boolean; open: boolean; onToggle: (value: boolean) => void; onOpen?: (href: string) => boolean; editOpen: (path: string) => boolean; onEditToggle: (path: string, value: boolean) => void }) {
  const host = useStreamHost();
  const planView = useStreamPlan();
  const [loaded, setLoaded] = useState<{ source: StreamActivity; activity: StreamActivity } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const a = loaded?.source === activity ? loaded.activity : activity;
  useEffect(() => {
    if (!activity.detailsDeferred || !activity.detailsAvailable || !host || loaded?.source === activity || (!open && !standaloneActivity(activity))) return;
    let live = true; setError(null);
    void host.readDetails(activity).then(item => {
      const state = reduceStreamActivity(emptyActivityStore, { method: "item/completed", params: { item: { ...object(item), detailsDeferred: false } } }, { threadId: activity.threadId ?? host.threadId, turnId: activity.turnId ?? host.turnId });
      const result = state.byKey[state.order[0]];
      if (live && result) { setLoaded({ source: activity, activity: { ...result, key: activity.key } }); host.notifyLayoutChange?.(); }
    }).catch(e => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [activity, host, open, retry, loaded]);
  const p = a.payload;
  const standalone = standaloneActivity(a);
  const content = "content" in p ? p.content : [];
  if (a.itemType === "contextCompaction") return <div className={`structured-activity is-${a.status}`} data-activity-id={a.id}>
    <div className="activity-status" role="status"><ActivityIcon activities={[a]} /><span className={active && a.status === "running" ? "stream-working-label" : undefined}>{a.label}</span></div>
    {p.kind === "system" && p.detail && p.detail !== a.label ? <p className="activity-status-detail">{p.detail}</p> : null}
    {error ? <p className="activity-status-detail">{error}</p> : null}
  </div>;
  if (p.kind === "plan") return a.itemType === "plan" && planView ? <>{planView}</> : <section className="activity-plan"><strong>{a.label}</strong><ActivityResult content={[{ type: "text", text: p.text }]} onOpen={onOpen} /></section>;
  return <div className={`structured-activity is-${a.status}`} data-activity-id={a.id}>
    <details className={`run-activity-item command-row is-${a.status}`} open={open} onToggle={e => { if (e.target === e.currentTarget) onToggle(e.currentTarget.open); }}>
      <summary className="command-summary" title={p.kind === "command" ? p.command : a.label}>
        <ActivityIcon activities={[a]} /><span className={active && a.status === "running" ? "stream-working-label" : undefined}>{a.label}</span>
        {a.status === "awaiting-approval" ? <small>Awaiting approval</small> : null}
        {a.durationMs !== null && a.durationMs >= 1000 ? <span className="command-duration">for {formatDuration(a.durationMs)}</span> : null}<ChevronRight size={14} className="command-chevron stream-disclosure-chevron" aria-hidden="true" />
      </summary>
      {open ? <div className="activity-detail">
        {error ? <p>Details unavailable: {error} <button className="icon-button activity-icon-button" type="button" aria-label="Retry" data-tooltip="Retry" onClick={() => setRetry(n => n + 1)}><RotateCw size={16} /></button></p> : a.detailsDeferred ? <p>{host ? "Loading details…" : "Details unavailable"}</p> : !a.detailsAvailable ? <p>Details unavailable</p> : p.kind === "command" ? <div className="command-output">
          {p.actions.map((action, i) => <div className="activity-command-action" key={i}>{action.type === "unknown" ? "Command" : action.type === "listFiles" ? "List files" : action.type === "search" ? "Search" : "Read"}{" "}
            {action.path ? <ActivityFileLink path={action.path} cwd={p.cwd} onOpen={onOpen} /> : null}{action.query ? <code>{action.query}</code> : null}</div>)}
          <pre className="command-source">$ {p.command}</pre><pre className="command-output-text">{p.output || (p.outputAvailable ? "No output" : a.status === "running" ? "Waiting for output…" : "Details unavailable")}</pre>
          {p.interactions.map((text, i) => <pre key={i}>{text}</pre>)}
          <div className="command-output-footer">{p.exitCode !== null ? `Process exited with code ${p.exitCode}` : `Command ${a.status}`}</div>
        </div> : p.kind === "edit" ? <>{p.changes.map((change, i) => <EditDetail key={`${change.path}:${i}`} change={change} expanded={editOpen(change.path)} onToggle={value => onEditToggle(change.path, value)} onOpen={onOpen} />)}{p.output ? <pre className="activity-json">{p.output}</pre> : null}</>
          : p.kind === "system" ? <p>{p.detail || a.label}</p>
          : p.kind === "tool" ? <><div className="activity-tool-identity">{String(p.appContext.appName || p.server)} / {p.tool}</div>{p.progress ? <p role="status">{p.progress}</p> : null}
            {p.agentThreadId ? <button className="icon-button activity-icon-button" type="button" aria-label="Open subagent" data-tooltip="Open subagent" disabled={!host?.inspectSubagent} onClick={() => host?.inspectSubagent?.(p.agentThreadId!)}><Users size={16} /></button> : null}
            {Object.keys(p.arguments).length ? <details><summary className="stream-detail-summary"><span>Tool input</span><ChevronRight size={15} className="stream-disclosure-chevron" aria-hidden="true" /></summary><pre className="activity-json">{JSON.stringify(p.arguments, null, 2)}</pre></details> : null}
            {!standalone ? <ActivityResult content={content} activity={a} onOpen={onOpen} /> : null}</> : null}
      </div> : null}
    </details>
    {a.itemType === "imageGeneration" && p.kind === "image" ? <GeneratedImagePreview index={0} image={{ id: a.id, threadId: a.threadId, status: a.status === "completed" ? "completed" : ["failed", "interrupted", "declined"].includes(a.status) ? "failed" : "generating", savedPath: p.savedPath ?? null, result: p.result ?? null, error: p.error ?? null }} /> : standalone && a.detailsAvailable && content.length > 0 ? <ActivityResult content={content} activity={a} onOpen={onOpen} /> : null}
    {standalone && error ? <p role="status">Details unavailable: {error}</p> : null}
    {p.kind === "tool" && p.resourceUri && !a.detailsDeferred && a.detailsAvailable ? <McpAppWidget activity={a} onOpen={onOpen} /> : null}
  </div>;
}

function EditDetail({ change, onOpen, expanded, onToggle }: { change: FileEdit; onOpen?: (href: string) => boolean; expanded: boolean; onToggle: (value: boolean) => void }) {
  return <details className="activity-edit" open={expanded} onToggle={e => { if (e.target === e.currentTarget && e.currentTarget.open !== expanded) onToggle(e.currentTarget.open); }}>
    <summary className="stream-detail-summary"><span><span>{change.kind === "add" ? "Added" : change.kind === "delete" ? "Deleted" : change.movePath ? "Renamed" : "Modified"}</span>{" "}<ActivityFileLink path={change.path} onOpen={onOpen} />{change.movePath ? <> → <ActivityFileLink path={change.movePath} onOpen={onOpen} /></> : null}</span><ChevronRight size={15} className="stream-disclosure-chevron" aria-hidden="true" /></summary>
    {expanded ? change.diff ? <div className="activity-inline-diff"><DiffPreview path={change.path} recordedPatch resolvedTheme={document.documentElement.dataset.theme === "light" ? "light" : "dark"} layout="inline"
      sections={[{ kind: "unstaged", title: "Recorded edit", baseLabel: "Before edit", headLabel: "After edit", baseContent: "", headContent: "", baseTruncated: false, headTruncated: false, content: change.diff, isBinary: false }]} /></div> : <p>No textual diff available</p> : null}
  </details>;
}
