import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CodexStreamScheduler,
  type StreamNotification,
  type StreamClock,
} from "./CodexStreamScheduler";

const text = (
  delta: string,
  threadId = "thread",
  method = "item/agentMessage/delta",
  extra = {},
): StreamNotification => ({
  profileKey: "default",
  message: {
    method,
    params: { threadId, turnId: "turn", itemId: "item", delta, ...extra },
  },
});
function fixture() {
  let animate = true;
  let changed = () => {};
  const timer = (callback: () => void, ms: number) => {
    const id = setTimeout(callback, ms);
    return () => clearTimeout(id);
  };
  const clock: StreamClock = {
    timer,
    frame: (callback) => timer(callback, 16),
    animate: () => animate,
    subscribe: (callback) => {
      changed = callback;
      return () => {
        changed = () => {};
      };
    },
  };
  const scheduler = new CodexStreamScheduler(clock);
  const batches: StreamNotification[][] = [];
  const publish = (batch: StreamNotification[]) => batches.push(batch);
  return {
    scheduler,
    batches,
    publish,
    hide: () => {
      animate = false;
      changed();
    },
    disableAnimation: () => {
      animate = false;
    },
    contents: () =>
      batches
        .flat()
        .map((value) => value.message.params?.delta)
        .join(""),
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe("CodexStreamScheduler", () => {
  it("smooths bursty text and preserves characters across chunk boundaries", () => {
    const f = fixture();
    f.scheduler.enqueue(
      text("a".repeat(23) + "😀" + "b".repeat(40)),
      f.publish,
    );
    vi.advanceTimersByTime(16);
    expect(f.contents()).toBe("a".repeat(23) + "😀");
    f.scheduler.enqueue(text("tail"), f.publish);
    vi.runAllTimers();
    expect(f.contents()).toBe("a".repeat(23) + "😀" + "b".repeat(40) + "tail");
  });
  it("keeps profiles, threads, targets, and reasoning sections separate", () => {
    const f = fixture();
    for (const value of [
      text("one", "a", "item/reasoning/summaryTextDelta", { summaryIndex: 0 }),
      text("two", "a", "item/reasoning/summaryTextDelta", { summaryIndex: 1 }),
      text("raw", "a", "item/reasoning/textDelta", { contentIndex: 0 }),
      text("other", "b"),
      { ...text("profile", "b"), profileKey: "account:2" as const },
    ])
      f.scheduler.enqueue(value, f.publish);
    vi.advanceTimersByTime(16);
    expect(f.batches[0]).toHaveLength(5);
    expect(f.contents()).toBe("onetworawotherprofile");
  });
  it("publishes summaries together and batches output for 50ms", () => {
    const f = fixture();
    f.scheduler.enqueue(
      text("s".repeat(200), "thread", "item/reasoning/summaryTextDelta"),
      f.publish,
    );
    f.scheduler.enqueue(
      text("stdout", "thread", "item/commandExecution/outputDelta"),
      f.publish,
    );
    f.scheduler.enqueue(
      text(" tail", "thread", "item/commandExecution/outputDelta"),
      f.publish,
    );
    vi.advanceTimersByTime(49);
    expect(f.contents()).toBe("s".repeat(200));
    vi.advanceTimersByTime(1);
    expect(f.contents()).toBe("s".repeat(200) + "stdout tail");
  });
  it("drains within eight frames and serializes completion without blocking another run", async () => {
    const f = fixture();
    const order: string[] = [];
    f.scheduler.enqueue(text("x".repeat(4000)), f.publish);
    const completion = text("", "thread", "item/completed");
    const done = f.scheduler.dispatch(completion, async () => {
      await f.scheduler.before(completion);
      order.push("completed");
    });
    const later = f.scheduler.dispatch(text("later"), () => {
      order.push("later");
    });
    await f.scheduler.dispatch(text("other", "other"), () => {
      order.push("other");
    });
    expect(order).toEqual(["other"]);
    await vi.advanceTimersByTimeAsync(16 * 8);
    await Promise.all([done, later]);
    expect(f.contents()).toBe("x".repeat(4000));
    expect(order).toEqual(["other", "completed", "later"]);
  });
  it.each(["hidden", "reduced motion"])(
    "flushes immediately when animation becomes unavailable: %s",
    () => {
      const f = fixture();
      f.scheduler.enqueue(text("x".repeat(4000)), f.publish);
      f.hide();
      expect(f.contents()).toBe("x".repeat(4000));
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("uses a 16ms fallback and bypasses animation at approval and error boundaries", async () => {
    const f = fixture();
    f.disableAnimation();
    f.scheduler.enqueue(text("x".repeat(100)), f.publish);
    vi.advanceTimersByTime(16);
    expect(f.contents()).toHaveLength(100);
    f.scheduler.enqueue(text("approval"), f.publish);
    await f.scheduler.dispatch(
      {
        ...text(""),
        message: {
          id: 1,
          method: "item/commandExecution/requestApproval",
          params: { threadId: "thread" },
        },
      },
      () => {},
    );
    expect(f.contents()).toBe("x".repeat(100) + "approval");
    f.scheduler.enqueue(text("error"), f.publish);
    await f.scheduler.dispatch(text("", "thread", "error"), () => {});
    expect(f.contents()).toBe("x".repeat(100) + "approvalerror");
  });
  it("cancels obsolete reveal on recovery and flushes accepted text on disposal", () => {
    const f = fixture();
    f.scheduler.enqueue(text("obsolete"), f.publish);
    f.scheduler.reset(JSON.stringify(["default", "thread"]));
    vi.runAllTimers();
    expect(f.contents()).toBe("");
    f.scheduler.enqueue(text("retained"), f.publish);
    f.scheduler.dispose();
    f.scheduler.enqueue(text("ignored"), f.publish);
    vi.runAllTimers();
    expect(f.contents()).toBe("retained");
    expect(vi.getTimerCount()).toBe(0);
  });
});

it("releases lifecycle ordering after application while persistence is still pending", async () => {
  const f = fixture();
  let finish!: () => void;
  const persistence = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const value = text("", "thread", "item/completed");
  const first = f.scheduler.dispatch(value, async () => {
    f.scheduler.applied(value.message);
    await persistence;
  });
  const second = vi.fn();
  await f.scheduler.dispatch(text("later"), second);
  expect(second).toHaveBeenCalledTimes(1);
  finish();
  await first;
});
