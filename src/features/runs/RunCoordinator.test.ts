import { describe, expect, it, vi } from "vitest";
import { RunCoordinator } from "./RunCoordinator";

describe("RunCoordinator", () => {
  it("tracks the explicit setup lifecycle", () => {
    const coordinator = new RunCoordinator();
    coordinator.begin("entry-1");
    coordinator.transition("entry-1", "preparing");
    coordinator.transition("entry-1", "connecting");
    coordinator.transition("entry-1", "persisting");
    coordinator.transition("entry-1", "preparing-interactions");
    coordinator.transition("entry-1", "starting-thread");
    coordinator.transition("entry-1", "starting-turn");
    coordinator.transition("entry-1", "active");
    expect(coordinator.get("entry-1")?.phase).toBe("active");
  });

  it("rejects invalid transitions and duplicate active registrations", () => {
    const coordinator = new RunCoordinator();
    coordinator.begin("entry-1");
    expect(() => coordinator.begin("entry-1")).toThrow(/already coordinated/i);
    expect(() => coordinator.transition("entry-1", "active")).toThrow(
      /invalid run transition/i,
    );
  });

  it("publishes rollback failures and permits key reuse after termination", () => {
    const coordinator = new RunCoordinator();
    const listener = vi.fn();
    coordinator.subscribe(listener);
    coordinator.begin("entry-1");
    coordinator.transition("entry-1", "preparing");
    coordinator.transition("entry-1", "rolling-back");
    coordinator.transition("entry-1", "failed", "preflight failed");
    expect(coordinator.get("entry-1")).toMatchObject({
      phase: "failed",
      error: "preflight failed",
    });
    coordinator.begin("entry-1");
    expect(coordinator.get("entry-1")?.phase).toBe("scheduled");
    expect(listener).toHaveBeenCalled();
  });
});
