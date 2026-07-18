import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  load: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: mocks.load,
  },
}));

import { appendRunEvents, type RunEventInput } from "./db";

describe("run event persistence", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.execute.mockResolvedValue({ rowsAffected: 1 });
    mocks.load.mockReset();
    mocks.load.mockResolvedValue({
      execute: mocks.execute,
      select: vi.fn(),
    });
  });

  it("persists high-volume run events in bounded multi-row inserts", async () => {
    const events: RunEventInput[] = Array.from({ length: 101 }, (_, index) => ({
      runId: 7,
      sequence: index + 1,
      eventType: "notification",
      method: "item/agentMessage/delta",
      payload: { params: { delta: String(index) } },
    }));

    await appendRunEvents(events);

    expect(mocks.execute).toHaveBeenCalledTimes(2);
    const [firstQuery, firstValues] = mocks.execute.mock.calls[0] ?? [];
    const [secondQuery, secondValues] = mocks.execute.mock.calls[1] ?? [];

    expect(firstQuery).toContain("VALUES ($1, $2, $3, $4, $5)");
    expect(firstQuery).toContain("($496, $497, $498, $499, $500)");
    expect(firstValues).toHaveLength(500);
    expect(firstValues?.slice(0, 5)).toEqual([
      7,
      1,
      "notification",
      "item/agentMessage/delta",
      JSON.stringify(events[0]?.payload),
    ]);
    expect(secondQuery).toContain("VALUES ($1, $2, $3, $4, $5)");
    expect(secondValues).toEqual([
      7,
      101,
      "notification",
      "item/agentMessage/delta",
      JSON.stringify(events[100]?.payload),
    ]);
  });
});
