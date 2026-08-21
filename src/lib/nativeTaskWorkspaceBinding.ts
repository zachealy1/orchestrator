import type { KanbanGitBinding } from "../features/kanban/api";

export const NATIVE_TASK_WORKSPACE_BINDING_VERSION = 4;

export type NativeTaskSourceRootAssociation = "pending" | "source-root";

export type NativeTaskWorkspaceBinding = {
  version: typeof NATIVE_TASK_WORKSPACE_BINDING_VERSION;
  kind: "kanban" | "continuation";
  sourceWorkspacePath: string;
  executionDirectory: string;
  runtimeWorkspaceRoots: string[];
  pendingContinuationContext: string | null;
  sourceRootAssociation: NativeTaskSourceRootAssociation;
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
  sourceRootAssociation?: NativeTaskSourceRootAssociation;
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
    pendingContinuationContext: input.pendingContinuationContext ?? null,
    sourceRootAssociation: input.sourceRootAssociation ?? "pending",
  };
}

export function createContinuationNativeTaskWorkspaceBinding(input: {
  chatId: number;
  sourceWorkspacePath: string;
  executionDirectory?: string | null;
  runtimeWorkspaceRoots?: string[];
  pendingContinuationContext?: string | null;
  sourceRootAssociation?: NativeTaskSourceRootAssociation;
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
    pendingContinuationContext: input.pendingContinuationContext ?? null,
    sourceRootAssociation: input.sourceRootAssociation ?? "pending",
  };
}

export function parseNativeTaskWorkspaceBinding(
  value: string | null | undefined,
): NativeTaskWorkspaceBinding | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Omit<
      Partial<NativeTaskWorkspaceBinding>,
      "version"
    > & {
      version?: number;
      environmentId?: unknown;
      catalogRegistration?: unknown;
      projectId?: unknown;
      sourceRootAssociation?: unknown;
    };
    if (
      (parsed.version !== 1 &&
        parsed.version !== 2 &&
        parsed.version !== 3 &&
        parsed.version !== NATIVE_TASK_WORKSPACE_BINDING_VERSION) ||
      (parsed.kind !== "kanban" && parsed.kind !== "continuation") ||
      typeof parsed.sourceWorkspacePath !== "string" ||
      !parsed.sourceWorkspacePath ||
      typeof parsed.executionDirectory !== "string" ||
      !parsed.executionDirectory ||
      !Array.isArray(parsed.runtimeWorkspaceRoots) ||
      !parsed.runtimeWorkspaceRoots.every(
        (path) => typeof path === "string" && Boolean(path),
      ) ||
      !(
        parsed.pendingContinuationContext === null ||
        typeof parsed.pendingContinuationContext === "string" ||
        parsed.pendingContinuationContext === undefined
      ) ||
      !(
        parsed.catalogRegistration === undefined ||
        parsed.catalogRegistration === "pending" ||
        parsed.catalogRegistration === "source-workspace"
      ) ||
      !(
        parsed.sourceRootAssociation === undefined ||
        parsed.sourceRootAssociation === "pending" ||
        parsed.sourceRootAssociation === "source-root"
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
      pendingContinuationContext: parsed.pendingContinuationContext ?? null,
      sourceRootAssociation:
        parsed.version === NATIVE_TASK_WORKSPACE_BINDING_VERSION &&
        parsed.sourceRootAssociation === "source-root"
          ? "source-root"
          : "pending",
    };
  } catch {
    return null;
  }
}

export function nativeTaskExecutionOverrides(
  binding: NativeTaskWorkspaceBinding,
) {
  return {
    cwd: binding.executionDirectory,
  };
}

export function clearNativeTaskPendingContext(
  binding: NativeTaskWorkspaceBinding,
): NativeTaskWorkspaceBinding {
  return binding.pendingContinuationContext
    ? { ...binding, pendingContinuationContext: null }
    : binding;
}

export function markNativeTaskSourceRootAssociated(
  binding: NativeTaskWorkspaceBinding,
): NativeTaskWorkspaceBinding {
  return binding.sourceRootAssociation === "source-root"
    ? binding
    : { ...binding, sourceRootAssociation: "source-root" };
}
