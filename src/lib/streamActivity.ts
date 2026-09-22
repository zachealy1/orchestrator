import type { CodexMessage } from "../features/codex/types";
import { describeToolActivity } from "./toolActivity";

export type ActivityStatus = "pending" | "awaiting-approval" | "running" | "completed" | "failed" | "declined" | "interrupted";
export type CommandAction = { type: "read" | "listFiles" | "search" | "unknown"; command: string; path?: string; name?: string; query?: string };
export type FileEdit = { path: string; kind: "add" | "delete" | "update"; movePath?: string; diff: string };
export type ActivityContent =
  | { type: "text"; text: string }
  | { type: "json"; value: unknown }
  | { type: "image" | "audio" | "video"; url: string; mimeType?: string }
  | { type: "resource"; uri: string; name: string; mimeType?: string; text?: string; blob?: string };
export type ActivityPayload =
  | { kind: "command"; command: string; cwd: string; actions: CommandAction[]; output: string; outputAvailable?: boolean; exitCode: number | null; interactions: string[] }
  | { kind: "edit"; changes: FileEdit[]; output?: string }
  | { kind: "tool"; server: string; tool: string; arguments: Record<string, unknown>; appContext: Record<string, unknown>; resourceUri: string | null; result: Record<string, unknown> | null; content: ActivityContent[]; progress: string; agentThreadId?: string; action?: Record<string, unknown> }
  | { kind: "image"; path: string; content: ActivityContent[]; savedPath?: string; result?: string; error?: string }
  | { kind: "output"; content: ActivityContent[] }
  | { kind: "plan"; text: string }
  | { kind: "system"; detail: string };
export type StreamActivity = {
  key: string; id: string; itemType: string; threadId: string | null; turnId: string | null;
  status: ActivityStatus; label: string; durationMs: number | null;
  detailsAvailable: boolean; payload: ActivityPayload;
  detailsDeferred?: boolean;
  hasArtifacts?: boolean;
};
export type StreamActivityStore = { byKey: Record<string, StreamActivity>; order: string[] };
export const emptyActivityStore: StreamActivityStore = { byKey: {}, order: [] };
export const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export const string = (v: unknown): string => typeof v === "string" ? v : "";
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
export const terminalActivity = (status: ActivityStatus) => ["completed", "failed", "declined", "interrupted"].includes(status);

export function activityStatus(value: unknown, fallback: ActivityStatus): ActivityStatus {
  const s = string(value).toLowerCase();
  if (["failed", "error", "denied", "blocked", "timedout"].includes(s)) return "failed";
  if (["declined", "skipped"].includes(s)) return "declined";
  if (["interrupted", "cancelled", "canceled", "stopped", "aborted"].includes(s)) return "interrupted";
  if (["completed", "succeeded", "success", "approved"].includes(s)) return "completed";
  if (["inprogress", "running", "started"].includes(s)) return "running";
  return fallback;
}

export function commandActions(value: unknown): CommandAction[] {
  return list(value).map(object).map(a => ({
    type: ["read", "search", "listFiles"].includes(string(a.type)) ? a.type as CommandAction["type"] : "unknown",
    command: string(a.command), ...optionalStrings(a, ["path", "name", "query"]),
  }));
}
function optionalStrings(o: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.filter(k => typeof o[k] === "string").map(k => [k, o[k] as string]));
}
export function fileEdits(value: unknown): FileEdit[] {
  return list(value).map(object).filter(c => string(c.path)).map(c => {
    const k = typeof c.kind === "string" ? c.kind : object(c.kind).type;
    return { path: string(c.path), kind: k === "add" || k === "delete" ? k : "update", diff: string(c.diff),
      ...(string(object(c.kind).move_path) ? { movePath: string(object(c.kind).move_path) } : {}) };
  });
}

/** Only recognized display content crosses into a renderer. Raw envelopes never become HTML. */
export function activityContent(value: unknown): ActivityContent[] {
  if (typeof value === "string") return value ? [{ type: "text", text: value }] : [];
  return list(value).flatMap((v): ActivityContent[] => {
    const c = object(v); const type = string(c.type); const mime = string(c.mimeType);
    if (["text", "inputText", "output_text"].includes(type)) return [{ type: "text", text: string(c.text) }];
    const mediaType = type === "inputImage" ? "image" : type === "inputAudio" ? "audio" : type;
    if (["image", "audio", "video"].includes(mediaType)) {
      const url = string(c.url ?? c.imageUrl ?? c.audioUrl ?? c.videoUrl) || (string(c.data) && mime ? `data:${mime};base64,${c.data}` : "");
      return url ? [{ type: mediaType as "image" | "audio" | "video", url, mimeType: mime }] : [];
    }
    if (type === "resource_link" || type === "resource") {
      const r = type === "resource" ? object(c.resource) : c;
      return string(r.uri) ? [{ type: "resource", uri: string(r.uri), name: string(c.title ?? c.name) || string(r.uri),
        ...optionalStrings(r, ["mimeType", "text", "blob"]) }] : [];
    }
    return [];
  });
}

export function activityLabel(item: Record<string, unknown>, payload: ActivityPayload, status: ActivityStatus): string {
  const done = terminalActivity(status); const failed = status === "failed"; const stopped = status === "interrupted" || status === "declined";
  let label: string;
  switch (payload.kind) {
    case "command": {
      const actions = payload.actions;
      label = actions.length && actions.every(a => a.type !== "unknown")
        ? actions.map(a => `${a.type === "read" ? (done ? "Read" : "Reading") : a.type === "search" ? (done ? "Searched" : "Searching") : (done ? "Listed" : "Listing")} ${a.name || a.path || a.query || "files"}`).join(", ")
        : `${done ? "Ran" : "Running"} ${payload.command}`;
      break;
    }
    case "edit": label = `${done ? "Edited" : "Editing"} ${payload.changes.length === 1 ? payload.changes[0].path : `${payload.changes.length} files`}`; break;
    case "tool":
      if (item.type === "webSearch") {
        const action = payload.action ?? {}; const type = string(action.type);
        label = `${type === "openPage" ? (done ? "Opened" : "Opening") : type === "findInPage" ? (done ? "Searched page" : "Searching page") : (done ? "Searched the web" : "Searching the web")} ${string(action.url ?? action.query) || list(action.queries).map(string).join(", ")}${string(action.pattern) ? ` for ${action.pattern}` : ""}`.trim();
      } else if (item.type === "subAgentActivity") label = `Subagent ${string(item.kind) || "activity"}: ${string(item.agentPath) || payload.agentThreadId || "agent"}`;
      else label = describeToolActivity({ ...item, server: payload.server, tool: payload.tool, arguments: payload.arguments }, status === "awaiting-approval" ? "pending" : status).label;
      break;
    case "image": label = `${item.type === "imageGeneration" ? (done ? "Generated" : "Generating") : (done ? "Viewed" : "Viewing")} image`; break;
    case "output": label = string(item.name ?? item.tool) || "Tool result"; break;
    case "plan": label = item.type === "planProgress" ? "Plan progress" : done ? "Plan ready for review" : "Drafting plan"; break;
    case "system": {
      const labels: Record<string, string> = { contextCompaction: status === "completed" ? "Context compacted" : done ? "Context compaction" : "Compacting context", sleep: done ? "Finished waiting" : "Waiting", enteredReviewMode: "Entered review mode", exitedReviewMode: "Finished review", hookPrompt: "Hook instructions", hook: done ? "Hook completed" : "Running hook", autoApprovalReview: done ? "Approval review completed" : "Reviewing approval", warning: "Warning", modelRerouted: "Model changed" };
      label = labels[string(item.type)] || "Agent activity";
      if (item.type === "hook") label += `: ${string(item.name ?? item.hookName) || "hook"}`;
      break;
    }
  }
  if (failed) return `Failed: ${label}`;
  if (stopped) return `${status === "declined" ? "Skipped" : "Stopped"}: ${label}`;
  if (status === "awaiting-approval") return `Awaiting approval: ${label}`;
  return label;
}

function payloadFor(item: Record<string, unknown>, previous?: ActivityPayload): ActivityPayload {
  const type = string(item.type);
  if (type === "plan" || type === "planProgress") return { kind: "plan", text: string(item.text) || (previous?.kind === "plan" ? previous.text : "") };
  if (type === "commandExecution" || type === "command") {
    const prev = previous?.kind === "command" ? previous : undefined;
    return { kind: "command", command: string(item.command) || prev?.command || "Command", cwd: string(item.cwd) || prev?.cwd || "",
      actions: item.commandActions !== undefined ? commandActions(item.commandActions) : prev?.actions ?? [],
      output: typeof item.aggregatedOutput === "string" ? item.aggregatedOutput : prev?.output ?? "",
      outputAvailable: typeof item.aggregatedOutput === "string" || prev?.outputAvailable || false,
      exitCode: typeof item.exitCode === "number" ? item.exitCode : prev?.exitCode ?? null, interactions: prev?.interactions ?? [] };
  }
  if (type === "fileChange") return { kind: "edit", changes: item.changes !== undefined ? fileEdits(item.changes) : previous?.kind === "edit" ? previous.changes : [], output: previous?.kind === "edit" ? previous.output : undefined };
  if (["mcpToolCall", "dynamicToolCall", "collabAgentToolCall", "collabToolCall", "subAgentActivity", "webSearch"].includes(type)) {
    const prev = previous?.kind === "tool" ? previous : undefined;
    const result = item.result !== undefined ? object(item.result) : prev?.result ?? null;
    const context = Object.keys(object(item.appContext)).length ? object(item.appContext) : prev?.appContext ?? {};
    let content = item.result !== undefined ? activityContent(result?.content) : item.contentItems !== undefined ? activityContent(item.contentItems) : prev?.content ?? [];
    if (item.result !== undefined && result?.structuredContent != null) content = [...content, { type: "json", value: result.structuredContent }];
    if (type === "webSearch" && item.results !== undefined) content = list(item.results).flatMap(r => {
      const row = object(r); return string(row.url) ? [{ type: "resource" as const, uri: string(row.url), name: string(row.title) || string(row.url) }] : [];
    });
    if (item.error) content = [...content, { type: "text", text: string(object(item.error).message) || string(item.error) || "Tool failed" }];
    const resourceUri = string(context.resourceUri) || string(item.mcpAppResourceUri) || string(object(object(result?._meta).ui).resourceUri) || string(object(result?._meta)["ui/resourceUri"]) || string(object(result?._meta)["openai/outputTemplate"]) || prev?.resourceUri || null;
    return { kind: "tool", server: string(item.server) || prev?.server || "", tool: string(item.tool) || prev?.tool || type,
      arguments: item.arguments === undefined ? prev?.arguments ?? {} : object(item.arguments), appContext: context, resourceUri, result, content,
      progress: prev?.progress ?? "", agentThreadId: string(item.agentThreadId ?? list(item.receiverThreadIds)[0] ?? item.receiverThreadId) || prev?.agentThreadId,
      action: item.action !== undefined ? object(item.action) : typeof item.query === "string" ? { type: "search", query: item.query } : prev?.action };
  }
  if (type === "imageView" || type === "imageGeneration") {
    const prev = previous?.kind === "image" ? previous : undefined;
    const path = string(item.path ?? item.savedPath ?? item.result) || prev?.path || "";
    return { kind: "image", path, content: path ? [{ type: "image", url: path }] : [],
      savedPath: string(item.savedPath) || prev?.savedPath, result: string(item.result) || string(object(item.result).url) || prev?.result,
      error: string(object(item.error).message) || string(item.error) || (item.failure ? "Image generation failed." : prev?.error) };
  }
  if (type === "functionCallOutput") {
    const output = item.output; return { kind: "output", content: activityContent(output).length ? activityContent(output) : output == null ? [] : [{ type: "json", value: output }] };
  }
  return { kind: "system", detail: [object(item.error).message, item.error, item.message, item.review, item.description, item.statusMessage, item.rationale].map(string).find(Boolean) || (type === "sleep" ? `${Number(item.durationMs) || 0} ms` : type === "hookPrompt" ? list(item.fragments).map(f => string(object(f).text)).filter(Boolean).join("\n") : list(item.entries).map(e => string(object(e).text)).join("\n")) || (previous?.kind === "system" ? previous.detail : "") };
}

export function reduceStreamActivity(store: StreamActivityStore, message: CodexMessage, context: { threadId: string | null; turnId: string | null; profileKey?: string }): StreamActivityStore {
  const p = object(message.params); let item = object(p.item); const method = message.method ?? "";
  const threadId = string(p.threadId) || context.threadId; const turnId = string(p.turnId) || context.turnId;
  if ((context.threadId && threadId !== context.threadId) || (context.turnId && turnId !== context.turnId && method !== "turn/started")) return store;
  if (["turn/completed", "turn/interrupted", "error"].includes(method)) {
    const byKey = { ...store.byKey }; let changed = false;
    for (const key of store.order) if (!terminalActivity(byKey[key].status)) {
      const old = byKey[key]; const status = method === "error" || object(p.turn).status === "failed" ? "failed" : "interrupted";
      byKey[key] = { ...old, status, label: activityLabel({ type: old.itemType }, old.payload, status) }; changed = true;
    }
    return changed ? { ...store, byKey } : store;
  }
  let id = string(item.id ?? p.itemId ?? p.commandId ?? p.id);
  let type = string(item.type);
  const end = method.endsWith("/completed");
  if (method.startsWith("hook/")) { item = { ...object(p.run), type: "hook", name: object(p.run).eventName }; id = string(item.id ?? p.hookRunId ?? p.hookId); type = "hook"; }
  if (method.startsWith("item/autoApprovalReview/")) { item = { ...p, ...object(p.review), type: "autoApprovalReview" }; id = `review:${string(p.reviewId) || id}`; type = "autoApprovalReview"; }
  if (method === "turn/plan/updated") { type = "planProgress"; id = "plan-progress"; item = { type, id, status: "completed", text: list(p.plan).map(s => `${string(object(s).status)}: ${string(object(s).step)}`).join("\n") }; }
  if (["warning", "guardianWarning", "configWarning", "deprecationNotice", "windows/worldWritableWarning", "autoApprovalReview/strictReviewRequired", "model/rerouted", "thread/compacted"].includes(method)) {
    type = method === "thread/compacted" ? "contextCompaction" : method === "model/rerouted" ? "modelRerouted" : "warning";
    const detail = method === "autoApprovalReview/strictReviewRequired" ? "Strict approval review required" : method === "model/rerouted" ? `${string(p.fromModel)} → ${string(p.toModel)}: ${string(p.reason)}` : [p.message, p.summary, p.details].map(string).filter(Boolean).join("\n");
    item = { ...p, type, message: detail }; id ||= `${method}:${detail || store.order.length}`;
    if (type === "contextCompaction" && store.order.some(k => store.byKey[k].itemType === type)) return store;
  }
  if (["agentMessage", "reasoning", "userMessage", "steeringUserMessage"].includes(type)) return store;
  if (!id) return store;
  const key = JSON.stringify([context.profileKey ?? "", threadId, turnId, id]);
  const old = store.byKey[key];
  if (method === "item/fileChange/patchUpdated") { type = "fileChange"; item = { type, id, changes: p.changes }; }
  if (/^(item\/commandExecution|command\/exec)\/(started|completed)$/.test(method)) { type = "commandExecution"; item = { ...p, type, id }; }
  if (!type && old) {
    if (terminalActivity(old.status)) return store;
    let payload = old.payload;
    if (method === "item/commandExecution/outputDelta" && payload.kind === "command") payload = { ...payload, output: payload.output + string(p.delta), outputAvailable: true };
    else if (method === "item/fileChange/outputDelta" && payload.kind === "edit") payload = { ...payload, output: (payload.output ?? "") + string(p.delta) };
    else if (method === "item/plan/delta" && payload.kind === "plan") payload = { ...payload, text: payload.text + string(p.delta) };
    else if (method === "item/commandExecution/terminalInteraction" && payload.kind === "command") payload = { ...payload, interactions: [...payload.interactions, string(p.stdin) || string(p.input) || "Terminal interaction"] };
    else if (method === "item/mcpToolCall/progress" && payload.kind === "tool") payload = { ...payload, progress: string(p.message) };
    else if (method.endsWith("/requestApproval")) return { ...store, byKey: { ...store.byKey, [key]: { ...old, status: "awaiting-approval" } } };
    else return store;
    return { ...store, byKey: { ...store.byKey, [key]: { ...old, payload, status: "running" } } };
  }
  if (!type) return store;
  if (old && terminalActivity(old.status) && !end && type !== "planProgress") return store;
  const status = activityStatus(item.status, end || ["warning", "modelRerouted"].includes(type) || method === "thread/compacted" ? "completed" : "running");
  const finalStatus = item.error || item.failure || item.success === false ? "failed" : status;
  // First terminal outcome is authoritative. Later starts/deltas and conflicting
  // duplicate completions cannot resurrect or rewrite finished work.
  if (old && terminalActivity(old.status) && old.status !== finalStatus) return store;
  const payload = payloadFor(item, old?.payload);
  const activity: StreamActivity = { key, id, itemType: type, threadId, turnId, status: finalStatus,
    label: activityLabel(item, payload, finalStatus), payload,
    durationMs: typeof item.durationMs === "number" ? item.durationMs : old?.durationMs ?? null,
    detailsAvailable: item.detailsAvailable === false ? false : item.redacted === true ? false : old?.detailsAvailable ?? true,
    hasArtifacts: item.hasArtifacts === true || old?.hasArtifacts,
    ...(item.detailsDeferred === true ? { detailsDeferred: true } : {}) };
  if (old && JSON.stringify(old) === JSON.stringify(activity)) return store;
  return { byKey: { ...store.byKey, [key]: activity }, order: old ? store.order : [...store.order, key] };
}

export function activityCategories(activity: StreamActivity): string[] {
  const p = activity.payload;
  if (p.kind === "edit") return ["Edited files"];
  if (p.kind === "command") return [...(p.actions.some(a => a.type !== "unknown") ? ["Read files"] : []), ...(!p.actions.length || p.actions.some(a => a.type === "unknown") ? ["Ran commands"] : [])];
  if (activity.itemType === "webSearch") return ["Searched the web"];
  if (p.kind === "tool" && p.agentThreadId) return ["Coordinated subagents"];
  return ["Used tools"];
}
export function activitySummary(activities: StreamActivity[]) {
  const categories = new Set(activities.flatMap(activityCategories));
  const order = ["Edited files", "Read files", "Ran commands", "Used tools", "Searched the web", "Coordinated subagents"];
  return order.filter(c => categories.has(c)).map((c, i) => i ? c[0].toLowerCase() + c.slice(1) : c).join(", ");
}
export function standaloneActivity(a: StreamActivity) {
  return Boolean(a.hasArtifacts) || ["image", "output", "system", "plan"].includes(a.payload.kind) || (a.payload.kind === "tool" && (Boolean(a.payload.resourceUri) || a.payload.content.some(c => c.type !== "text" && c.type !== "json")));
}
