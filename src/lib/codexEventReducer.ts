import type { CodexMessage } from "../types";
import type { CodexApprovalRequest } from "./codexApprovals";
import {
  emptyNativePlanState,
  isNativePlanItem,
  isNativeUserInputRequest,
  readThreadStatus,
  requestKey,
  type NativePlanState,
} from "./nativePlanMode";
import { parseProposedPlanEnvelope } from "./proposedPlan";
import {
  parseRunPlanProgress,
  type RunPlanProgress,
} from "./planProgress";
import {
  parseThreadTokenUsage,
  type TokenUsage,
} from "./contextUsage";

export type { TokenUsage } from "./contextUsage";

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
  activityIds?: string[];
};

export type RunEditedFile = {
  path: string;
  name: string;
  additions: number;
  deletions: number;
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "unknown";
};

export type RunCommandActivity = {
  id: string;
  command: string;
  status:
    | "pending"
    | "awaiting-approval"
    | "running"
    | "completed"
    | "failed"
    | "declined";
  durationMs: number | null;
  output: string;
};

type AgentMessagePhase = "commentary" | "final_answer" | null;

type AgentMessageState = {
  text: string;
  phase: AgentMessagePhase;
};

export type PendingInteractionRef = {
  kind: "approval" | "server-request";
  key: string;
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
  editedFiles: RunEditedFile[];
  fileChangesReverted: boolean;
  commands: RunCommandActivity[];
  agentMessagesById: Record<string, AgentMessageState>;
  finalMessageItemId: string | null;
  latestPlan: string;
  planProgress: RunPlanProgress | null;
  latestDiff: string;
  finalMessage: string;
  error: string | null;
  tokenUsageStartTotal: number | null;
  tokenUsageStartCachedInput: number | null;
  tokenUsage: TokenUsage | null;
  approvalRequests: CodexApprovalRequest[];
  approvalResourcesByItemId: Record<string, string[]>;
  serverRequests: CodexMessage[];
  pendingInteractionOrder: PendingInteractionRef[];
  nativePlan: NativePlanState;
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
  editedFiles: [],
  fileChangesReverted: false,
  commands: [],
  agentMessagesById: {},
  finalMessageItemId: null,
  latestPlan: "",
  planProgress: null,
  latestDiff: "",
  finalMessage: "",
  error: null,
  tokenUsageStartTotal: 0,
  tokenUsageStartCachedInput: 0,
  tokenUsage: null,
  approvalRequests: [],
  approvalResourcesByItemId: {},
  serverRequests: [],
  pendingInteractionOrder: [],
  nativePlan: emptyNativePlanState,
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
        nativePlan: {
          ...state.nativePlan,
          phase:
            state.nativePlan.intent === "plan-revision"
              ? "revising"
              : state.nativePlan.intent === "plan"
                ? "analysing"
                : state.nativePlan.intent === "plan-implementation"
                  ? "implementing"
                  : state.nativePlan.phase,
        },
      };
    }
    case "thread/status/changed": {
      const status = readThreadStatus(message);
      const activeFlags = status?.type === "active" ? status.activeFlags : [];
      return {
        ...state,
        nativePlan: {
          ...state.nativePlan,
          threadActiveFlags: activeFlags,
          phase: activeFlags.includes("waitingOnUserInput")
            ? "awaiting-clarification"
            : state.nativePlan.phase,
        },
      };
    }
    case "thread/settings/updated": {
      const settings = readObject(params.threadSettings);
      const collaborationMode = readObject(settings.collaborationMode);
      const mode = readString(collaborationMode.mode);
      if (mode !== "plan" && mode !== "default") {
        return state;
      }
      return {
        ...state,
        nativePlan: {
          ...state.nativePlan,
          mode,
        },
      };
    }
    case "thread/tokenUsage/updated": {
      const parsedTokenUsage = parseThreadTokenUsage(params.tokenUsage);
      const tokenUsage = parsedTokenUsage
        ? {
            ...parsedTokenUsage,
            turnTokens: calculateUsageDelta(
              parsedTokenUsage.totalTokens,
              state.tokenUsageStartTotal,
            ),
            turnCachedInputTokens: calculateUsageDelta(
              parsedTokenUsage.cachedInputTokens,
              state.tokenUsageStartCachedInput,
            ),
          }
        : null;
      return {
        ...state,
        threadId: readString(params.threadId) ?? state.threadId,
        turnId: readString(params.turnId) ?? state.turnId,
        tokenUsage: tokenUsage ?? state.tokenUsage,
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
        planProgress: parseRunPlanProgress(params.plan),
      };
    }
    case "item/plan/delta": {
      const delta = readString(params.delta) ?? "";
      const itemId = readString(params.itemId);
      const currentPreview =
        itemId && state.nativePlan.planItemId !== itemId
          ? ""
          : state.nativePlan.previewText;
      return {
        ...state,
        nativePlan: {
          ...state.nativePlan,
          phase:
            state.nativePlan.intent === "plan-revision" ? "revising" : "drafting",
          planItemId: itemId ?? state.nativePlan.planItemId,
          previewText: `${currentPreview}${delta}`,
        },
      };
    }
    case "turn/diff/updated": {
      const diff = readString(params.diff) ?? "";
      const editedFiles = extractEditedFiles(params, diff);
      return {
        ...appendStreamEvent(
          mergeEditedFiles(state, editedFiles),
          "file",
          editedFiles.length > 0
            ? `Edited ${editedFiles.length} ${editedFiles.length === 1 ? "file" : "files"}`
            : "Updated diff",
          false,
          editedFiles.map((file) => file.path),
        ),
        latestDiff: diff,
      };
    }
    case "item/agentMessage/delta": {
      const delta = readString(params.delta) ?? "";
      const itemId = extractAgentMessageId(params, readObject(params.item), state);
      return appendAgentMessageDelta(
        appendStreamEvent(
          appendLine(state, "assistant", delta),
          "message",
          delta,
          true,
          [itemId],
        ),
        params,
        delta,
      );
    }
    case "item/reasoning/summaryTextDelta":
    case "item/reasoning/textDelta":
      return appendStreamEvent(
        appendLine(state, "reasoning", readString(params.delta) ?? ""),
        "reasoning",
        readString(params.delta) ?? "",
        true,
      );
    case "item/commandExecution/started":
    case "command/exec/started":
      return upsertCommandActivity(state, params, "running", true);
    case "item/commandExecution/outputDelta":
    case "command/exec/outputDelta": {
      const delta = readString(params.delta) ?? "";
      return appendStreamEvent(
        appendCommandOutput(appendLine(state, "command", delta), params, delta),
        "command",
        delta,
        false,
        commandOutputActivityIds(state, params, delta),
      );
    }
    case "item/commandExecution/completed":
    case "command/exec/completed":
      return upsertCommandActivity(
        state,
        params,
        commandStatusFromParams(params),
        true,
      );
    case "process/outputDelta":
      return appendStreamEvent(
        appendLine(state, "command", readString(params.delta) ?? ""),
        "command",
        readString(params.delta) ?? "",
        true,
      );
    case "item/started": {
      const item = readObject(params.item);
      if (item.type === "agentMessage") {
        return startAgentMessage(state, params, item);
      }
      if (item.type === "subAgentActivity") {
        const text = `Subagent activity: ${readString(item.kind) ?? "started"}`;
        return appendStreamEvent(
          appendLine(state, "subagent", text),
          "activity",
          text,
        );
      }
      if (item.type === "commandExecution" || item.type === "command") {
        return upsertCommandActivity(state, params, "pending", true);
      }
      if (item.type === "fileChange") {
        const itemId = readString(item.id);
        const resources = extractFileChangeResources(item);
        const withResources =
          itemId && resources.length > 0
            ? {
                ...state,
                approvalResourcesByItemId: {
                  ...state.approvalResourcesByItemId,
                  [itemId]: resources,
                },
              }
            : state;
        return appendThinkingEvent(withResources);
      }
      if (isHiddenLifecycleItemType(readString(item.type))) {
        return appendThinkingEvent(state);
      }
      const text = `Started ${readString(item.type) ?? "item"}`;
      return appendStreamEvent(appendLine(state, "system", text), "activity", text);
    }
    case "item/completed": {
      const item = readObject(params.item);
      const planItem = params.item;
      if (isNativePlanItem(planItem)) {
        const text = planItem.text;
        const itemId =
          planItem.id ?? readString(params.itemId) ?? state.nativePlan.planItemId;
        if (
          itemId === state.nativePlan.planItemId &&
          text === state.nativePlan.completedText
        ) {
          return state;
        }
        return {
          ...appendStreamEvent(state, "activity", "Plan ready for review"),
          latestPlan: text,
          nativePlan: {
            ...state.nativePlan,
            phase: "drafting",
            planItemId: itemId,
            previewText: text,
            completedText: text,
            completedTurnId:
              readString(params.turnId) ?? state.turnId,
          },
        };
      }
      if (item.type === "agentMessage") {
        return completeAgentMessage(state, params, item);
      }
      if (item.type === "subAgentActivity") {
        const text = `Subagent activity completed: ${readString(item.kind) ?? "done"}`;
        return appendStreamEvent(
          appendLine(state, "subagent", text),
          "activity",
          text,
        );
      }
      if (item.type === "commandExecution" || item.type === "command") {
        return upsertCommandActivity(
          state,
          params,
          commandStatusFromParams(params),
          true,
        );
      }
      if (isHiddenLifecycleItemType(readString(item.type))) {
        return appendThinkingEvent(state);
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
        approvalRequests: [],
        approvalResourcesByItemId: {},
        pendingInteractionOrder: state.pendingInteractionOrder.filter(
          (interaction) => interaction.kind !== "approval",
        ),
        nativePlan: {
          ...state.nativePlan,
          phase: failed
            ? "failed"
            : state.nativePlan.intent === "plan-implementation"
              ? "completed"
              : state.nativePlan.completedText
                ? "awaiting-approval"
                : state.nativePlan.phase,
          reviewState:
            !failed &&
            state.nativePlan.intent !== "plan-implementation" &&
            state.nativePlan.completedText
              ? "available"
              : state.nativePlan.reviewState,
        },
      };
    }
    case "serverRequest/resolved": {
      const requestId = params.requestId;
      return requestId === undefined ? state : resolveServerRequest(state, requestId as string | number);
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
        approvalRequests: [],
        approvalResourcesByItemId: {},
        pendingInteractionOrder: state.pendingInteractionOrder.filter(
          (interaction) => interaction.kind !== "approval",
        ),
        nativePlan: { ...state.nativePlan, phase: "failed" },
      };
    }
    default:
      return state;
  }
}

export function addApprovalRequest(
  state: RunViewState,
  request: CodexApprovalRequest,
) {
  const existing = state.approvalRequests.find(
    (candidate) => candidate.key === request.key,
  );
  if (existing) {
    const duplicateMatches =
      existing.id === request.id &&
      existing.method === request.method &&
      existing.threadId === request.threadId &&
      existing.turnId === request.turnId &&
      existing.itemId === request.itemId;
    if (duplicateMatches) return state;
    return {
      ...state,
      approvalRequests: state.approvalRequests.map((candidate) =>
        candidate.key === request.key
          ? {
              ...candidate,
              status: "stale" as const,
              error: "Codex reused an approval identity for a different request. The request was blocked.",
            }
          : candidate,
      ),
    };
  }

  const commands = request.itemId
    ? state.commands.map((command) =>
        command.id === request.itemId
          ? { ...command, status: "awaiting-approval" as const }
          : command,
      )
    : state.commands;
  return {
    ...state,
    commands,
    approvalRequests: [...state.approvalRequests, request],
    pendingInteractionOrder: appendPendingInteraction(
      state.pendingInteractionOrder,
      { kind: "approval", key: request.key },
    ),
  };
}

export function markApprovalSubmitting(
  state: RunViewState,
  requestKey: string,
  choiceId: string,
) {
  return updateApprovalRequest(state, requestKey, (request) => ({
    ...request,
    status: "submitting",
    selectedChoiceId: choiceId,
    error: null,
  }));
}

export function markApprovalAwaitingResolution(
  state: RunViewState,
  requestKey: string,
) {
  return updateApprovalRequest(state, requestKey, (request) => ({
    ...request,
    status: "awaiting-resolution",
    error: null,
  }));
}

export function markApprovalError(
  state: RunViewState,
  requestKey: string,
  error: string,
) {
  return updateApprovalRequest(state, requestKey, (request) => ({
    ...request,
    status: "error",
    selectedChoiceId: null,
    error,
  }));
}

export function resolveApprovalRequest(
  state: RunViewState,
  requestId: string | number,
  threadId?: string | null,
) {
  const approvalRequests = state.approvalRequests.filter(
    (request) =>
      request.id !== requestId ||
      (threadId !== undefined && request.threadId !== threadId),
  );
  const remainingKeys = new Set(approvalRequests.map((request) => request.key));
  return {
    ...state,
    approvalRequests,
    pendingInteractionOrder: state.pendingInteractionOrder.filter(
      (interaction) =>
        interaction.kind !== "approval" || remainingKeys.has(interaction.key),
    ),
  };
}

export function addServerRequest(state: RunViewState, request: CodexMessage) {
  if (
    request.id !== undefined &&
    state.serverRequests.some(
      (existing) => String(existing.id) === String(request.id),
    )
  ) {
    return state;
  }
  return {
    ...state,
    serverRequests: [...state.serverRequests, request],
    pendingInteractionOrder: appendPendingInteraction(
      state.pendingInteractionOrder,
      { kind: "server-request", key: requestKey(request) },
    ),
    nativePlan: isNativeUserInputRequest(request)
      ? { ...state.nativePlan, phase: "awaiting-clarification" as const }
      : state.nativePlan,
  };
}

export function resolveServerRequest(state: RunViewState, requestId: string | number) {
  const nextRequests = state.serverRequests.filter(
    (request) => request.id !== requestId && String(request.id) !== String(requestId),
  );
  const nextRequestStates = { ...state.nativePlan.requestStates };
  delete nextRequestStates[String(requestId)];
  return {
    ...state,
    serverRequests: nextRequests,
    pendingInteractionOrder: state.pendingInteractionOrder.filter(
      (interaction) =>
        interaction.kind !== "server-request" ||
        nextRequests.some(
          (request) => requestKey(request) === interaction.key,
        ),
    ),
    nativePlan: {
      ...state.nativePlan,
      phase:
        state.nativePlan.phase === "awaiting-clarification" &&
        !nextRequests.some(isNativeUserInputRequest)
          ? "drafting"
          : state.nativePlan.phase,
      requestStates: nextRequestStates,
    },
  };
}

function appendPendingInteraction(
  current: PendingInteractionRef[],
  interaction: PendingInteractionRef,
) {
  return current.some(
    (candidate) =>
      candidate.kind === interaction.kind && candidate.key === interaction.key,
  )
    ? current
    : [...current, interaction];
}

export function setServerRequestSubmissionState(
  state: RunViewState,
  request: CodexMessage,
  submissionState: "submitting" | "failed" | null,
) {
  const next = { ...state.nativePlan.requestStates };
  if (submissionState === null) {
    delete next[requestKey(request)];
  } else {
    next[requestKey(request)] = submissionState;
  }
  return {
    ...state,
    nativePlan: { ...state.nativePlan, requestStates: next },
  };
}

export function updateNativePlanReview(
  state: RunViewState,
  reviewState: NativePlanState["reviewState"],
  phase: NativePlanState["phase"] = state.nativePlan.phase,
) {
  return {
    ...state,
    nativePlan: { ...state.nativePlan, reviewState, phase },
  };
}

export function invalidateApprovalRequests(
  state: RunViewState,
  message: string,
  turnId?: string | null,
) {
  return {
    ...state,
    approvalRequests: state.approvalRequests.map((request) =>
      turnId === undefined || request.turnId === turnId
        ? { ...request, status: "stale" as const, error: message }
        : request,
    ),
  };
}

function updateApprovalRequest(
  state: RunViewState,
  requestKey: string,
  update: (request: CodexApprovalRequest) => CodexApprovalRequest,
) {
  return {
    ...state,
    approvalRequests: state.approvalRequests.map((request) =>
      request.key === requestKey ? update(request) : request,
    ),
  };
}

function extractFileChangeResources(item: Record<string, unknown>) {
  const resources: string[] = [];
  const changes = Array.isArray(item.changes) ? item.changes : [];
  for (const change of changes) {
    const path = readString(readObject(change).path);
    if (path) resources.push(path);
  }
  return Array.from(new Set(resources));
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

function appendAgentMessageDelta(
  state: RunViewState,
  params: Record<string, unknown>,
  delta: string,
) {
  if (!delta) {
    return state;
  }

  const itemId = extractAgentMessageId(params, readObject(params.item), state);
  const current = state.agentMessagesById[itemId] ?? {
    text: "",
    phase: null,
  };

  return {
    ...state,
    agentMessagesById: {
      ...state.agentMessagesById,
      [itemId]: {
        ...current,
        text: `${current.text}${delta}`,
      },
    },
  };
}

function startAgentMessage(
  state: RunViewState,
  params: Record<string, unknown>,
  item: Record<string, unknown>,
) {
  const itemId = extractAgentMessageId(params, item, state);
  const current = state.agentMessagesById[itemId] ?? {
    text: "",
    phase: null,
  };

  return {
    ...state,
    agentMessagesById: {
      ...state.agentMessagesById,
      [itemId]: {
        text: readString(item.text) ?? current.text,
        phase: normalizeAgentMessagePhase(readString(item.phase)) ?? current.phase,
      },
    },
  };
}

function completeAgentMessage(
  state: RunViewState,
  params: Record<string, unknown>,
  item: Record<string, unknown>,
): RunViewState {
  const itemId = extractAgentMessageId(params, item, state);
  const current = state.agentMessagesById[itemId] ?? {
    text: "",
    phase: null,
  };
  const phase = normalizeAgentMessagePhase(readString(item.phase)) ?? current.phase;
  const text = readString(item.text) ?? current.text;
  const nextState: RunViewState = {
    ...state,
    agentMessagesById: {
      ...state.agentMessagesById,
      [itemId]: {
        text,
        phase,
      },
    },
  };

  if (!text.trim() || phase === "commentary") {
    return nextState;
  }

  const proposedPlan = parseProposedPlanEnvelope(text);
  if (proposedPlan) {
    const completed = state.status === "completed";
    return {
      ...nextState,
      finalMessage: "",
      finalMessageItemId: itemId,
      latestPlan: proposedPlan.markdown,
      nativePlan: {
        ...nextState.nativePlan,
        intent:
          nextState.nativePlan.intent === "plan-revision"
            ? "plan-revision"
            : "plan",
        mode: "plan",
        phase: completed ? "awaiting-approval" : "drafting",
        planItemId: itemId,
        previewText: proposedPlan.markdown,
        completedText: proposedPlan.markdown,
        completedTurnId: readString(params.turnId) ?? nextState.turnId,
        reviewState: completed ? "available" : "none",
      },
    };
  }

  if (phase === "final_answer") {
    return {
      ...nextState,
      finalMessage: mergeFinalAnswer(nextState, itemId, text),
      finalMessageItemId: itemId,
    };
  }

  return {
    ...nextState,
    finalMessage: text,
    finalMessageItemId: itemId,
  };
}

function extractAgentMessageId(
  params: Record<string, unknown>,
  item: Record<string, unknown>,
  state: RunViewState,
) {
  return (
    readString(params.itemId) ??
    readString(params.id) ??
    readString(item.id) ??
    state.finalMessageItemId ??
    "__legacy_agent_message__"
  );
}

function normalizeAgentMessagePhase(value: string | null): AgentMessagePhase {
  return value === "commentary" || value === "final_answer" ? value : null;
}

function mergeFinalAnswer(state: RunViewState, itemId: string, text: string) {
  if (!state.finalMessage || state.finalMessageItemId === itemId) {
    return text;
  }

  const currentFinalMessage =
    state.finalMessageItemId === null
      ? null
      : state.agentMessagesById[state.finalMessageItemId];
  if (currentFinalMessage?.phase !== "final_answer") {
    return text;
  }

  return `${state.finalMessage}\n\n${text}`;
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
  activityIds: string[] = [],
): RunViewState {
  if (!text) {
    return state;
  }

  const normalizedActivityIds = uniqueStrings(activityIds);
  const last = state.streamEvents[state.streamEvents.length - 1];
  if (
    mergeWithPrevious &&
    last?.kind === kind &&
    sameActivityIds(last.activityIds ?? [], normalizedActivityIds)
  ) {
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
        ...(normalizedActivityIds.length > 0
          ? { activityIds: normalizedActivityIds }
          : {}),
      },
    ],
  };
}

function appendThinkingEvent(state: RunViewState) {
  const last = state.streamEvents[state.streamEvents.length - 1];
  if (last?.kind === "activity" && last.text === "Thinking") {
    return state;
  }

  return appendStreamEvent(state, "activity", "Thinking");
}

function mergeEditedFiles(
  state: RunViewState,
  editedFiles: RunEditedFile[],
): RunViewState {
  if (editedFiles.length === 0) {
    return state;
  }

  const byPath = new Map(state.editedFiles.map((file) => [file.path, file]));
  for (const file of editedFiles) {
    const existing = byPath.get(file.path);
    byPath.set(file.path, {
      ...existing,
      ...file,
      additions: file.additions,
      deletions: file.deletions,
    });
  }

  return { ...state, editedFiles: Array.from(byPath.values()) };
}

function extractEditedFiles(
  params: Record<string, unknown>,
  diff: string,
): RunEditedFile[] {
  const explicitFiles = readArray(params.files)
    .map((file) => normalizeEditedFile(readObject(file)))
    .filter((file): file is RunEditedFile => file !== null);

  if (explicitFiles.length > 0) {
    return explicitFiles;
  }

  return parseUnifiedDiffFiles(diff);
}

function normalizeEditedFile(file: Record<string, unknown>) {
  const path =
    readString(file.path) ??
    readString(file.relativePath) ??
    readString(file.file) ??
    readString(file.name);

  if (!path) {
    return null;
  }

  return {
    path,
    name: basename(path),
    additions: readOptionalNumber(file.additions) ?? readOptionalNumber(file.added) ?? 0,
    deletions:
      readOptionalNumber(file.deletions) ?? readOptionalNumber(file.deleted) ?? 0,
    status: normalizeFileStatus(readString(file.status)),
  } satisfies RunEditedFile;
}

export function parseUnifiedDiffFiles(diff: string): RunEditedFile[] {
  if (!diff.trim()) {
    return [];
  }

  const files: RunEditedFile[] = [];
  let current: RunEditedFile | null = null;
  let oldPath: string | null = null;
  let newPath: string | null = null;

  for (const line of diff.split(/\r?\n/)) {
    const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (match) {
      if (current) {
        files.push(finalizeDiffFile(current, oldPath, newPath));
      }
      oldPath = match[1];
      newPath = match[2];
      current = {
        path: newPath,
        name: basename(newPath),
        additions: 0,
        deletions: 0,
        status: "modified",
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("--- ")) {
      oldPath = normalizeDiffPath(line.slice(4).trim());
      continue;
    }

    if (line.startsWith("+++ ")) {
      newPath = normalizeDiffPath(line.slice(4).trim());
      const path = newPath ?? oldPath ?? current.path;
      current.path = path;
      current.name = basename(path);
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.additions += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.deletions += 1;
    }
  }

  if (current) {
    files.push(finalizeDiffFile(current, oldPath, newPath));
  }

  return files;
}

function finalizeDiffFile(
  file: RunEditedFile,
  oldPath: string | null,
  newPath: string | null,
) {
  if (oldPath === null && newPath) {
    return { ...file, path: newPath, name: basename(newPath), status: "added" as const };
  }
  if (newPath === null && oldPath) {
    return { ...file, path: oldPath, name: basename(oldPath), status: "deleted" as const };
  }
  return file;
}

function normalizeDiffPath(path: string) {
  if (path === "/dev/null") {
    return null;
  }
  return path.replace(/^[ab]\//, "");
}

function upsertCommandActivity(
  state: RunViewState,
  params: Record<string, unknown>,
  status: RunCommandActivity["status"],
  appendTimelineEvent = false,
) {
  const command = extractCommandText(params);
  const id = extractCommandId(params, command, state);
  if (!id && !command) {
    return state;
  }

  const durationMs = extractDurationMs(params);
  const nextCommand = {
    id: id ?? `command-${state.commands.length + 1}`,
    command: command ?? "Command",
    status,
    durationMs,
    output: "",
  };
  const nextState = {
    ...state,
    commands: upsertCommand(state.commands, nextCommand),
  };

  return appendTimelineEvent
    ? appendStreamEvent(
        nextState,
        "command",
        commandTimelineLabel(nextCommand),
        false,
        [nextCommand.id],
      )
    : nextState;
}

function appendCommandOutput(
  state: RunViewState,
  params: Record<string, unknown>,
  delta: string,
) {
  if (!delta) {
    return state;
  }

  const command = extractCommandText(params);
  const id =
    extractCommandId(params, command, state) ??
    findLastRunningCommand(state.commands)?.id ??
    `command-${state.commands.length + 1}`;
  const fallbackCommand = command ?? firstNonEmptyLine(delta) ?? "Command";

  return {
    ...state,
    commands: upsertCommand(state.commands, {
      id,
      command: fallbackCommand,
      status: "running",
      durationMs: null,
      output: delta,
    }),
  };
}

function commandOutputActivityIds(
  state: RunViewState,
  params: Record<string, unknown>,
  delta: string,
) {
  const command = extractCommandText(params);
  const id =
    extractCommandId(params, command, state) ??
    findLastRunningCommand(state.commands)?.id ??
    (delta ? `command-${state.commands.length + 1}` : null);
  return id ? [id] : [];
}

function commandTimelineLabel(command: RunCommandActivity) {
  const action = (() => {
    switch (command.status) {
      case "failed":
        return "Failed";
      case "declined":
        return "Skipped";
      case "running":
        return "Running";
      case "awaiting-approval":
        return "Awaiting approval for";
      case "pending":
        return "Preparing";
      default:
        return "Ran";
    }
  })();
  return `${action} ${command.command}`;
}

function upsertCommand(
  commands: RunCommandActivity[],
  nextCommand: RunCommandActivity,
) {
  const existingIndex = commands.findIndex((command) => command.id === nextCommand.id);
  if (existingIndex === -1) {
    return [...commands, nextCommand];
  }

  const existing = commands[existingIndex];
  return [
    ...commands.slice(0, existingIndex),
    {
      ...existing,
      command:
        nextCommand.command && nextCommand.command !== "Command"
          ? nextCommand.command
          : existing.command,
      status: nextCommand.status,
      durationMs: nextCommand.durationMs ?? existing.durationMs,
      output: `${existing.output}${nextCommand.output}`,
    },
    ...commands.slice(existingIndex + 1),
  ];
}

function findLastRunningCommand(commands: RunCommandActivity[]) {
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    if (commands[index].status === "running") {
      return commands[index];
    }
  }
  return null;
}

function extractCommandId(
  params: Record<string, unknown>,
  command: string | null,
  state: RunViewState,
) {
  const item = readObject(params.item);
  const id =
    readString(params.id) ??
    readString(params.itemId) ??
    readString(params.commandId) ??
    readString(item.id);
  if (id) {
    return id;
  }

  if (command) {
    const existing = state.commands.find((activity) => activity.command === command);
    return existing?.id ?? command;
  }

  return null;
}

function extractCommandText(params: Record<string, unknown>) {
  const item = readObject(params.item);
  const commandValue = params.command ?? item.command;
  if (typeof commandValue === "string") {
    return commandValue;
  }

  if (Array.isArray(commandValue)) {
    return commandValue.filter((part) => typeof part === "string").join(" ");
  }

  const commandObject = readObject(commandValue);
  return (
    readString(commandObject.command) ??
    readString(commandObject.cmd) ??
    readString(commandObject.text) ??
    readString(commandObject.shellCommand) ??
    readString(params.cmd) ??
    readString(item.cmd)
  );
}

function extractDurationMs(params: Record<string, unknown>) {
  const item = readObject(params.item);
  const durationMs =
    readOptionalNumber(params.durationMs) ??
    readOptionalNumber(item.durationMs) ??
    readOptionalNumber(params.elapsedMs) ??
    readOptionalNumber(item.elapsedMs);
  if (durationMs !== null) {
    return durationMs;
  }

  const durationSeconds =
    readOptionalNumber(params.durationSeconds) ??
    readOptionalNumber(item.durationSeconds) ??
    readOptionalNumber(params.duration_secs) ??
    readOptionalNumber(item.duration_secs);
  return durationSeconds === null ? null : Math.round(durationSeconds * 1000);
}

function commandStatusFromParams(params: Record<string, unknown>) {
  const item = readObject(params.item);
  const status = readString(params.status) ?? readString(item.status);
  if (status === "failed" || status === "error") {
    return "failed";
  }
  if (status === "declined") {
    return "declined";
  }
  return "completed";
}

function normalizeFileStatus(status: string | null): RunEditedFile["status"] {
  if (
    status === "added" ||
    status === "modified" ||
    status === "deleted" ||
    status === "renamed" ||
    status === "copied"
  ) {
    return status;
  }
  return "unknown";
}

function isHiddenLifecycleItemType(type: string | null) {
  return type === "userMessage" || type === "reasoning" || type === "fileChange";
}

function basename(path: string) {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? path;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function sameActivityIds(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function firstNonEmptyLine(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? null;
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

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

function readNullableNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

function calculateUsageDelta(current: number, baseline: number | null) {
  return baseline === null ? null : Math.max(0, current - baseline);
}
