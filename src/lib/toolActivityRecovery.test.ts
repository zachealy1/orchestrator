import { describe, expect, it } from "vitest";
import type { RunToolActivity } from "./toolActivity";
import { recoverRetriedToolFailures } from "./toolActivityRecovery";

function activity(
  id: string,
  label: string,
  status: RunToolActivity["status"],
  sequence: number,
): RunToolActivity {
  return {
    id,
    category: "browser",
    server: "node-repl",
    tool: "js",
    label,
    status,
    startedAt: null,
    completedAt: null,
    durationMs: 100,
    safeDetails: [],
    sequence,
  };
}

describe("tool activity retry recovery", () => {
  it("marks an earlier equivalent failure recovered after a success", () => {
    const byId = {
      failed: activity(
        "failed",
        "Could not inspect the game menu and runtime logs",
        "failed",
        10,
      ),
      completed: activity(
        "completed",
        "Inspected the game menu and runtime logs",
        "completed",
        20,
      ),
    };

    expect(recoverRetriedToolFailures(byId, ["failed", "completed"])).toMatchObject({
      failed: {
        status: "recovered",
        label: "Recovered after retry: inspect the game menu and runtime logs",
      },
      completed: { status: "completed" },
    });
  });

  it("uses persisted sequence when historical pages arrive newest first", () => {
    const byId = {
      completed: activity(
        "completed",
        "Inspected the game menu and runtime logs",
        "completed",
        20,
      ),
      failed: activity(
        "failed",
        "Could not inspect the game menu and runtime logs",
        "failed",
        10,
      ),
    };

    expect(
      recoverRetriedToolFailures(byId, ["completed", "failed"]).failed.status,
    ).toBe("recovered");
  });

  it("keeps later and non-equivalent failures unresolved", () => {
    const byId = {
      completed: activity(
        "completed",
        "Inspected the game menu and runtime logs",
        "completed",
        10,
      ),
      laterFailure: activity(
        "laterFailure",
        "Could not inspect the game menu and runtime logs",
        "failed",
        20,
      ),
      otherFailure: activity(
        "otherFailure",
        "Could not capture the game menu",
        "failed",
        5,
      ),
    };

    const recovered = recoverRetriedToolFailures(byId, [
      "completed",
      "laterFailure",
      "otherFailure",
    ]);
    expect(recovered.laterFailure.status).toBe("failed");
    expect(recovered.otherFailure.status).toBe("failed");
  });
});
