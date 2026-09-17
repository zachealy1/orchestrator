import {
  asyncMessageFields, asyncQuestions, asyncQuestionScope, asyncReplyFromItem,
  encodeAsyncReplies, object, type AsyncQuestion, type AsyncReply,
} from "../../lib/asyncUserInput";
import { createStableClientMessageId } from "../../lib/nativePlanMode";
import { recordAsyncReply } from "../../lib/codexEventReducer";
import { createAgentNotificationEventKey, type AgentNotificationTarget } from "../../lib/agentNotifications";
import type { ActiveRunControl } from "../runs/runtimeTypes";
import type { CodexMessage, CodexProfileKey } from "../codex/types";

export type QuestionTarget = {
  profileKey: CodexProfileKey; accountId: number; threadId: string; turnId: string;
  entryClientId: string; workspaceId: number; chatId: number | null; runId: number | null;
  subagentThreadId: string | null;
};
export type QuestionDraft = AsyncQuestion & { draft: string; draftBaseline: string; lastSubmission: string | null; skipped: boolean };
export type QuestionGroup = {
  key: string; target: QuestionTarget; questions: QuestionDraft[]; active: boolean;
  selectedId: string | null; pageIds: string[]; deadline: number | null;
  submitting: boolean; error: string | null;
};
export type AsyncQuestionDependencies = {
  findControl: (target: QuestionTarget) => ActiveRunControl | null;
  isActive: (target: QuestionTarget, control: ActiveRunControl) => boolean;
  steer: (target: QuestionTarget, params: Record<string, unknown>) => Promise<unknown>;
  persist: (control: ActiveRunControl, message: CodexMessage) => Promise<unknown>;
  updateView: (control: ActiveRunControl, updater: (view: ActiveRunControl["runView"]) => ActiveRunControl["runView"]) => unknown;
  notify: (target: AgentNotificationTarget, title: string) => Promise<unknown>;
  removeNotification: (key: string) => Promise<unknown>;
  reportError: (message: string) => void;
};

/** App-owned state survives transcript unmounts; no timers or drafts live in rows. */
export class AsyncQuestionController {
  private groups = new Map<string, QuestionGroup>();
  private listeners = new Set<() => void>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private accepted = new Map<string, Set<string>>();
  private attempts = new Map<string, { text: string; clientId: string }>();
  private version = 0;
  constructor(private deps: () => AsyncQuestionDependencies) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.version;
  list = () => [...this.groups.values()];
  get = (key: string) => this.groups.get(key);
  private publish() { this.version++; this.listeners.forEach(fn => fn()); }
  private cancelTimer(key: string) {
    clearTimeout(this.timers.get(key)); this.timers.delete(key);
    const group = this.get(key); if (group) group.deadline = null;
  }
  private notification(group: QuestionGroup, id: string): AgentNotificationTarget {
    const t = group.target;
    return { ...t, requestId: id, planItemId: null, kind: "user-input-required",
      eventKey: createAgentNotificationEventKey("user-input-required", t.profileKey, t.threadId, t.turnId, id),
    };
  }
  private clearNotifications(group: QuestionGroup, ids = group.questions.map(q => q.id)) {
    for (const id of ids) void this.deps().removeNotification(this.notification(group, id).eventKey).catch(() => undefined);
  }
  observe(control: ActiveRunControl, message: CodexMessage) {
    const params = object(message.params), item = object(params.item), turn = object(params.turn);
    const threadId = typeof params.threadId === "string" ? params.threadId : control.threadId;
    const turnId = typeof params.turnId === "string" ? params.turnId : typeof turn.id === "string" ? turn.id : control.turnId;
    if (!threadId || !turnId) return;
    const key = asyncQuestionScope(control.profileKey, threadId, turnId);
    if (message.method === "turn/completed" || message.method === "turn/interrupted") {
      this.close(key); return;
    }
    if (message.method !== "item/completed" && message.method !== "item/started") return;
    const reply = asyncReplyFromItem(item);
    if (reply) {
      this.acceptReply(key, reply);
      if (threadId !== control.threadId) void this.persist(control, message);
      return;
    }
    // Wait for the complete payload, rather than opening a partial streamed title.
    if (message.method !== "item/completed" || item.type !== "agentMessage" || item.delivery !== "async" || typeof item.id !== "string") return;
    const questions = asyncQuestions(item.id, { text: typeof item.text === "string" ? item.text : "", ...asyncMessageFields(item) });
    if (!questions.length) return;
    let group = this.get(key);
    if (!group) {
      group = { key, target: { profileKey: control.profileKey, accountId: control.accountId,
        threadId, turnId, entryClientId: control.clientId, workspaceId: control.workspaceId,
        chatId: control.chatId, runId: control.runId, subagentThreadId: threadId !== control.threadId ? threadId : null },
        questions: [], active: true, selectedId: null, pageIds: [], deadline: null, submitting: false, error: null };
      if (!this.deps().isActive(group.target, control)) return;
      this.groups.set(key, group);
    }
    if (!group.active) return;
    const added = questions.filter(q => !group.questions.some(existing => existing.id === q.id));
    if (!added.length) return;
    group.questions.push(...added.map(q => ({ ...q, draft: q.options[0] ?? "", draftBaseline: q.options[0] ?? "", lastSubmission: null, skipped: false })));
    const shouldTime = group.selectedId === null || group.deadline !== null;
    group.pageIds.push(...added.map(q => q.id));
    group.selectedId ??= added[0].id;
    if (shouldTime) {
      this.cancelTimer(key); group.deadline = Date.now() + 30_000;
      this.timers.set(key, setTimeout(() => this.minimize(key), 30_000));
    }
    for (const q of added) void this.deps().notify(this.notification(group, q.id), q.title).catch(() => undefined);
    if (threadId !== control.threadId) void this.persist(control, message);
    this.publish();
  }
  private async persist(control: ActiveRunControl, message: CodexMessage) {
    try { await this.deps().persist(control, message); }
    catch { this.deps().reportError("Could not save the Codex question event."); }
  }
  private acceptReply(key: string, reply: NonNullable<ReturnType<typeof asyncReplyFromItem>>) {
    const group = this.get(key); if (!group) return;
    const seen = this.accepted.get(key) ?? new Set<string>();
    const ids = [reply.id, reply.clientId, reply.serverId].filter((id): id is string => !!id);
    const duplicate = ids.some(id => seen.has(id)) || (!reply.clientId && seen.has(`text:${reply.text}`));
    seen.add(`text:${reply.text}`);
    ids.forEach(id => seen.add(id)); this.accepted.set(key, seen);
    if (duplicate) return;
    for (const answer of reply.replies) {
      const q = group.questions.find(q => q.id === answer.questionItemId);
      if (!q) continue;
      if (q.draft === q.draftBaseline) q.draft = answer.answer;
      q.lastSubmission = answer.answer; q.draftBaseline = answer.answer;
    }
    this.clearNotifications(group, reply.replies.map(r => r.questionItemId)); this.publish();
  }
  interact(key: string) { this.cancelTimer(key); this.publish(); }
  edit(key: string, id: string, text: string) {
    const q = this.get(key)?.questions.find(q => q.id === id); if (!q) return;
    q.draft = text; this.interact(key);
  }
  open(key: string, id: string) {
    const group = this.get(key); if (!group?.active || !group.questions.some(q => q.id === id)) return;
    group.selectedId = id; group.pageIds = [id]; group.error = null; this.interact(key);
  }
  select(key: string, id: string) {
    const group = this.get(key); if (!group?.pageIds.includes(id)) return;
    group.selectedId = id; this.interact(key);
  }
  minimize(key: string) {
    const group = this.get(key); if (!group) return;
    group.selectedId = null; group.pageIds = []; this.cancelTimer(key); this.publish();
  }
  skip(key: string) {
    const group = this.get(key); if (!group || group.submitting) return;
    const id = group.selectedId, q = group.questions.find(q => q.id === id);
    if (q) { q.skipped = true; this.clearNotifications(group, [q.id]); }
    group.pageIds = group.pageIds.filter(candidate => candidate !== id);
    group.selectedId = group.pageIds[0] ?? null; this.interact(key);
  }
  close(key: string) {
    const group = this.get(key); if (!group) return;
    group.active = false; group.submitting = false; this.clearNotifications(group); this.minimize(key);
    // Retain a bounded history for workspace navigation; durable answers live in run events.
    const closed = this.list().filter(g => !g.active);
    for (const old of closed.slice(0, Math.max(0, closed.length - 100))) { this.groups.delete(old.key); this.accepted.delete(old.key); this.attempts.delete(old.key); }
  }
  async submit(key: string) {
    const group = this.get(key); if (!group?.active || group.submitting || !group.selectedId) return;
    this.cancelTimer(key);
    const index = group.pageIds.indexOf(group.selectedId);
    if (index < group.pageIds.length - 1) { this.select(key, group.pageIds[index + 1]); return; }
    const submittedDrafts = new Map(group.pageIds.map(id => [id, group.questions.find(q => q.id === id)?.draft.trim()]));
    const replies: AsyncReply[] = group.pageIds.flatMap(id => {
      const q = group.questions.find(q => q.id === id);
      return q?.draft.trim() ? [{ questionItemId: id, question: q.title, answer: q.draft.trim() }] : [];
    });
    if (!replies.length) return;
    const deps = this.deps(), control = deps.findControl(group.target);
    if (!control || !deps.isActive(group.target, control)) { this.close(key); return; }
    group.submitting = true; group.error = null; this.publish();
    const text = encodeAsyncReplies(replies);
    const previous = this.attempts.get(key);
    const clientId = previous?.text === text ? previous.clientId : createStableClientMessageId();
    this.attempts.set(key, { text, clientId });
    try {
      await deps.steer(group.target, { threadId: group.target.threadId, expectedTurnId: group.target.turnId,
        clientUserMessageId: clientId, input: [{ type: "text", text, text_elements: [] }] });
      const message: CodexMessage = { method: "item/completed", params: { threadId: group.target.threadId,
        turnId: group.target.turnId, item: { type: "userMessage", id: clientId, clientId,
          content: [{ type: "text", text }] } } };
      this.acceptReply(key, asyncReplyFromItem(object(message.params).item)!);
      if (!group.target.subagentThreadId && control.turnId === group.target.turnId) {
        deps.updateView(control, view => recordAsyncReply(view, object(message.params).item));
      }
      await this.persist(control, message);
      this.attempts.delete(key);
      // Do not discard edits made while the RPC was pending.
      group.pageIds = group.pageIds.filter(id => !submittedDrafts.has(id) ||
        group.questions.find(q => q.id === id)?.draft.trim() !== submittedDrafts.get(id));
      group.selectedId = group.pageIds[0] ?? null;
    } catch (error) {
      if (group.active) group.error = `Could not send response: ${error instanceof Error ? error.message : String(error)}`;
    } finally { group.submitting = false; this.publish(); }
  }
  reconcile() {
    for (const group of this.groups.values()) {
      if (!group.active) continue;
      const control = this.deps().findControl(group.target);
      if (!control || !this.deps().isActive(group.target, control)) this.close(group.key);
    }
  }
  dispose() {
    this.timers.forEach(clearTimeout); this.timers.clear();
    this.groups.clear(); this.accepted.clear(); this.attempts.clear(); this.listeners.clear();
  }
}
