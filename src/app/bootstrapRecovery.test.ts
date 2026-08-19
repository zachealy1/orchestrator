import { describe, expect, it } from "vitest";
import { collectStartupWarningStages } from "./bootstrapRecovery";

describe("startup recovery", () => {
  it("settles one recovery stage before starting the next", async () => {
    const events: string[] = [];

    const warnings = await collectStartupWarningStages([
      () => [
        Promise.resolve().then(() => {
          events.push("runs");
        }),
        Promise.resolve().then(() => {
          events.push("queues");
        }),
      ],
      () => [
        Promise.resolve().then(() => {
          events.push("kanban");
        }),
      ],
    ]);

    expect(warnings).toEqual([]);
    expect(events.slice(0, 2)).toEqual(expect.arrayContaining(["runs", "queues"]));
    expect(events[2]).toBe("kanban");
  });

  it("continues to later stages after recording a failure", async () => {
    let kanbanRecovered = false;

    const warnings = await collectStartupWarningStages([
      () => [Promise.reject(new Error("Run recovery failed"))],
      () => [
        Promise.resolve().then(() => {
          kanbanRecovered = true;
        }),
      ],
    ]);

    expect(warnings).toEqual(["Run recovery failed"]);
    expect(kanbanRecovered).toBe(true);
  });
});
