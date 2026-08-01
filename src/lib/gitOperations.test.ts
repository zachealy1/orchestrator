import { describe, expect, it } from "vitest";
import {
  clearRunningGitOperation,
  GIT_OPERATION_RECOVERY_STORAGE_KEY,
  gitOperationFailureCopy,
  gitOperationRetryLabel,
  gitOperationSuccessCopy,
  persistRunningGitOperation,
  restoreInterruptedGitOperations,
  type WorkspaceGitOperationRequest,
} from "./gitOperations";

const pushRequest: WorkspaceGitOperationRequest = {
  workspaceId: 1,
  workspacePath: "/repo/app",
  workspaceLabel: "app",
  repositoryPath: "/repo/app",
  repositoryLabel: "app",
  kind: "push",
  commitMessage: null,
  includeUnstaged: true,
  changeKey: null,
};

describe("git operations", () => {
  it("uses concise actionable copy for rejected pushes", () => {
    expect(
      gitOperationFailureCopy(
        "pushing",
        new Error("failed to push some refs (non-fast-forward)"),
      ),
    ).toEqual({
      title: "Push failed",
      detail:
        "Push was rejected. Pull or resolve the remote changes, then try again.",
    });
  });

  it("explains when a combined operation committed before push failure", () => {
    expect(
      gitOperationFailureCopy(
        "pushing",
        new Error("authentication failed"),
        true,
      ),
    ).toEqual({
      title: "Push failed",
      detail:
        "The commit succeeded, but the push failed. Git authentication failed. Sign in or update your credentials, then try again.",
    });
  });

  it.each([
    [
      "timed out after 60 seconds",
      "Push timed out. Check your connection and try again.",
    ],
    [
      "CONFLICT: unmerged files remain",
      "Git has unresolved conflicts. Resolve them, then try again.",
    ],
    [
      "operation was cancelled",
      "Push was cancelled. Try again when ready.",
    ],
  ])("normalizes %s failures", (message, expected) => {
    expect(gitOperationFailureCopy("pushing", new Error(message)).detail).toBe(
      expected,
    );
  });

  it("keeps success and retry labels specific to the operation", () => {
    expect(gitOperationSuccessCopy("commit-and-push").title).toBe(
      "Commit and push complete",
    );
    expect(gitOperationRetryLabel(pushRequest)).toBe("Retry push");
  });

  it("restores interrupted operations as review-only warnings", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };

    persistRunningGitOperation(pushRequest, "pushing", storage);
    const restored = restoreInterruptedGitOperations(storage)[1];

    expect(restored).toMatchObject({
      status: "failed",
      title: "Git operation interrupted",
      retryRequest: null,
    });
    expect(restored?.request.commitMessage).toBeNull();

    clearRunningGitOperation(1, storage);
    expect(values.has(GIT_OPERATION_RECOVERY_STORAGE_KEY)).toBe(false);
  });
});
