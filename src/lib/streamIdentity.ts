import type { CodexMessage } from "../features/codex/types";

export type StreamTextTarget =
  | "agentMessage"
  | "plan"
  | "reasoningSummary"
  | "reasoningContent"
  | "commandOutput";
export type StreamIdentity = {
  profileKey?: string;
  threadId: string | null;
  turnId: string | null;
  itemId: string;
  target: StreamTextTarget;
  partIndex?: number;
};

export function streamRunKey(profileKey: string, message: CodexMessage) {
  const params = message.params ?? {};
  const thread = params.thread as { id?: string } | undefined;
  return JSON.stringify([profileKey, params.threadId ?? thread?.id ?? null]);
}

export function streamIdentity(
  message: CodexMessage,
  profileKey?: string,
): StreamIdentity {
  const params = message.params ?? {};
  const item = params.item as { id?: string } | undefined;
  const method = message.method ?? "";
  const target: StreamTextTarget = method.includes("reasoning/summary")
    ? "reasoningSummary"
    : method.includes("reasoning/text")
      ? "reasoningContent"
      : method.includes("agentMessage")
        ? "agentMessage"
        : method.includes("plan/delta")
          ? "plan"
          : "commandOutput";
  return {
    profileKey,
    threadId: typeof params.threadId === "string" ? params.threadId : null,
    turnId: typeof params.turnId === "string" ? params.turnId : null,
    itemId: String(
      params.itemId ??
        item?.id ??
        params.commandId ??
        params.processId ??
        params.callId ??
        "__legacy__",
    ),
    target,
    ...(target === "reasoningSummary" || target === "reasoningContent"
      ? { partIndex: Number(params.summaryIndex ?? params.contentIndex ?? 0) }
      : {}),
  };
}

export function streamIdentityKey(identity: StreamIdentity) {
  return JSON.stringify([
    identity.profileKey,
    identity.threadId,
    identity.turnId,
    identity.itemId,
    identity.target,
    identity.partIndex,
  ]);
}
