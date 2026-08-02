import type { CodexMessage } from "../features/codex/types";

const FRAME_BATCHED_METHODS = new Set([
  "item/agentMessage/delta",
  "item/plan/delta",
  "item/reasoning/summaryTextDelta",
  "item/reasoning/textDelta",
  "item/commandExecution/outputDelta",
  "command/exec/outputDelta",
  "process/outputDelta",
]);

export function shouldFrameBatchCodexMessage(message: CodexMessage) {
  return Boolean(message.method && FRAME_BATCHED_METHODS.has(message.method));
}

export function coalesceFrameBatchedCodexMessages(
  messages: CodexMessage[],
) {
  const coalesced: CodexMessage[] = [];

  for (const message of messages) {
    const previous = coalesced[coalesced.length - 1];
    if (!previous || !canMergeDeltaMessages(previous, message)) {
      coalesced.push(message);
      continue;
    }

    const previousParams = previous.params ?? {};
    const nextParams = message.params ?? {};
    coalesced[coalesced.length - 1] = {
      ...previous,
      ...message,
      params: {
        ...previousParams,
        ...nextParams,
        delta: `${String(previousParams.delta ?? "")}${String(nextParams.delta ?? "")}`,
      },
    };
  }

  return coalesced;
}

function canMergeDeltaMessages(left: CodexMessage, right: CodexMessage) {
  if (
    left.method !== right.method ||
    !shouldFrameBatchCodexMessage(left) ||
    typeof left.params?.delta !== "string" ||
    typeof right.params?.delta !== "string"
  ) {
    return false;
  }

  return streamIdentity(left.params) === streamIdentity(right.params);
}

function streamIdentity(params: Record<string, unknown>) {
  const item = readObject(params.item);
  return [
    params.threadId,
    params.turnId,
    params.itemId ?? item.id,
    params.commandId,
    params.processId,
    params.callId,
  ]
    .map((value) => (value === undefined || value === null ? "" : String(value)))
    .join(":");
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}
