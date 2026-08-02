import { parseThreadTokenUsage } from "../../lib/contextUsage";
import type {
  AccountLoginCompletedNotification,
  AccountUpdatedNotification,
  CodexModel,
  CodexProfileKey,
} from "./types";
import { readArray, readNumber, readObject, readString } from "../../shared/valueReaders";

export function formatMcpStatus(payload: unknown) {
  const root = readObject(payload);
  const servers =
    readArray(payload).length > 0
      ? readArray(payload)
      : readArray(root.servers).length > 0
        ? readArray(root.servers)
        : readArray(root.data).length > 0
          ? readArray(root.data)
          : readArray(root.items);
  if (servers.length === 0) return "MCP: no servers reported by Codex.";
  const names = servers
    .map((server) => {
      const object = readObject(server);
      return readString(object.name) ?? readString(object.id) ?? readString(object.label);
    })
    .filter((name): name is string => Boolean(name))
    .slice(0, 4);
  const suffix = names.length
    ? ` (${names.join(", ")}${servers.length > names.length ? ", ..." : ""})`
    : "";
  return `MCP: ${servers.length} server${servers.length === 1 ? "" : "s"} available${suffix}.`;
}

export function getCodexModelContextWindow(model: CodexModel | null) {
  return (
    [model?.modelContextWindow, model?.contextWindow, model?.contextWindowTokens].find(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value > 0,
    ) ?? null
  );
}

export function accountIdFromProfileKey(
  profileKey: CodexProfileKey | null | undefined,
) {
  if (!profileKey?.startsWith("account:")) return null;
  const accountId = Number(profileKey.slice("account:".length));
  return Number.isFinite(accountId) && accountId > 0 ? accountId : null;
}

export function readAccountLoginCompleted(
  params: Record<string, unknown>,
): AccountLoginCompletedNotification {
  return {
    success: params.success === true,
    error: readString(params.error),
    loginId: readString(params.loginId),
  };
}

export function readAccountUpdated(
  params: Record<string, unknown>,
): AccountUpdatedNotification {
  return {
    authMode: readString(params.authMode) as AccountUpdatedNotification["authMode"],
    planType: readString(params.planType) as AccountUpdatedNotification["planType"],
  };
}

export function readTokenUsage(params: Record<string, unknown>) {
  return parseThreadTokenUsage(params.tokenUsage);
}

export function isCodexThreadNotFoundError(error: unknown) {
  const root = readObject(error);
  const directMessage = readString(root.message);
  const directCode = readNumber(root.code);
  if (
    directCode === -32600 &&
    directMessage?.toLowerCase().includes("thread not found")
  ) return true;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : directMessage;
  if (!message) return false;
  try {
    const parsedObject = readObject(JSON.parse(message));
    return (
      readNumber(parsedObject.code) === -32600 &&
      Boolean(readString(parsedObject.message)?.toLowerCase().includes("thread not found"))
    );
  } catch {
    return message.toLowerCase().includes("thread not found");
  }
}

export function readExpectedActiveTurnId(error: unknown) {
  return (
    readCodexRpcErrorMessage(error).match(
      /expected active turn id\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    )?.[1] ?? null
  );
}

export function isCodexTurnAlreadyTerminalError(error: unknown) {
  const message = readCodexRpcErrorMessage(error).toLowerCase();
  return [
    "no active turn",
    "turn is not active",
    "turn not active",
    "turn already completed",
    "turn already interrupted",
  ].some((fragment) => message.includes(fragment));
}

export function readCodexRpcErrorMessage(error: unknown) {
  const root = readObject(error);
  const directMessage = readString(root.message);
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : directMessage ?? "";
  try {
    return readString(readObject(JSON.parse(message)).message) ?? message;
  } catch {
    return message;
  }
}
