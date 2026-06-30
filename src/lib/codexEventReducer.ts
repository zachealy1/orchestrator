import type { CodexMessage } from "../types";

export type TokenUsage = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  modelContextWindow: number | null;
};

export type ConsoleLine = {
  id: string;
  kind: "assistant" | "command" | "reasoning" | "system" | "subagent";
  text: string;
};

export type StreamEvent = {
  id: string;
  kind: "message" | "activity" | "command" | "file" | "reasoning" | "system";
  text: string;
  timestamp: string;
};

export type RunViewState = {
  status: "idle" | "connecting" | "running" | "completed" | "failed" | "interrupted";
  threadId: string | null;
  turnId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  elapsedMs: number;
  console: ConsoleLine[];
  streamEvents: StreamEvent[];
  latestPlan: string;
  latestDiff: string;
  finalMessage: string;
  error: string | null;
  tokenUsage: TokenUsage | null;
  serverRequests: CodexMessage[];
};

export const emptyRunView: RunViewState = {
  status: "idle",
  threadId: null,
  turnId: null,
  startedAt: null,
  completedAt: null,
  elapsedMs: 0,
  console: [],
  streamEvents: [],
  latestPlan: "",
  latestDiff: "",
  finalMessage: "",
  error: null,
  tokenUsage: null,
  serverRequests: [],
};

export function applyCodexMessage(
  state: RunViewState,
  message: CodexMessage,
): RunViewState {
  const method = message.method;
  const params = (message.params ?? {}) as Record<string, unknown>;

  switch (method) {
    case "thread/started": {
      const thread = readObject(params.thread);
      return {
        ...state,
        threadId: readString(thread.id) ?? state.threadId,
        status: "running",
      };
    }
    case "turn/started": {
      const turn = readObject(params.turn);
      return {
        ...state,
        turnId: readString(turn.id) ?? state.turnId,
        status: "running",
      };
    }
    case "thread/tokenUsage/updated": {
      const usage = readObject(params.tokenUsage);
      const total = readObject(usage.total);
      return {
        ...state,
        threadId: readString(params.threadId) ?? state.threadId,
        turnId: readString(params.turnId) ?? state.turnId,
        tokenUsage: {
          totalTokens: readNumber(total.totalTokens),
          inputTokens: readNumber(total.inputTokens),
          cachedInputTokens: readNumber(total.cachedInputTokens),
          outputTokens: readNumber(total.outputTokens),
          reasoningOutputTokens: readNumber(total.reasoningOutputTokens),
          modelContextWindow: readNullableNumber(usage.modelContextWindow),
        },
      };
    }
    case "turn/plan/updated": {
      const plan = Array.isArray(params.plan) ? params.plan : [];
      const latestPlan = plan
        .map((step) => {
          const item = readObject(step);
          return `${readString(item.status) ?? "pending"}: ${
            readString(item.step) ?? ""
          }`;
        })
        .join("\n");
      return {
        ...appendStreamEvent(state, "activity", "Updated plan"),
        latestPlan,
      };
    }
    case "item/plan/delta":
      return appendStreamEvent(
        appendLine(state, "system", readString(params.delta) ?? ""),
        "reasoning",
        readString(params.delta) ?? "",
        true,
      );
    case "turn/diff/updated":
      return {
        ...appendStreamEvent(state, "file", "Updated diff"),
        latestDiff: readString(params.diff) ?? "",
      };
    case "item/agentMessage/delta": {
      const delta = readString(params.delta) ?? "";
      return {
        ...appendStreamEvent(appendLine(state, "assistant", delta), "message", delta, true),
        finalMessage: `${state.finalMessage}${delta}`,
      };
    }
    case "item/reasoning/summaryTextDelta":
    case "item/reasoning/textDelta":
      return appendStreamEvent(
        appendLine(state, "reasoning", readString(params.delta) ?? ""),
        "reasoning",
        readString(params.delta) ?? "",
        true,
      );
    case "item/commandExecution/outputDelta":
    case "command/exec/outputDelta":
    case "process/outputDelta":
      return appendStreamEvent(
        appendLine(state, "command", readString(params.delta) ?? ""),
        "command",
        readString(params.delta) ?? "",
        true,
      );
    case "item/started": {
      const item = readObject(params.item);
      if (item.type === "subAgentActivity") {
        const text = `Subagent activity: ${readString(item.kind) ?? "started"}`;
        return appendStreamEvent(
          appendLine(state, "subagent", text),
          "activity",
          text,
        );
      }
      const text = `Started ${readString(item.type) ?? "item"}`;
      return appendStreamEvent(appendLine(state, "system", text), "activity", text);
    }
    case "item/completed": {
      const item = readObject(params.item);
      if (item.type === "subAgentActivity") {
        const text = `Subagent activity completed: ${readString(item.kind) ?? "done"}`;
        return appendStreamEvent(
          appendLine(state, "subagent", text),
          "activity",
          text,
        );
      }
      return appendStreamEvent(
        state,
        "activity",
        `Completed ${readString(item.type) ?? "item"}`,
      );
    }
    case "turn/completed": {
      const turn = readObject(params.turn);
      const status = readString(turn.status);
      const failed = status === "failed";
      const completedAt = new Date().toISOString();
      const durationMs = readNullableNumber(turn.durationMs);
      return {
        ...state,
        status: failed ? "failed" : "completed",
        completedAt,
        elapsedMs:
          durationMs ??
          calculateElapsedMs(state.startedAt, completedAt, state.elapsedMs),
        error: failed ? JSON.stringify(turn.error ?? "Turn failed") : null,
      };
    }
    case "error": {
      const completedAt = new Date().toISOString();
      return {
        ...appendStreamEvent(
          appendLine(state, "system", JSON.stringify(params.error ?? message)),
          "system",
          JSON.stringify(params.error ?? message),
        ),
        status: "failed",
        completedAt,
        elapsedMs: calculateElapsedMs(state.startedAt, completedAt, state.elapsedMs),
        error: JSON.stringify(params.error ?? message),
      };
    }
    default:
      return state;
  }
}

export function addServerRequest(state: RunViewState, request: CodexMessage) {
  return {
    ...state,
    serverRequests: [...state.serverRequests, request],
  };
}

export function resolveServerRequest(state: RunViewState, requestId: string | number) {
  return {
    ...state,
    serverRequests: state.serverRequests.filter((request) => request.id !== requestId),
  };
}

export function updateRunElapsed(
  state: RunViewState,
  now: number | string | Date = Date.now(),
) {
  if (!state.startedAt || state.completedAt) {
    return state;
  }

  const elapsedMs = calculateElapsedMs(state.startedAt, now, state.elapsedMs);
  if (elapsedMs === state.elapsedMs) {
    return state;
  }

  return { ...state, elapsedMs };
}

function appendLine(
  state: RunViewState,
  kind: ConsoleLine["kind"],
  text: string,
): RunViewState {
  if (!text) {
    return state;
  }

  const last = state.console[state.console.length - 1];
  if (last?.kind === kind && kind !== "system" && kind !== "subagent") {
    return {
      ...state,
      console: [
        ...state.console.slice(0, -1),
        { ...last, text: `${last.text}${text}` },
      ],
    };
  }

  return {
    ...state,
    console: [
      ...state.console,
      {
        id: `${state.console.length}-${Date.now()}`,
        kind,
        text,
      },
    ],
  };
}

function appendStreamEvent(
  state: RunViewState,
  kind: StreamEvent["kind"],
  text: string,
  mergeWithPrevious = false,
): RunViewState {
  if (!text) {
    return state;
  }

  const last = state.streamEvents[state.streamEvents.length - 1];
  if (mergeWithPrevious && last?.kind === kind) {
    return {
      ...state,
      streamEvents: [
        ...state.streamEvents.slice(0, -1),
        {
          ...last,
          text: `${last.text}${text}`,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  return {
    ...state,
    streamEvents: [
      ...state.streamEvents,
      {
        id: `${state.streamEvents.length}-${Date.now()}`,
        kind,
        text,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function calculateElapsedMs(
  startedAt: string | null,
  until: number | string | Date,
  fallback: number,
) {
  if (!startedAt) {
    return fallback;
  }

  const started = new Date(startedAt).getTime();
  const ended =
    typeof until === "number" ? until : new Date(until).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(ended)) {
    return fallback;
  }

  return Math.max(0, ended - started);
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" ? value : 0;
}

function readNullableNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}
