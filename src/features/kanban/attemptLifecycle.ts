import type { CodexMessage, CodexProfileKey } from "../codex/types";
import { isNativeUserInputRequest } from "../../lib/nativePlanMode";
import {
  createKanbanId,
  updateKanbanAttempt,
  type CompletedKanbanPlan,
  type KanbanAttemptResult,
} from "./api";

export type KanbanRunAttemptBinding = {
  cardId: string;
  attemptId: string;
  generation: number;
  executionRoot: string | null;
  eventSequence: number;
};

export type KanbanAttemptControl = {
  accountId: number;
  profileKey: CodexProfileKey;
  runId: number | null;
  taskId: number | null;
  threadId: string | null;
  turnId: string | null;
  kanbanAttempt: KanbanRunAttemptBinding | null;
};

export type KanbanStopAcknowledgement =
  | { acknowledged: true }
  | { acknowledged: false; error: string };

export type PendingKanbanStopRequest = {
  promise: Promise<KanbanStopAcknowledgement>;
  settle: (result: KanbanStopAcknowledgement) => void;
  settled: boolean;
  interrupting: boolean;
};

export type KanbanAttemptPersistenceResult =
  | { persisted: true; error: null }
  | { persisted: false; error: string };

export type KanbanAttemptStateControllerDependencies = {
  updateAttempt: (input: {
    cardId: string;
    attemptId: string;
    generation: number;
    sequence: number;
    status: string;
    runId?: number | null;
    taskId?: number | null;
    threadId?: string | null;
    turnId?: string | null;
    executionRoot?: string | null;
    error?: string | null;
    completedPlan?: CompletedKanbanPlan | null;
    operationId?: string;
  }) => Promise<KanbanAttemptResult>;
  createOperationId: () => string;
  onBoardChanged: () => void;
  onPersistenceError: (message: string) => void;
};

export type KanbanAttemptStateControllerOptions = Partial<
  KanbanAttemptStateControllerDependencies
> &
  Pick<KanbanAttemptStateControllerDependencies, "onBoardChanged">;

export class KanbanAttemptStateController {
  private readonly dependencies: KanbanAttemptStateControllerDependencies;

  constructor(options: KanbanAttemptStateControllerOptions) {
    this.dependencies = {
      updateAttempt: updateKanbanAttempt,
      createOperationId: () => createKanbanId("op"),
      onPersistenceError: (message) => {
        console.error("Could not persist Kanban attempt state", message);
      },
      ...options,
    };
  }

  async persist(
    control: KanbanAttemptControl | null,
    status: string,
    error: string | null = null,
    options: {
      retryCount?: number;
      completedPlan?: CompletedKanbanPlan | null;
    } = {},
  ): Promise<KanbanAttemptPersistenceResult> {
    const binding = control?.kanbanAttempt;
    if (!control || !binding) return { persisted: true, error: null };

    binding.eventSequence += 1;
    const request = {
      cardId: binding.cardId,
      attemptId: binding.attemptId,
      generation: binding.generation,
      sequence: binding.eventSequence,
      status,
      runId: control.runId,
      taskId: control.taskId,
      threadId: control.threadId,
      turnId: control.turnId,
      executionRoot: binding.executionRoot,
      error,
      completedPlan: options.completedPlan ?? null,
      operationId: this.dependencies.createOperationId(),
    };
    let lastError = "The Kanban attempt state could not be saved.";
    const attempts = Math.max(1, (options.retryCount ?? 0) + 1);

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        await this.dependencies.updateAttempt(request);
        this.dependencies.onBoardChanged();
        return { persisted: true, error: null };
      } catch (persistError) {
        lastError =
          persistError instanceof Error
            ? persistError.message
            : String(persistError);
      }
    }

    this.dependencies.onPersistenceError(lastError);
    this.dependencies.onBoardChanged();
    return { persisted: false, error: lastError };
  }
}

export function createPendingKanbanStopRequest(): PendingKanbanStopRequest {
  let resolvePromise: (result: KanbanStopAcknowledgement) => void = () =>
    undefined;
  const request: PendingKanbanStopRequest = {
    promise: new Promise<KanbanStopAcknowledgement>((resolve) => {
      resolvePromise = resolve;
    }),
    settle: (result) => {
      if (request.settled) return;
      request.settled = true;
      resolvePromise(result);
    },
    settled: false,
    interrupting: false,
  };
  return request;
}

export function kanbanStatusAfterFailedStop(runView: {
  serverRequests: CodexMessage[];
  approvalRequests: unknown[];
}) {
  if (runView.serverRequests.some(isNativeUserInputRequest)) {
    return "waiting_user";
  }
  if (runView.approvalRequests.length > 0) return "waiting_approval";
  return "running";
}

const NO_TOOL_BLOCKED_RESULT_PATTERNS = [
  /(?:no|without) (?:(?:filesystem|file system|terminal|shell)(?:\s+or\s+)?)+\s+access/i,
  /(?:cannot|can't|could not|couldn't) access (?:the )?(?:filesystem|file system|terminal|shell|repository|workspace)/i,
  /(?:filesystem|file system|terminal|shell|repository|workspace).{0,48}(?:is not|isn't|was not|wasn't|not) (?:available|accessible|attached)/i,
];

export function blockedNoToolImplementationError(input: {
  finalMessage: string;
  commandCount: number;
  editedFileCount: number;
  hasDiff: boolean;
}) {
  if (
    input.commandCount > 0 ||
    input.editedFileCount > 0 ||
    input.hasDiff ||
    !NO_TOOL_BLOCKED_RESULT_PATTERNS.some((pattern) =>
      pattern.test(input.finalMessage),
    )
  ) {
    return null;
  }
  return "Codex could not access the card worktree or terminal, so no implementation was performed. Resume the card after restoring its execution environment.";
}

export async function acknowledgeKanbanStopWithTurn(
  control: Pick<
    KanbanAttemptControl,
    "profileKey" | "accountId" | "turnId"
  >,
  request: PendingKanbanStopRequest,
  threadId: string,
  turnId: string,
  interruptTurn: (
    profileKey: CodexProfileKey,
    accountId: number,
    threadId: string,
    turnId: string,
  ) => Promise<string | null>,
) {
  if (request.settled || request.interrupting) return request.promise;
  request.interrupting = true;
  try {
    const interruptedTurnId = await interruptTurn(
      control.profileKey,
      control.accountId,
      threadId,
      turnId,
    );
    if (interruptedTurnId) control.turnId = interruptedTurnId;
    request.settle({ acknowledged: true });
  } catch (error) {
    request.settle({
      acknowledged: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return request.promise;
}
