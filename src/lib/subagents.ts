import { useSyncExternalStore } from "react";
import type { CodexMessage } from "../types";

export type SubagentLifecycleStatus =
  | "starting"
  | "running"
  | "waiting"
  | "needs-attention"
  | "stopping"
  | "completed"
  | "failed"
  | "interrupted"
  | "stopped";

export type SubagentRecord = {
  id: string;
  ownerClientId: string | null;
  workspaceId: number;
  chatId: number | null;
  runId: number | null;
  parentTurnId: string | null;
  profileKey: string;
  accountId: number;
  rootThreadId: string;
  parentThreadId: string;
  childThreadId: string;
  childTurnId: string | null;
  spawnItemId: string | null;
  task: string;
  depth: number;
  status: SubagentLifecycleStatus;
  statusBeforeAttention: SubagentLifecycleStatus | null;
  agentStatus: string | null;
  needsAttention: boolean;
  error: string | null;
  finalResult: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type SubagentTranscriptItem =
  | {
      id: string;
      kind: "user";
      text: string;
    }
  | {
      id: string;
      kind: "assistant";
      text: string;
      phase: "commentary" | "final_answer" | null;
    }
  | {
      id: string;
      kind: "plan";
      text: string;
    }
  | {
      id: string;
      kind: "reasoning";
      summaries: string[];
    }
  | {
      id: string;
      kind: "activity";
      activityKind: "command" | "file" | "mcp" | "collaboration" | "web";
      label: string;
      status: string | null;
    };

export type SubagentTranscriptTurn = {
  id: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  items: SubagentTranscriptItem[];
};

export type SubagentTranscript = {
  threadId: string;
  status: string | null;
  activeTurnId: string | null;
  turns: SubagentTranscriptTurn[];
};

export type SubagentComposerModel = {
  records: SubagentRecord[];
  activeCount: number;
  completedCount: number;
  attentionCount: number;
};

export type CollabToolName =
  | "spawn_agent"
  | "send_input"
  | "resume_agent"
  | "wait_agent"
  | "close_agent";

export type ParsedCollabToolCall = {
  itemId: string;
  tool: CollabToolName;
  itemStatus: string | null;
  senderThreadId: string;
  receiverThreadId: string | null;
  newThreadId: string | null;
  childThreadId: string;
  prompt: string | null;
  agentStatus: string | null;
};

export type ParsedLegacySubagentActivity = {
  itemId: string;
  childThreadId: string;
  agentPath: string | null;
  status: SubagentLifecycleStatus;
};

const EMPTY_SUBAGENTS: readonly SubagentRecord[] = Object.freeze([]);
const conversationSnapshots = new Map<string, readonly SubagentRecord[]>();
const conversationListeners = new Map<string, Set<() => void>>();
const childThreadIndex = new Map<string, SubagentRecord>();

function recordIndexKey(profileKey: string, threadId: string) {
  return `${profileKey}:${threadId}`;
}

export function subagentConversationKey(input: {
  chatId?: number | null;
  ownerClientId?: string | null;
}) {
  if (input.chatId !== null && input.chatId !== undefined) {
    return `chat:${input.chatId}`;
  }
  return input.ownerClientId ? `draft:${input.ownerClientId}` : null;
}

function recordConversationKey(record: SubagentRecord) {
  return subagentConversationKey(record) ?? `run:${record.runId ?? record.id}`;
}

function emitConversation(key: string) {
  conversationListeners.get(key)?.forEach((listener) => listener());
}

function indexRecords(records: readonly SubagentRecord[]) {
  records.forEach((record) => {
    childThreadIndex.set(
      recordIndexKey(record.profileKey, record.childThreadId),
      record,
    );
  });
}

export function replaceConversationSubagents(
  conversationKey: string,
  records: SubagentRecord[],
) {
  const previous = conversationSnapshots.get(conversationKey) ?? EMPTY_SUBAGENTS;
  previous.forEach((record) => {
    const key = recordIndexKey(record.profileKey, record.childThreadId);
    if (childThreadIndex.get(key)?.id === record.id) {
      childThreadIndex.delete(key);
    }
  });
  const next = [...records].sort(compareSubagents);
  conversationSnapshots.set(conversationKey, next);
  indexRecords(next);
  emitConversation(conversationKey);
}

export function upsertConversationSubagent(record: SubagentRecord) {
  const conversationKey = recordConversationKey(record);
  const current = conversationSnapshots.get(conversationKey) ?? EMPTY_SUBAGENTS;
  const existingIndex = current.findIndex(
    (candidate) => candidate.id === record.id,
  );
  const next =
    existingIndex >= 0
      ? current.map((candidate, index) =>
          index === existingIndex ? record : candidate,
        )
      : [...current, record];
  next.sort(compareSubagents);
  conversationSnapshots.set(conversationKey, next);
  childThreadIndex.set(
    recordIndexKey(record.profileKey, record.childThreadId),
    record,
  );
  emitConversation(conversationKey);
}

export function promoteSubagentConversation(
  ownerClientId: string,
  chatId: number,
) {
  const draftKey = subagentConversationKey({ ownerClientId });
  const chatKey = subagentConversationKey({ chatId });
  if (!draftKey || !chatKey) return;
  const draft = conversationSnapshots.get(draftKey);
  if (!draft || draft.length === 0) return;
  const existing = conversationSnapshots.get(chatKey) ?? EMPTY_SUBAGENTS;
  replaceConversationSubagents(
    chatKey,
    [...existing, ...draft.map((record) => ({ ...record, chatId }))],
  );
  conversationSnapshots.delete(draftKey);
  emitConversation(draftKey);
}

export function findSubagentByThread(
  profileKey: string,
  threadId: string | null | undefined,
) {
  if (!threadId) return null;
  return childThreadIndex.get(recordIndexKey(profileKey, threadId)) ?? null;
}

export function updateSubagentByThread(
  profileKey: string,
  threadId: string,
  updater: (record: SubagentRecord) => SubagentRecord,
) {
  const current = findSubagentByThread(profileKey, threadId);
  if (!current) return null;
  const next = updater(current);
  upsertConversationSubagent(next);
  return next;
}

export function getConversationSubagents(conversationKey: string | null) {
  return conversationKey
    ? conversationSnapshots.get(conversationKey) ?? EMPTY_SUBAGENTS
    : EMPTY_SUBAGENTS;
}

export function subscribeConversationSubagents(
  conversationKey: string | null,
  listener: () => void,
) {
  if (!conversationKey) return () => undefined;
  const listeners =
    conversationListeners.get(conversationKey) ?? new Set<() => void>();
  listeners.add(listener);
  conversationListeners.set(conversationKey, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) conversationListeners.delete(conversationKey);
  };
}

export function useConversationSubagents(conversationKey: string | null) {
  return useSyncExternalStore(
    (listener) => subscribeConversationSubagents(conversationKey, listener),
    () => getConversationSubagents(conversationKey),
    () => EMPTY_SUBAGENTS,
  );
}

export function clearSubagentStore() {
  const keys = new Set([
    ...conversationSnapshots.keys(),
    ...conversationListeners.keys(),
  ]);
  conversationSnapshots.clear();
  childThreadIndex.clear();
  keys.forEach(emitConversation);
}

export function deriveSubagentComposerModel(
  records: readonly SubagentRecord[],
): SubagentComposerModel {
  let activeCount = 0;
  let completedCount = 0;
  let attentionCount = 0;
  records.forEach((record) => {
    if (isActiveSubagentStatus(record.status)) activeCount += 1;
    else completedCount += 1;
    if (record.needsAttention || record.status === "needs-attention") {
      attentionCount += 1;
    }
  });
  return {
    records: [...records],
    activeCount,
    completedCount,
    attentionCount,
  };
}

export function isActiveSubagentStatus(status: SubagentLifecycleStatus) {
  return [
    "starting",
    "running",
    "waiting",
    "needs-attention",
    "stopping",
  ].includes(status);
}

export function isSubagentLifecycleStatus(
  value: unknown,
): value is SubagentLifecycleStatus {
  return (
    typeof value === "string" &&
    [
      "starting",
      "running",
      "waiting",
      "needs-attention",
      "stopping",
      "completed",
      "failed",
      "interrupted",
      "stopped",
    ].includes(value)
  );
}

export function parseCollabToolCall(
  message: CodexMessage,
): ParsedCollabToolCall | null {
  return parseCollabToolCalls(message)[0] ?? null;
}

export function parseCollabToolCalls(
  message: CodexMessage,
): ParsedCollabToolCall[] {
  if (message.method !== "item/started" && message.method !== "item/completed") {
    return [];
  }
  const params = readRecord(message.params);
  const item = readRecord(params.item);
  if (
    item.type !== "collabAgentToolCall" &&
    item.type !== "collabToolCall"
  ) {
    return [];
  }
  const tool = normalizeCollabToolName(readString(item.tool));
  if (!tool) return [];
  const senderThreadId = readString(item.senderThreadId);
  const itemId = readString(item.id);
  if (!senderThreadId || !itemId) return [];
  const receiverThreadIds = Array.isArray(item.receiverThreadIds)
    ? item.receiverThreadIds.map(readString).filter(Boolean)
    : [];
  const receiverThreadId =
    receiverThreadIds[0] ?? readString(item.receiverThreadId);
  const newThreadId = readString(item.newThreadId);
  const childThreadIds = Array.from(
    new Set(
      [newThreadId, ...receiverThreadIds, receiverThreadId].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );
  const states = readRecord(item.agentsStates);
  const fallbackAgentStatus =
    readAgentStatus(item.agentStatus) ?? readAgentStatus(item.agentsStates);
  return childThreadIds.map((childThreadId) => ({
    itemId,
    tool,
    itemStatus: readString(item.status),
    senderThreadId,
    receiverThreadId: childThreadId,
    newThreadId:
      tool === "spawn_agent" ? childThreadId : newThreadId,
    childThreadId,
    prompt: readPrompt(item.prompt),
    agentStatus:
      readAgentStatus(states[childThreadId]) ?? fallbackAgentStatus,
  }));
}

export function parseLegacySubagentActivity(
  message: CodexMessage,
): ParsedLegacySubagentActivity | null {
  if (message.method !== "item/started" && message.method !== "item/completed") {
    return null;
  }
  const item = readRecord(readRecord(message.params).item);
  if (item.type !== "subAgentActivity") return null;
  const itemId = readString(item.id);
  const childThreadId = readString(item.agentThreadId);
  if (!itemId || !childThreadId) return null;
  const kind = readString(item.kind);
  const status =
    kind === "interrupted"
      ? "interrupted"
      : kind === "started"
        ? message.method === "item/completed"
          ? "running"
          : "starting"
        : "running";
  return {
    itemId,
    childThreadId,
    agentPath: readString(item.agentPath),
    status,
  };
}

export function lifecycleFromCollabToolCall(
  call: ParsedCollabToolCall,
  eventMethod: CodexMessage["method"],
  current: SubagentLifecycleStatus | null,
): SubagentLifecycleStatus {
  const agentStatus = normalizeAgentStatus(call.agentStatus);
  if (agentStatus) return agentStatus;
  if (
    call.itemStatus === "failed" ||
    call.itemStatus === "error" ||
    call.itemStatus === "declined"
  ) {
    return "failed";
  }
  if (eventMethod === "item/started") {
    return call.tool === "close_agent"
      ? "stopping"
      : call.tool === "wait_agent"
        ? "waiting"
        : call.tool === "spawn_agent"
          ? "starting"
          : "running";
  }
  switch (call.tool) {
    case "spawn_agent":
    case "send_input":
    case "resume_agent":
      return "running";
    case "wait_agent":
      return current && !isActiveSubagentStatus(current) ? current : "waiting";
    case "close_agent":
      return "stopped";
  }
}

export function lifecycleFromChildTurn(
  method: string | null | undefined,
  turnStatus?: string | null,
): SubagentLifecycleStatus | null {
  if (method === "turn/started") return "running";
  if (method === "turn/interrupted") return "interrupted";
  if (method !== "turn/completed") return null;
  switch (turnStatus) {
    case "failed":
    case "error":
      return "failed";
    case "interrupted":
    case "cancelled":
      return "interrupted";
    default:
      return "completed";
  }
}

export function subagentDurationMs(
  record: SubagentRecord,
  nowMs = Date.now(),
) {
  const started = Date.parse(record.startedAt);
  const completed = record.completedAt
    ? Date.parse(record.completedAt)
    : nowMs;
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return 0;
  return Math.max(0, completed - started);
}

function compareSubagents(left: SubagentRecord, right: SubagentRecord) {
  return (
    Date.parse(right.startedAt) - Date.parse(left.startedAt) ||
    left.depth - right.depth ||
    left.id.localeCompare(right.id)
  );
}

function normalizeAgentStatus(
  value: string | null,
): SubagentLifecycleStatus | null {
  const normalized = value?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (!normalized) return null;
  if (normalized.includes("need") || normalized.includes("approval")) {
    return "needs-attention";
  }
  if (normalized.includes("start") || normalized.includes("pendinginit")) {
    return "starting";
  }
  if (normalized.includes("running") || normalized.includes("active")) {
    return "running";
  }
  if (normalized.includes("wait") || normalized.includes("idle")) {
    return "waiting";
  }
  if (normalized.includes("complete") || normalized.includes("done")) {
    return "completed";
  }
  if (
    normalized.includes("interrupt") ||
    normalized.includes("cancel")
  ) {
    return "interrupted";
  }
  if (
    normalized.includes("fail") ||
    normalized.includes("error") ||
    normalized.includes("crash") ||
    normalized.includes("notfound")
  ) {
    return "failed";
  }
  if (
    normalized.includes("close") ||
    normalized.includes("stop") ||
    normalized.includes("shutdown")
  ) {
    return "stopped";
  }
  return null;
}

function normalizeCollabToolName(
  value: string | null,
): CollabToolName | null {
  switch (value) {
    case "spawnAgent":
    case "spawn_agent":
      return "spawn_agent";
    case "sendInput":
    case "send_input":
      return "send_input";
    case "resumeAgent":
    case "resume_agent":
      return "resume_agent";
    case "wait":
    case "wait_agent":
      return "wait_agent";
    case "closeAgent":
    case "close_agent":
      return "close_agent";
    default:
      return null;
  }
}

function readPrompt(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const text = value
      .map((part) => {
        if (typeof part === "string") return part;
        const record = readRecord(part);
        return readString(record.text) ?? "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
    return text || null;
  }
  const record = readRecord(value);
  return readString(record.text) ?? readString(record.prompt);
}

function readAgentStatus(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(readAgentStatus).find(Boolean) ?? null;
  }
  const record = readRecord(value);
  return (
    readString(record.status) ??
    readString(record.state) ??
    Object.values(record).map(readAgentStatus).find(Boolean) ??
    null
  );
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
