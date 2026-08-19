import { describe, expect, it, vi } from "vitest";
import {
  KanbanAttemptStateController,
  acknowledgeKanbanStopWithTurn,
  createPendingKanbanStopRequest,
  kanbanStatusAfterFailedStop,
  type KanbanAttemptControl,
} from "./attemptLifecycle";

function control(): KanbanAttemptControl {
  return {
    accountId: 3,
    profileKey: "account:3",
    runId: 21,
    taskId: 13,
    threadId: "thread-1",
    turnId: "turn-1",
    kanbanAttempt: {
      cardId: "card-1",
      attemptId: "attempt-1",
      generation: 2,
      executionRoot: "/cards/card-1/root",
      eventSequence: 4,
    },
  };
}

describe("Kanban attempt state controller", () => {
  it("persists a monotonic event sequence and refreshes the board", async () => {
    const updateAttempt = vi.fn().mockResolvedValue({});
    const onBoardChanged = vi.fn();
    const run = control();
    const controller = new KanbanAttemptStateController({
      updateAttempt,
      createOperationId: () => "operation-1",
      onBoardChanged,
      onPersistenceError: vi.fn(),
    });

    await expect(controller.persist(run, "running")).resolves.toEqual({
      persisted: true,
      error: null,
    });
    expect(run.kanbanAttempt?.eventSequence).toBe(5);
    expect(updateAttempt).toHaveBeenCalledWith({
      cardId: "card-1",
      attemptId: "attempt-1",
      generation: 2,
      sequence: 5,
      status: "running",
      runId: 21,
      taskId: 13,
      threadId: "thread-1",
      turnId: "turn-1",
      executionRoot: "/cards/card-1/root",
      error: null,
      completedPlan: null,
      operationId: "operation-1",
    });
    expect(onBoardChanged).toHaveBeenCalledOnce();
  });

  it("retries a completed plan as one immutable terminal request", async () => {
    const updateAttempt = vi
      .fn()
      .mockRejectedValueOnce(new Error("database busy"))
      .mockResolvedValueOnce({});
    const controller = new KanbanAttemptStateController({
      updateAttempt,
      createOperationId: () => "operation-plan",
      onBoardChanged: vi.fn(),
      onPersistenceError: vi.fn(),
    });
    const completedPlan = {
      itemId: "plan-item-1",
      text: "# Implementation plan\n\nShip it.",
    };

    await expect(
      controller.persist(control(), "completed", null, {
        retryCount: 1,
        completedPlan,
      }),
    ).resolves.toEqual({ persisted: true, error: null });
    expect(updateAttempt).toHaveBeenCalledTimes(2);
    expect(updateAttempt.mock.calls[0][0]).toEqual(updateAttempt.mock.calls[1][0]);
    expect(updateAttempt.mock.calls[0][0]).toEqual(
      expect.objectContaining({ completedPlan, operationId: "operation-plan" }),
    );
  });

  it("retries the same idempotent request and reports terminal failure", async () => {
    const updateAttempt = vi.fn().mockRejectedValue(new Error("database busy"));
    const onBoardChanged = vi.fn();
    const onPersistenceError = vi.fn();
    const controller = new KanbanAttemptStateController({
      updateAttempt,
      createOperationId: () => "operation-2",
      onBoardChanged,
      onPersistenceError,
    });

    await expect(
      controller.persist(control(), "failed", "Protocol error", {
        retryCount: 1,
      }),
    ).resolves.toEqual({ persisted: false, error: "database busy" });
    expect(updateAttempt).toHaveBeenCalledTimes(2);
    expect(updateAttempt.mock.calls[0][0]).toEqual(updateAttempt.mock.calls[1][0]);
    expect(onPersistenceError).toHaveBeenCalledWith("database busy");
    expect(onBoardChanged).toHaveBeenCalledOnce();
  });

  it("treats controls without a Kanban binding as already persisted", async () => {
    const updateAttempt = vi.fn();
    const controller = new KanbanAttemptStateController({
      updateAttempt,
      onBoardChanged: vi.fn(),
    });
    const run = { ...control(), kanbanAttempt: null };

    await expect(controller.persist(run, "running")).resolves.toEqual({
      persisted: true,
      error: null,
    });
    expect(updateAttempt).not.toHaveBeenCalled();
  });
});

describe("Kanban pending stop primitives", () => {
  it("settles once and exposes the first acknowledgement", async () => {
    const request = createPendingKanbanStopRequest();
    request.settle({ acknowledged: true });
    request.settle({ acknowledged: false, error: "late failure" });

    await expect(request.promise).resolves.toEqual({ acknowledged: true });
    expect(request.settled).toBe(true);
  });

  it("interrupts a turn once and records the acknowledged turn id", async () => {
    const run = control();
    const request = createPendingKanbanStopRequest();
    let finishInterrupt!: (turnId: string) => void;
    const interruptTurn = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finishInterrupt = resolve;
        }),
    );

    const first = acknowledgeKanbanStopWithTurn(
      run,
      request,
      "thread-1",
      "turn-1",
      interruptTurn,
    );
    const second = acknowledgeKanbanStopWithTurn(
      run,
      request,
      "thread-1",
      "turn-1",
      interruptTurn,
    );
    finishInterrupt("turn-confirmed");

    await expect(first).resolves.toEqual({ acknowledged: true });
    await expect(second).resolves.toEqual({ acknowledged: true });
    expect(interruptTurn).toHaveBeenCalledOnce();
    expect(run.turnId).toBe("turn-confirmed");
  });

  it("maps failed stops back to the live attention state", () => {
    expect(
      kanbanStatusAfterFailedStop({
        serverRequests: [
          {
            id: 1,
            method: "item/tool/requestUserInput",
            params: {
              threadId: "thread-1",
              turnId: "turn-1",
              itemId: "item-1",
              questions: [],
            },
          },
        ],
        approvalRequests: [],
      }),
    ).toBe("waiting_user");
    expect(
      kanbanStatusAfterFailedStop({
        serverRequests: [{ method: "unknown" }],
        approvalRequests: [],
      }),
    ).toBe("running");
    expect(
      kanbanStatusAfterFailedStop({ serverRequests: [], approvalRequests: [{}] }),
    ).toBe("waiting_approval");
    expect(
      kanbanStatusAfterFailedStop({ serverRequests: [], approvalRequests: [] }),
    ).toBe("running");
  });
});
