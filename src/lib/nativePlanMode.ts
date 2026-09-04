import type { CodexMessage } from "../features/codex/types";

export type CollaborationModeName = "plan" | "default";

export type CollaborationModeMask = {
  name: string;
  mode: CollaborationModeName | null;
  model?: string | null;
  reasoning_effort?: string | null;
};

export type CollaborationMode = {
  mode: CollaborationModeName;
  settings: {
    model: string;
    reasoning_effort: string | null;
    developer_instructions: string | null;
  };
};

export const GENERATED_IMAGE_HANDLING_POLICY =
  "Treat generated concepts, mockups, redesign options, and brainstorming images as preview-only, even when a repository is open. Copy a generated image into the workspace only when the user names a workspace destination or clearly asks to create, edit, replace, or use it as a project asset.";

export function composeOrchestratorDeveloperInstructions(
  existing: string | null | undefined,
) {
  const normalized = existing?.trim() ?? "";
  if (normalized.includes(GENERATED_IMAGE_HANDLING_POLICY)) {
    return normalized;
  }
  return normalized
    ? `${normalized}\n\n${GENERATED_IMAGE_HANDLING_POLICY}`
    : GENERATED_IMAGE_HANDLING_POLICY;
}

export function withOrchestratorDeveloperInstructions(
  collaborationMode: CollaborationMode,
): CollaborationMode {
  const developerInstructions = composeOrchestratorDeveloperInstructions(
    collaborationMode.settings.developer_instructions,
  );
  if (
    developerInstructions ===
    collaborationMode.settings.developer_instructions
  ) {
    return collaborationMode;
  }
  return {
    ...collaborationMode,
    settings: {
      ...collaborationMode.settings,
      developer_instructions: developerInstructions,
    },
  };
}

export type NativePlanPhase =
  | "inactive"
  | "activating"
  | "analysing"
  | "drafting"
  | "revising"
  | "awaiting-clarification"
  | "awaiting-approval"
  | "transitioning"
  | "implementing"
  | "cancelling"
  | "completed"
  | "cancelled"
  | "failed";

export type NativePlanReviewState =
  | "none"
  | "available"
  | "submitting"
  | "superseded"
  | "approved"
  | "cancelled";

export type RunIntent =
  | "normal"
  | "plan"
  | "plan-revision"
  | "plan-implementation";

export type NativePlanState = {
  intent: RunIntent;
  mode: CollaborationModeName | null;
  phase: NativePlanPhase;
  planItemId: string | null;
  previewText: string;
  completedText: string;
  completedTurnId: string | null;
  reviewState: NativePlanReviewState;
  threadActiveFlags: string[];
  requestStates: Record<string, "submitting" | "failed">;
};

export const emptyNativePlanState: NativePlanState = {
  intent: "normal",
  mode: null,
  phase: "inactive",
  planItemId: null,
  previewText: "",
  completedText: "",
  completedTurnId: null,
  reviewState: "none",
  threadActiveFlags: [],
  requestStates: {},
};

export type UserInputOption = {
  label: string;
  description: string;
};

export type UserInputQuestion = {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  isSecret: boolean;
  options: UserInputOption[] | null;
};

export type UserInputRequestParams = {
  threadId: string;
  turnId: string;
  itemId: string;
  questions: UserInputQuestion[];
  autoResolutionMs: number | null;
};

export type UserInputResponse = {
  answers: Record<string, { answers: string[] }>;
};

export type NativeUserInputRequest = CodexMessage & {
  id: string | number;
  method: "item/tool/requestUserInput";
  params: UserInputRequestParams;
};

export type NativePlanItem = {
  type: "plan";
  id: string;
  text: string;
};

export type ThreadStatus =
  | { type: "notLoaded" }
  | { type: "idle" }
  | { type: "systemError" }
  | {
      type: "active";
      activeFlags: Array<"waitingOnApproval" | "waitingOnUserInput">;
    };

export function isCollaborationModeMask(value: unknown): value is CollaborationModeMask {
  const mask = readObject(value);
  return (
    typeof mask.name === "string" &&
    (mask.mode === "plan" || mask.mode === "default" || mask.mode === null) &&
    (mask.model === undefined || mask.model === null || typeof mask.model === "string") &&
    (mask.reasoning_effort === undefined ||
      mask.reasoning_effort === null ||
      typeof mask.reasoning_effort === "string")
  );
}

export function isNativePlanItem(value: unknown): value is NativePlanItem {
  const item = readObject(value);
  return item.type === "plan" && typeof item.id === "string" && typeof item.text === "string";
}

export function isServerRequestResolvedMessage(message: CodexMessage) {
  const params = readObject(message.params);
  return (
    message.method === "serverRequest/resolved" &&
    (typeof params.requestId === "string" || typeof params.requestId === "number")
  );
}

export function readThreadStatus(message: CodexMessage): ThreadStatus | null {
  if (message.method !== "thread/status/changed") return null;
  const status = readObject(readObject(message.params).status);
  if (
    status.type === "notLoaded" ||
    status.type === "idle" ||
    status.type === "systemError"
  ) {
    return { type: status.type };
  }
  if (status.type !== "active") return null;
  const activeFlags = (Array.isArray(status.activeFlags) ? status.activeFlags : []).filter(
    (flag): flag is "waitingOnApproval" | "waitingOnUserInput" =>
      flag === "waitingOnApproval" || flag === "waitingOnUserInput",
  );
  return { type: "active", activeFlags };
}

export function buildCollaborationMode(
  mask: CollaborationModeMask,
  fallbackModel: string | null,
  fallbackEffort: string | null,
): CollaborationMode {
  if (mask.mode !== "plan" && mask.mode !== "default") {
    throw new Error(`Unsupported collaboration mode preset: ${mask.name}`);
  }

  return {
    mode: mask.mode,
    settings: {
      model: mask.model ?? fallbackModel ?? "",
      reasoning_effort: mask.reasoning_effort ?? fallbackEffort,
      developer_instructions: composeOrchestratorDeveloperInstructions(null),
    },
  };
}

export function selectNativePlanModes(
  masks: CollaborationModeMask[],
  fallbackModel: string | null,
  fallbackEffort: string | null,
) {
  const planMask = masks.find((mask) => mask.mode === "plan");
  const defaultMask = masks.find((mask) => mask.mode === "default");
  if (!planMask || !defaultMask) {
    throw new Error(
      "This Codex app-server does not expose both Plan and Default collaboration modes.",
    );
  }

  return {
    plan: buildCollaborationMode(planMask, fallbackModel, fallbackEffort),
    default: buildCollaborationMode(defaultMask, fallbackModel, fallbackEffort),
  };
}

export function isNativeUserInputRequest(
  request: CodexMessage,
): request is NativeUserInputRequest {
  if (request.id === undefined || request.method !== "item/tool/requestUserInput") {
    return false;
  }
  const params = readObject(request.params);
  return (
    typeof params.threadId === "string" &&
    typeof params.turnId === "string" &&
    typeof params.itemId === "string" &&
    Array.isArray(params.questions)
  );
}

export function requestKey(request: Pick<CodexMessage, "id">) {
  return String(request.id);
}

export function messageMatchesRun(
  message: CodexMessage,
  threadId: string | null,
  turnId: string | null,
) {
  const params = readObject(message.params);
  const messageThreadId = readString(params.threadId);
  const messageTurnId =
    readString(params.turnId) ?? readString(readObject(params.turn).id);
  if (messageThreadId && threadId && messageThreadId !== threadId) {
    return false;
  }
  if (messageTurnId && turnId && messageTurnId !== turnId) {
    return false;
  }
  return true;
}

export function createStableClientMessageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `orchestrator-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}
