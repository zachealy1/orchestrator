import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  CodexMessage,
  CodexProcessEvent,
  CodexProfileKey,
} from "./types";
import type { BrowserSessionState } from "../browser/types";

type CodexMessageRoute = {
  accountId: number;
  profileKey: CodexProfileKey;
  message: CodexMessage;
  requestToken: string | null;
};

export type CodexEventHandlers = {
  onNotification: (route: CodexMessageRoute) => void | Promise<void>;
  onServerRequest: (route: CodexMessageRoute) => void | Promise<void>;
  onProcess: (event: CodexProcessEvent) => void | Promise<void>;
  onBrowserSession: (state: BrowserSessionState) => void | Promise<void>;
  onMalformedEvent?: (eventName: string) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readProfileKey(
  profileKey: unknown,
  accountId: number,
): CodexProfileKey {
  return typeof profileKey === "string" && profileKey.length > 0
    ? (profileKey as CodexProfileKey)
    : (`account:${accountId}` as CodexProfileKey);
}

function parseMessageRoute(value: unknown): CodexMessageRoute | null {
  if (!isRecord(value) || typeof value.accountId !== "number") return null;
  if (!isRecord(value.message)) return null;
  const method = value.message.method;
  if (typeof method !== "string" || method.length === 0) {
    return null;
  }
  return {
    accountId: value.accountId,
    profileKey: readProfileKey(value.profileKey, value.accountId),
    message: value.message as CodexMessage,
    requestToken:
      typeof value.requestToken === "string" ? value.requestToken : null,
  };
}

function parseProcessEvent(value: unknown): CodexProcessEvent | null {
  if (
    !isRecord(value) ||
    typeof value.accountId !== "number" ||
    typeof value.status !== "string" ||
    typeof value.message !== "string"
  ) {
    return null;
  }
  return {
    ...value,
    profileKey: readProfileKey(value.profileKey, value.accountId),
  } as CodexProcessEvent;
}

function parseBrowserSession(value: unknown): BrowserSessionState | null {
  const validStatuses = new Set([
    "prepared",
    "ready",
    "starting",
    "running",
    "awaiting-approval",
    "stopping",
    "stopped",
    "error",
  ]);
  if (
    !isRecord(value) ||
    typeof value.token !== "string" ||
    !validStatuses.has(String(value.status)) ||
    !isRecord(value.target)
  ) {
    return null;
  }
  const target = value.target;
  const profileKey = target.profileKey;
  const accessMode = target.accessMode;
  if (
    (profileKey !== "default" &&
      !(typeof profileKey === "string" && /^account:\d+$/.test(profileKey))) ||
    typeof target.workspaceId !== "number" ||
    !Number.isFinite(target.workspaceId) ||
    target.workspaceId <= 0 ||
    (target.chatId !== null && typeof target.chatId !== "number") ||
    (target.runId !== null && typeof target.runId !== "number") ||
    typeof target.entryId !== "string" ||
    target.entryId.length === 0 ||
    (target.threadId !== null && typeof target.threadId !== "string") ||
    (target.turnId !== null && typeof target.turnId !== "string") ||
    (accessMode !== "ask-for-approval" && accessMode !== "full-access") ||
    (value.browserPid !== null && typeof value.browserPid !== "number") ||
    (value.error !== null && typeof value.error !== "string")
  ) {
    return null;
  }
  return value as unknown as BrowserSessionState;
}

export class CodexEventRouter {
  private generation = 0;
  private activeUnlisteners: UnlistenFn[] = [];

  async subscribe(handlers: CodexEventHandlers): Promise<() => void> {
    this.dispose();
    const generation = ++this.generation;
    const register = async <T>(
      eventName: string,
      parse: (value: unknown) => T | null,
      handle: (value: T) => void | Promise<void>,
    ) => {
      const unlisten = await listen<unknown>(eventName, (event) => {
        if (generation !== this.generation) return;
        const parsed = parse(event.payload);
        if (!parsed) {
          handlers.onMalformedEvent?.(eventName);
          return;
        }
        void handle(parsed);
      });
      if (generation !== this.generation) unlisten();
      else this.activeUnlisteners.push(unlisten);
    };

    await Promise.all([
      register(
        "codex:notification",
        parseMessageRoute,
        handlers.onNotification,
      ),
      register(
        "codex:server-request",
        parseMessageRoute,
        handlers.onServerRequest,
      ),
      register("codex:process", parseProcessEvent, handlers.onProcess),
      register(
        "orchestrator:browser-session",
        parseBrowserSession,
        handlers.onBrowserSession,
      ),
    ]);

    return () => {
      if (generation === this.generation) this.dispose();
    };
  }

  dispose() {
    this.generation += 1;
    this.activeUnlisteners.splice(0).forEach((unlisten) => unlisten());
  }
}

export const codexEventValidation = {
  parseMessageRoute,
  parseProcessEvent,
  parseBrowserSession,
};
