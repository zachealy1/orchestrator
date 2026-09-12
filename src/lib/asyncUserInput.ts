/** Codex's native, non-blocking question/reply protocol. */
export type AsyncQuestion = { id: string; sourceItemId: string; title: string; options: string[] };
export type AsyncReply = { questionItemId: string; question: string; answer: string };
export type AsyncAgentMessage = {
  text: string;
  delivery?: "async";
  questions?: Array<{ title: string; options?: string[] }>;
  threadId?: string;
  turnId?: string;
};
const START = "<send_user_message_question_reply>";
const END = "</send_user_message_question_reply>";
export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
export function asyncMessageFields(item: Record<string, unknown>): Partial<AsyncAgentMessage> {
  if (item.delivery !== "async") return {};
  const questions = Array.isArray(item.questions) ? item.questions : null;
  // A malformed structured question must not silently become a different question.
  if (questions?.some((value) => {
    const q = object(value);
    return typeof q.title !== "string" || !q.title.trim() ||
      (q.options != null && (!Array.isArray(q.options) || !q.options.length ||
        q.options.some((v: unknown) => typeof v !== "string" || !v.trim())));
  })) return { delivery: "async", questions: [] };
  return { delivery: "async", ...(questions?.length ? { questions: questions as NonNullable<AsyncAgentMessage["questions"]> } : {}) };
}
export function asyncQuestions(id: string, message: AsyncAgentMessage): AsyncQuestion[] {
  if (message.delivery !== "async") return [];
  return message.questions
    ? message.questions.map((q, index) => ({
        id: JSON.stringify(["request_user_input_async", id, index]),
        sourceItemId: id, title: q.title, options: q.options ?? [],
      }))
    : message.text.trim() ? [{ id, sourceItemId: id, title: message.text, options: [] }] : [];
}
export function encodeAsyncReplies(replies: AsyncReply[]) {
  return `${START}\n${JSON.stringify(replies)}\n${END}`;
}
export function parseAsyncReplies(text: string): AsyncReply[] | null {
  const value = text.trim();
  if (!value.startsWith(START) || !value.endsWith(END)) return null;
  try {
    const parsed: unknown = JSON.parse(value.slice(START.length, -END.length));
    const replies = Array.isArray(parsed) ? parsed : [parsed];
    return replies.length && replies.every((reply) => {
      const r = object(reply);
      return [r.questionItemId, r.question, r.answer].every(v => typeof v === "string");
    }) ? replies as AsyncReply[] : null;
  } catch { return null; }
}
export function readableAsyncReply(text: string) {
  return parseAsyncReplies(text)?.map(r => `${r.question}\n${r.answer}`).join("\n\n") ?? text;
}
export function asyncReplyFromItem(value: unknown) {
  const item = object(value);
  if (item.type !== "userMessage" && item.type !== "steeringUserMessage") return null;
  if (item.type === "steeringUserMessage" && item.status !== "accepted") return null;
  const input = item.type === "userMessage" ? item.content : item.input;
  if (!Array.isArray(input) || input.length !== 1) return null;
  const text = object(input[0]).text;
  if (typeof text !== "string") return null;
  const replies = parseAsyncReplies(text);
  return replies ? { replies, text,
    id: String(item.id ?? ""),
    clientId: typeof (item.clientId ?? item.clientUserMessageId) === "string" ? String(item.clientId ?? item.clientUserMessageId) : null,
    serverId: typeof item.serverUserMessageId === "string" ? item.serverUserMessageId : null,
  } : null;
}
export function asyncQuestionScope(profile: string, threadId: string, turnId: string) {
  return JSON.stringify([profile, threadId, turnId]);
}
