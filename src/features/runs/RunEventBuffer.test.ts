import { describe, expect, it, vi } from "vitest";
import type { RunEventInput } from "../../data/repositories";
import { RunEventBuffer } from "./RunEventBuffer";

const event = (sequence: number): RunEventInput => ({
  runId: 1,
  sequence,
  eventType: "notification",
  method: "turn/updated",
  payload: { sequence },
});

describe("RunEventBuffer", () => {
  it("batches queued events in insertion order", async () => {
    vi.useFakeTimers();
    const writes: RunEventInput[][] = [];
    const buffer = new RunEventBuffer(async (batch) => {
      writes.push(batch);
    });

    buffer.enqueue(event(1));
    buffer.enqueue(event(2));
    await vi.advanceTimersByTimeAsync(100);

    expect(writes).toEqual([[event(1), event(2)]]);
    buffer.dispose();
    vi.useRealTimers();
  });

  it("flushes immediately at the batch limit without overlapping writes", async () => {
    const order: number[] = [];
    const buffer = new RunEventBuffer(
      async (batch) => {
        order.push(...batch.map((item) => item.sequence));
      },
      { maxBatchSize: 2 },
    );

    buffer.enqueue(event(1));
    buffer.enqueue(event(2));
    await buffer.flush();
    buffer.enqueue(event(3));
    await buffer.flush();

    expect(order).toEqual([1, 2, 3]);
    buffer.dispose();
  });
});
