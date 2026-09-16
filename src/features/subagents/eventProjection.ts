import type { CodexMessage } from "../codex/types";
import { readObject, readString } from "../../shared/valueReaders";

export function readCodexMessageRunIdentity(message: CodexMessage) {
  const params = readObject(message.params);
  return {
    threadId: readString(params.threadId) ?? readString(readObject(params.thread).id),
    turnId: readString(params.turnId) ?? readString(readObject(params.turn).id),
  };
}

export function readSubagentTurnStatus(message: CodexMessage) {
  const params = readObject(message.params);
  const turn = readObject(params.turn);
  return readString(turn.status) ?? readString(params.status);
}

export function readSubagentVisibleResult(message: CodexMessage) {
  if (message.method !== "item/completed") return null;
  const item = readObject(readObject(message.params).item);
  if (readString(item.type) !== "agentMessage" || item.delivery === "async") return null;
  const phase = readString(item.phase);
  if (phase && phase !== "final_answer") return null;
  const text =
    readString(item.text) ??
    readString(item.content) ??
    (Array.isArray(item.content)
      ? item.content
          .map((part) =>
            typeof part === "string" ? part : readString(readObject(part).text) ?? "",
          )
          .filter(Boolean)
          .join("\n")
      : null);
  return text?.trim() || null;
}

export function readSubagentError(message: CodexMessage) {
  const params = readObject(message.params);
  const turn = readObject(params.turn);
  const error = params.error ?? turn.error;
  if (typeof error === "string") return error;
  const record = readObject(error);
  return (
    readString(record.message) ??
    readString(record.error) ??
    (Object.keys(record).length > 0 ? JSON.stringify(record) : null)
  );
}
