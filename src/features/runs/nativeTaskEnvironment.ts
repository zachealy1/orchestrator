import type { NativeTaskWorkspaceBinding } from "../../lib/nativeTaskWorkspaceBinding";
import type { CodexAccessSettings } from "../../lib/codexAccess";
import { normalizeWorkspacePath } from "../workspaces/workspaceFiles";

type NativeTaskEnvironmentRpc = (
  method: string,
  params: Record<string, unknown>,
) => Promise<unknown>;

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
