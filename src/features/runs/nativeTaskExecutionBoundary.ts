import type { CodexMessage } from "../codex/types";
import type { NativeTaskWorkspaceBinding } from "../../lib/nativeTaskWorkspaceBinding";
import { normalizeWorkspacePath } from "../workspaces/workspaceFiles";

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function pathIsWithin(path: string, root: string) {
  return path === root || path.startsWith(`${root}/`);
}

export type NativeTaskCommandVerification =
  | { commandObserved: false; error: null }
  | { commandObserved: true; error: string | null };

export function verifyNativeTaskCommandEvent(
  binding: NativeTaskWorkspaceBinding,
  message: CodexMessage,
): NativeTaskCommandVerification {
  if (message.method !== "item/started" && message.method !== "item/completed") {
    return { commandObserved: false, error: null };
  }
  const item = readObject(readObject(message.params).item);
  if (item.type !== "commandExecution") {
    return { commandObserved: false, error: null };
  }

  const cwd = typeof item.cwd === "string" ? normalizeWorkspacePath(item.cwd) : "";
  const roots = [
    binding.executionDirectory,
    ...binding.runtimeWorkspaceRoots,
  ].map(normalizeWorkspacePath);
  if (!cwd) {
    return {
      commandObserved: true,
      error:
        "Codex reported a command without a verifiable card-worktree directory.",
    };
  }
  if (!roots.some((root) => pathIsWithin(cwd, root))) {
    return {
      commandObserved: true,
      error: `Codex attempted to run a command outside the isolated card worktree: ${cwd}`,
    };
  }
  return { commandObserved: true, error: null };
}
