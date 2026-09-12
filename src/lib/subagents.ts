import { useSyncExternalStore } from "react";
import type { CodexMessage } from "../features/codex/types";

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

export type SubagentInstructionKind = "spawn" | "followup" | "steer";

export type SubagentInstruction = {
  id: string;
  subagentId: string;
  kind: SubagentInstructionKind;
  text: string;
  createdAt: string;
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
      delivery?: "async";
      questions?: Array<{ title: string; options?: string[] }>;
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
  instructions?: SubagentInstruction[];
};

export const SUBAGENT_TASK_CAPTURE_START = "<orchestrator-subagent-task>";
export const SUBAGENT_TASK_CAPTURE_END = "</orchestrator-subagent-task>";

export type SubagentTaskCapture = {
  itemId: string;
  text: string;
  createdAt: string | null;
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
  | "followup_task"
  | "send_message"
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

function isTrackableSubagent(record: SubagentRecord) {
  return record.childThreadId !== record.rootThreadId;
}

export class SubagentStore {
  readonly #conversationSnapshots = new Map<
    string,
    readonly SubagentRecord[]
  >();
  readonly #conversationListeners = new Map<string, Set<() => void>>();
  readonly #childThreadIndex = new Map<string, SubagentRecord>();

  replaceConversation(conversationKey: string, records: SubagentRecord[]) {
    const previous =
      this.#conversationSnapshots.get(conversationKey) ?? EMPTY_SUBAGENTS;
    previous.forEach((record) => {
      const key = recordIndexKey(record.profileKey, record.childThreadId);
      if (this.#childThreadIndex.get(key)?.id === record.id) {
        this.#childThreadIndex.delete(key);
      }
    });
    const next = records.filter(isTrackableSubagent).sort(compareSubagents);
    this.#conversationSnapshots.set(conversationKey, next);
    next.forEach((record) => {
      this.#childThreadIndex.set(
        recordIndexKey(record.profileKey, record.childThreadId),
        record,
      );
    });
    this.#emitConversation(conversationKey);
  }

  upsert(record: SubagentRecord) {
    const conversationKey = recordConversationKey(record);
    const current =
      this.#conversationSnapshots.get(conversationKey) ?? EMPTY_SUBAGENTS;
    if (!isTrackableSubagent(record)) {
      const next = current.filter(
        (candidate) =>
          candidate.id !== record.id &&
          !(
            candidate.profileKey === record.profileKey &&
            candidate.childThreadId === record.childThreadId
          ),
      );
      if (next.length !== current.length) {
        this.replaceConversation(conversationKey, next);
      }
      return;
    }
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
    this.#conversationSnapshots.set(conversationKey, next);
    this.#childThreadIndex.set(
      recordIndexKey(record.profileKey, record.childThreadId),
      record,
    );
    this.#emitConversation(conversationKey);
  }

  promoteConversation(ownerClientId: string, chatId: number) {
    const draftKey = subagentConversationKey({ ownerClientId });
    const chatKey = subagentConversationKey({ chatId });
    if (!draftKey || !chatKey) return;
    const draft = this.#conversationSnapshots.get(draftKey);
    if (!draft || draft.length === 0) return;
    const existing =
      this.#conversationSnapshots.get(chatKey) ?? EMPTY_SUBAGENTS;
    this.replaceConversation(chatKey, [
      ...existing,
      ...draft.map((record) => ({ ...record, chatId })),
    ]);
    this.#conversationSnapshots.delete(draftKey);
    this.#emitConversation(draftKey);
  }

  findByThread(profileKey: string, threadId: string | null | undefined) {
    if (!threadId) return null;
    return (
      this.#childThreadIndex.get(recordIndexKey(profileKey, threadId)) ?? null
    );
  }

  updateByThread(
    profileKey: string,
    threadId: string,
    updater: (record: SubagentRecord) => SubagentRecord,
  ) {
    const current = this.findByThread(profileKey, threadId);
    if (!current) return null;
    const next = updater(current);
    this.upsert(next);
    return next;
  }

  getConversation(conversationKey: string | null) {
    return conversationKey
      ? this.#conversationSnapshots.get(conversationKey) ?? EMPTY_SUBAGENTS
      : EMPTY_SUBAGENTS;
  }

  subscribe(conversationKey: string | null, listener: () => void) {
    if (!conversationKey) return () => undefined;
    const listeners =
      this.#conversationListeners.get(conversationKey) ?? new Set<() => void>();
    listeners.add(listener);
    this.#conversationListeners.set(conversationKey, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.#conversationListeners.delete(conversationKey);
      }
    };
  }

  removeConversation(conversationKey: string) {
    const records =
      this.#conversationSnapshots.get(conversationKey) ?? EMPTY_SUBAGENTS;
    records.forEach((record) => {
      const key = recordIndexKey(record.profileKey, record.childThreadId);
      if (this.#childThreadIndex.get(key)?.id === record.id) {
        this.#childThreadIndex.delete(key);
      }
    });
    this.#conversationSnapshots.delete(conversationKey);
    this.#emitConversation(conversationKey);
  }

  removeWorkspace(workspaceId: number) {
    for (const [conversationKey, records] of this.#conversationSnapshots) {
      if (records.some((record) => record.workspaceId === workspaceId)) {
        this.removeConversation(conversationKey);
      }
    }
  }

  getWorkspaceRecords(workspaceId: number) {
    return [...this.#conversationSnapshots.values()]
      .flat()
      .filter((record) => record.workspaceId === workspaceId);
  }

  hasActiveWork() {
    return [...this.#conversationSnapshots.values()].some((records) =>
      records.some((record) => record.completedAt === null && isActiveSubagentStatus(record.status)));
  }

  clear() {
    const keys = new Set([
      ...this.#conversationSnapshots.keys(),
      ...this.#conversationListeners.keys(),
    ]);
    this.#conversationSnapshots.clear();
    this.#childThreadIndex.clear();
    keys.forEach((key) => this.#emitConversation(key));
  }

  dispose() {
    this.clear();
    this.#conversationListeners.clear();
  }

  #emitConversation(key: string) {
    this.#conversationListeners.get(key)?.forEach((listener) => listener());
  }
}

export function useConversationSubagents(
  store: SubagentStore,
  conversationKey: string | null,
) {
  return useSyncExternalStore(
    (listener) => store.subscribe(conversationKey, listener),
    () => store.getConversation(conversationKey),
    () => EMPTY_SUBAGENTS,
  );
}

export function deriveSubagentComposerModel(
  records: readonly SubagentRecord[],
): SubagentComposerModel {
  const trackableRecords = records.filter(isTrackableSubagent);
  let activeCount = 0;
  let completedCount = 0;
  let attentionCount = 0;
  trackableRecords.forEach((record) => {
    if (isActiveSubagentStatus(record.status)) activeCount += 1;
    else completedCount += 1;
    if (record.needsAttention || record.status === "needs-attention") {
      attentionCount += 1;
    }
  });
  return {
    records: trackableRecords,
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

export function parseSubagentTaskCapture(value: string) {
  const message = value.trim();
  if (
    !message.startsWith(SUBAGENT_TASK_CAPTURE_START) ||
    !message.endsWith(SUBAGENT_TASK_CAPTURE_END)
  ) {
    return null;
  }
  const task = message
    .slice(
      SUBAGENT_TASK_CAPTURE_START.length,
      message.length - SUBAGENT_TASK_CAPTURE_END.length,
    )
    .trim();
  return task || null;
}

export function readSubagentTaskCapture(
  message: CodexMessage,
): Omit<SubagentTaskCapture, "createdAt"> | null {
  if (message.method !== "item/started" && message.method !== "item/completed") {
    return null;
  }
  const item = readRecord(readRecord(message.params).item);
  if (item.type !== "agentMessage" || item.delivery === "async") return null;
  const itemId = readString(item.id);
  const text = readString(item.text);
  const task = text ? parseSubagentTaskCapture(text) : null;
  return itemId && task ? { itemId, text: task } : null;
}

export function removeSubagentTaskCaptures(
  transcript: SubagentTranscript,
) {
  const captures: SubagentTaskCapture[] = [];
  let changed = false;
  let captureEligible = true;
  const turns = transcript.turns.map((turn) => {
    const items = turn.items.filter((item) => {
      if (item.kind === "assistant") {
        const task = parseSubagentTaskCapture(item.text);
        if (task) {
          if (captureEligible && captures.length === 0) {
            captures.push({
              itemId: item.id,
              text: task,
              createdAt: turn.startedAt,
            });
          }
          changed = true;
          return false;
        }
      }
      if (item.kind !== "reasoning") captureEligible = false;
      return true;
    });
    return items.length === turn.items.length ? turn : { ...turn, items };
  });
  return {
    transcript: changed ? { ...transcript, turns } : transcript,
    captures,
  };
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
    case "followup_task":
    case "send_message":
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

export function lifecycleFromSubagentTranscript(
  transcript: SubagentTranscript,
): SubagentLifecycleStatus | null {
  if (transcript.activeTurnId) return "running";
  const latestTurn = transcript.turns[transcript.turns.length - 1];
  const turnStatus = normalizeAgentStatus(latestTurn?.status ?? null);
  if (turnStatus && !isActiveSubagentStatus(turnStatus)) return turnStatus;
  const threadStatus = normalizeAgentStatus(transcript.status);
  return threadStatus && !isActiveSubagentStatus(threadStatus)
    ? threadStatus
    : null;
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
    case "followupTask":
    case "followup_task":
      return "followup_task";
    case "sendMessage":
    case "send_message":
      return "send_message";
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
