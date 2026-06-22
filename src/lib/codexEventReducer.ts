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

export type RunViewState = {
  status: "idle" | "connecting" | "running" | "completed" | "failed" | "interrupted";
  threadId: string | null;
  turnId: string | null;
  console: ConsoleLine[];
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
  console: [],
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
      return {
        ...state,
        latestPlan: plan
          .map((step) => {
            const item = readObject(step);
            return `${readString(item.status) ?? "pending"}: ${
              readString(item.step) ?? ""
            }`;
          })
          .join("\n"),
      };
    }
    case "item/plan/delta":
      return appendLine(state, "system", readString(params.delta) ?? "");
    case "turn/diff/updated":
      return { ...state, latestDiff: readString(params.diff) ?? "" };
    case "item/agentMessage/delta": {
      const delta = readString(params.delta) ?? "";
      return {
        ...appendLine(state, "assistant", delta),
        finalMessage: `${state.finalMessage}${delta}`,
      };
    }
    case "item/reasoning/summaryTextDelta":
    case "item/reasoning/textDelta":
      return appendLine(state, "reasoning", readString(params.delta) ?? "");
    case "item/commandExecution/outputDelta":
    case "command/exec/outputDelta":
    case "process/outputDelta":
      return appendLine(state, "command", readString(params.delta) ?? "");
    case "item/started": {
      const item = readObject(params.item);
      if (item.type === "subAgentActivity") {
        return appendLine(
          state,
          "subagent",
          `Subagent activity: ${readString(item.kind) ?? "started"}`,
        );
      }
      return appendLine(state, "system", `Started ${readString(item.type) ?? "item"}`);
    }
    case "item/completed": {
      const item = readObject(params.item);
      if (item.type === "subAgentActivity") {
        return appendLine(
          state,
          "subagent",
          `Subagent activity completed: ${readString(item.kind) ?? "done"}`,
        );
      }
      return state;
    }
    case "turn/completed": {
      const turn = readObject(params.turn);
      const status = readString(turn.status);
      const failed = status === "failed";
      return {
        ...state,
        status: failed ? "failed" : "completed",
        error: failed ? JSON.stringify(turn.error ?? "Turn failed") : null,
      };
    }
    case "error":
      return {
        ...appendLine(state, "system", JSON.stringify(params.error ?? message)),
        status: "failed",
        error: JSON.stringify(params.error ?? message),
      };
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
