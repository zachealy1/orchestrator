import type { KanbanGitBinding } from "../features/kanban/api";

export const NATIVE_TASK_WORKSPACE_BINDING_VERSION = 1;

export type NativeTaskWorkspaceBinding = {
  version: typeof NATIVE_TASK_WORKSPACE_BINDING_VERSION;
  kind: "kanban" | "continuation";
  sourceWorkspacePath: string;
  executionDirectory: string;
  runtimeWorkspaceRoots: string[];
  environmentId: string;
  pendingContinuationContext: string | null;
};

function uniquePaths(paths: Array<string | null | undefined>) {
  return [...new Set(paths.filter((path): path is string => Boolean(path?.trim())))];
}

export function createKanbanNativeTaskWorkspaceBinding(input: {
  cardId: string;
  sourceWorkspacePath: string;
  executionDirectory: string;
  bindings: KanbanGitBinding[];
  pendingContinuationContext?: string | null;
}): NativeTaskWorkspaceBinding {
  return {
    version: NATIVE_TASK_WORKSPACE_BINDING_VERSION,
    kind: "kanban",
    sourceWorkspacePath: input.sourceWorkspacePath,
    executionDirectory: input.executionDirectory,
    runtimeWorkspaceRoots: uniquePaths([
      input.executionDirectory,
      ...input.bindings.map((binding) => binding.worktreePath),
    ]),
    environmentId: `orchestrator:kanban:${input.cardId}`,
    pendingContinuationContext: input.pendingContinuationContext ?? null,
  };
}

export function createContinuationNativeTaskWorkspaceBinding(input: {
  chatId: number;
  sourceWorkspacePath: string;
  executionDirectory?: string | null;
  runtimeWorkspaceRoots?: string[];
  pendingContinuationContext?: string | null;
}): NativeTaskWorkspaceBinding {
  const executionDirectory = input.executionDirectory ?? input.sourceWorkspacePath;
  return {
    version: NATIVE_TASK_WORKSPACE_BINDING_VERSION,
    kind: "continuation",
    sourceWorkspacePath: input.sourceWorkspacePath,
    executionDirectory,
    runtimeWorkspaceRoots: uniquePaths([
      executionDirectory,
      ...(input.runtimeWorkspaceRoots ?? []),
    ]),
    environmentId: `orchestrator:continuation:${input.chatId}`,
    pendingContinuationContext: input.pendingContinuationContext ?? null,
  };
}

export function parseNativeTaskWorkspaceBinding(
  value: string | null | undefined,
): NativeTaskWorkspaceBinding | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<NativeTaskWorkspaceBinding>;
    if (
      parsed.version !== NATIVE_TASK_WORKSPACE_BINDING_VERSION ||
      (parsed.kind !== "kanban" && parsed.kind !== "continuation") ||
      typeof parsed.sourceWorkspacePath !== "string" ||
      !parsed.sourceWorkspacePath ||
      typeof parsed.executionDirectory !== "string" ||
      !parsed.executionDirectory ||
      typeof parsed.environmentId !== "string" ||
      !parsed.environmentId ||
      !Array.isArray(parsed.runtimeWorkspaceRoots) ||
      !parsed.runtimeWorkspaceRoots.every(
        (path) => typeof path === "string" && Boolean(path),
      ) ||
      !(
        parsed.pendingContinuationContext === null ||
        typeof parsed.pendingContinuationContext === "string" ||
        parsed.pendingContinuationContext === undefined
      )
    ) {
      return null;
    }
    return {
      version: NATIVE_TASK_WORKSPACE_BINDING_VERSION,
      kind: parsed.kind,
      sourceWorkspacePath: parsed.sourceWorkspacePath,
      executionDirectory: parsed.executionDirectory,
      runtimeWorkspaceRoots: uniquePaths(parsed.runtimeWorkspaceRoots),
      environmentId: parsed.environmentId,
      pendingContinuationContext: parsed.pendingContinuationContext ?? null,
    };
  } catch {
    return null;
  }
}

export function nativeTaskTurnEnvironment(
  binding: NativeTaskWorkspaceBinding,
) {
  return {
    environmentId: binding.environmentId,
    cwd: binding.executionDirectory,
    runtimeWorkspaceRoots: binding.runtimeWorkspaceRoots,
  };
}

export function clearNativeTaskPendingContext(
  binding: NativeTaskWorkspaceBinding,
): NativeTaskWorkspaceBinding {
  return binding.pendingContinuationContext
    ? { ...binding, pendingContinuationContext: null }
    : binding;
}
