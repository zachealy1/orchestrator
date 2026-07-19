export const AGENT_NOTIFICATION_PREFERENCES_KEY =
  "orchestrator.agent-notifications.v1";
export const AGENT_NOTIFICATION_LEDGER_KEY =
  "orchestrator.agent-notification-events.v1";
export const AGENT_NOTIFICATION_LEDGER_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const AGENT_NOTIFICATION_LEDGER_LIMIT = 400;

export type AgentNotificationKind =
  | "response-completed"
  | "approval-required"
  | "plan-ready"
  | "external-action";

export type AgentNotificationPermissionStatus =
  | "allowed"
  | "not-enabled"
  | "denied"
  | "unavailable";

export type AgentNotificationPreferences = {
  responseCompleted: boolean;
  approvalRequired: boolean;
  planReady: boolean;
  externalAction: boolean;
};

export type AgentNotificationTarget = {
  eventKey: string;
  kind: AgentNotificationKind;
  workspaceId?: number | null;
  chatId?: number | null;
  runId?: number | null;
  entryClientId?: string | null;
  requestId?: string | null;
  planItemId?: string | null;
  accountId?: number | null;
  profileKey?: string | null;
  threadId?: string | null;
  turnId?: string | null;
};

export type AgentNotificationRequest = {
  title: string;
  body: string;
  groupKey?: string | null;
  target: AgentNotificationTarget;
};

export type AgentNotificationSendResult = {
  delivered: boolean;
  notificationId: string | null;
  permissionStatus: AgentNotificationPermissionStatus;
};

export const DEFAULT_AGENT_NOTIFICATION_PREFERENCES: AgentNotificationPreferences = {
  responseCompleted: true,
  approvalRequired: true,
  planReady: true,
  externalAction: true,
};

type NotificationLedgerEntry = {
  eventKey: string;
  deliveredAt: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function validateAgentNotificationPreferences(
  value: unknown,
): AgentNotificationPreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_AGENT_NOTIFICATION_PREFERENCES };
  }
  const record = value as Record<string, unknown>;
  return {
    responseCompleted: isBoolean(record.responseCompleted)
      ? record.responseCompleted
      : true,
    approvalRequired: isBoolean(record.approvalRequired)
      ? record.approvalRequired
      : true,
    planReady: isBoolean(record.planReady) ? record.planReady : true,
    externalAction: isBoolean(record.externalAction)
      ? record.externalAction
      : true,
  };
}

export function readAgentNotificationPreferences(
  storage: StorageLike | null = defaultStorage(),
) {
  if (!storage) return { ...DEFAULT_AGENT_NOTIFICATION_PREFERENCES };
  try {
    const stored = storage.getItem(AGENT_NOTIFICATION_PREFERENCES_KEY);
    return stored
      ? validateAgentNotificationPreferences(JSON.parse(stored))
      : { ...DEFAULT_AGENT_NOTIFICATION_PREFERENCES };
  } catch {
    return { ...DEFAULT_AGENT_NOTIFICATION_PREFERENCES };
  }
}

export function persistAgentNotificationPreferences(
  preferences: AgentNotificationPreferences,
  storage: StorageLike | null = defaultStorage(),
) {
  storage?.setItem(
    AGENT_NOTIFICATION_PREFERENCES_KEY,
    JSON.stringify(validateAgentNotificationPreferences(preferences)),
  );
}

export function notificationPreferenceEnabled(
  preferences: AgentNotificationPreferences,
  kind: AgentNotificationKind,
) {
  switch (kind) {
    case "response-completed":
      return preferences.responseCompleted;
    case "approval-required":
      return preferences.approvalRequired;
    case "plan-ready":
      return preferences.planReady;
    case "external-action":
      return preferences.externalAction;
  }
}

export function shouldSendAgentNotification(input: {
  kind: AgentNotificationKind;
  preferences: AgentNotificationPreferences;
  permissionStatus: AgentNotificationPermissionStatus;
  appFocused: boolean;
  appVisible: boolean;
  targetVisible: boolean;
}) {
  if (
    input.permissionStatus !== "allowed" ||
    !notificationPreferenceEnabled(input.preferences, input.kind)
  ) {
    return false;
  }
  if (input.kind === "response-completed") {
    return !input.appFocused || !input.appVisible;
  }
  return !(input.appFocused && input.appVisible && input.targetVisible);
}

function compactLabel(value: string | null | undefined, fallback: string) {
  const normalized = value?.replace(/\s+/g, " ").trim() || fallback;
  return normalized.length <= 72 ? normalized : `${normalized.slice(0, 69)}...`;
}

export function buildSafeAgentNotificationCopy(input: {
  kind: AgentNotificationKind;
  chatTitle?: string | null;
  workspaceLabel?: string | null;
  accountLabel?: string | null;
}) {
  const conversation = compactLabel(
    input.chatTitle,
    compactLabel(input.workspaceLabel, "Your Codex task"),
  );
  switch (input.kind) {
    case "response-completed":
      return {
        title: "Response complete",
        body: `${conversation} is ready to review.`,
      };
    case "approval-required":
      return {
        title: "Approval required",
        body: `${conversation} needs approval before Codex can continue.`,
      };
    case "plan-ready":
      return {
        title: "Plan ready",
        body: `${conversation} has a plan ready to review.`,
      };
    case "external-action":
      return {
        title: "Action required",
        body: `Finish signing in to Codex for ${compactLabel(
          input.accountLabel,
          "this account",
        )}. Open Orchestrator to continue.`,
      };
  }
}

export function createAgentNotificationEventKey(
  kind: AgentNotificationKind,
  ...parts: Array<string | number | null | undefined>
) {
  return [kind, ...parts.map((part) => String(part ?? "unknown"))].join(":");
}

function readNotificationLedger(
  storage: StorageLike | null,
  now: number,
): NotificationLedgerEntry[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(
      storage.getItem(AGENT_NOTIFICATION_LEDGER_KEY) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is NotificationLedgerEntry =>
          Boolean(entry) &&
          typeof entry.eventKey === "string" &&
          typeof entry.deliveredAt === "number" &&
          now - entry.deliveredAt <= AGENT_NOTIFICATION_LEDGER_TTL_MS,
      )
      .slice(-AGENT_NOTIFICATION_LEDGER_LIMIT);
  } catch {
    return [];
  }
}

export function wasAgentNotificationDelivered(
  eventKey: string,
  storage: StorageLike | null = defaultStorage(),
  now = Date.now(),
) {
  return readNotificationLedger(storage, now).some(
    (entry) => entry.eventKey === eventKey,
  );
}

export function recordAgentNotificationDelivered(
  eventKey: string,
  storage: StorageLike | null = defaultStorage(),
  now = Date.now(),
) {
  if (!storage) return;
  const entries = readNotificationLedger(storage, now).filter(
    (entry) => entry.eventKey !== eventKey,
  );
  entries.push({ eventKey, deliveredAt: now });
  storage.setItem(
    AGENT_NOTIFICATION_LEDGER_KEY,
    JSON.stringify(entries.slice(-AGENT_NOTIFICATION_LEDGER_LIMIT)),
  );
}

export function isAgentNotificationTargetNavigable(
  target: AgentNotificationTarget,
) {
  if (target.kind === "external-action") {
    return typeof target.accountId === "number";
  }
  return (
    typeof target.workspaceId === "number" &&
    (typeof target.chatId === "number" || Boolean(target.entryClientId))
  );
}
