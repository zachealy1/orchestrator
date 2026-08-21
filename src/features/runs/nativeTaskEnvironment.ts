import {
  markNativeTaskEnvironmentVerified,
  type NativeTaskWorkspaceBinding,
} from "../../lib/nativeTaskWorkspaceBinding";
import type { CodexAccessSettings } from "../../lib/codexAccess";
import { normalizeWorkspacePath } from "../workspaces/workspaceFiles";

type NativeTaskEnvironmentRpc = (
  method: string,
  params: Record<string, unknown>,
) => Promise<unknown>;

function normalizedPaths(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((path): path is string => typeof path === "string")
    .map(normalizeWorkspacePath)
    .sort();
}

export function verifyNativeTaskThreadEnvironment(input: {
  binding: NativeTaskWorkspaceBinding;
  threadId: string;
  response: unknown;
}) {
  const response = input.response as {
    cwd?: unknown;
    runtimeWorkspaceRoots?: unknown;
    thread?: { id?: unknown; cwd?: unknown };
  };
  const expectedSource = normalizeWorkspacePath(
    input.binding.sourceWorkspacePath,
  );
  const actualThreadId =
    typeof response.thread?.id === "string" ? response.thread.id : null;
  const actualThreadSource =
    typeof response.thread?.cwd === "string"
      ? normalizeWorkspacePath(response.thread.cwd)
      : "";
  const actualResponseSource =
    typeof response.cwd === "string" ? normalizeWorkspacePath(response.cwd) : "";
  const expectedRoots = normalizedPaths(input.binding.runtimeWorkspaceRoots);
  const actualRoots = normalizedPaths(response.runtimeWorkspaceRoots);

  if (actualThreadId !== input.threadId) {
    throw new Error("Codex returned a different thread for the card environment.");
  }
  if (
    actualThreadSource !== expectedSource ||
    actualResponseSource !== expectedSource
  ) {
    throw new Error(
      "Codex did not retain the source workspace for this Kanban task.",
    );
  }
  if (
    expectedRoots.length !== actualRoots.length ||
    expectedRoots.some((path, index) => path !== actualRoots[index])
  ) {
    throw new Error(
      "Codex returned runtime workspace roots that do not match the card worktrees.",
    );
  }

  return markNativeTaskEnvironmentVerified(input.binding, input.threadId);
}

export async function validateNativeTaskExecutionEnvironment(input: {
  binding: NativeTaskWorkspaceBinding;
  permissionProfile: CodexAccessSettings["permissionProfile"];
  rpc: NativeTaskEnvironmentRpc;
  ensureActive: () => void;
}) {
  try {
    const roots = [
      ...new Set([
        input.binding.executionDirectory,
        ...input.binding.runtimeWorkspaceRoots,
      ]),
    ];
    for (const root of roots) {
      const metadata = (await input.rpc("fs/getMetadata", {
        path: root,
      })) as Record<string, unknown>;
      input.ensureActive();
      if (metadata.isDirectory !== true) {
        throw new Error(`The isolated worktree is unavailable: ${root}`);
      }
    }

    const probe = (await input.rpc("command/exec", {
      command: ["/bin/pwd"],
      cwd: input.binding.executionDirectory,
      timeoutMs: 5_000,
      outputBytesCap: 4_096,
      permissionProfile: input.permissionProfile,
    })) as {
      exitCode?: number;
      stdout?: string;
      stderr?: string;
    };
    input.ensureActive();
    const expectedDirectory = normalizeWorkspacePath(
      input.binding.executionDirectory,
    );
    const actualDirectory = normalizeWorkspacePath(
      probe.stdout?.trim() ?? "",
    );
    if (probe.exitCode !== 0 || actualDirectory !== expectedDirectory) {
      const detail = probe.stderr?.trim();
      throw new Error(
        `The isolated worktree terminal is unavailable${
          detail ? `: ${detail}` : "."
        }`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.name === "RunStoppedError") {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      message.startsWith("The isolated worktree")
        ? message
        : `The isolated worktree execution environment is unavailable: ${message}`,
    );
  }
}
