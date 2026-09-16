import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatTitleCoordinator,
  type ChatTitleDependencies,
} from "./ChatTitleCoordinator";
import type { ChatRecord } from "./types";

const input = {
  chatId: 7,
  workspacePath: "/repo",
  accountId: 0,
  model: null,
  initialPrompt: "Fix branch names",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  let chat = {
    id: 7,
    title: "Generating title...",
    title_generation_state: "pending",
    title_fallback: "Fix branch names",
  } as ChatRecord;
  const generation = deferred<{ title: string }>();
  const dependencies = {
    load: vi.fn(async () => chat),
    claim: vi.fn(async () => {
      chat = { ...chat, title_generation_state: "generating" };
      return true;
    }),
    generate: vi.fn(() => generation.promise),
    complete: vi.fn(async (_id: number, title: string) => {
      chat = { ...chat, title, title_generation_state: "complete" };
      return true;
    }),
    fail: vi.fn(async () => {
      chat = {
        ...chat,
        title: chat.title_fallback!,
        title_generation_state: "failed",
      };
      return true;
    }),
  } satisfies ChatTitleDependencies;
  return {
    coordinator: new ChatTitleCoordinator(),
    dependencies,
    generation,
    setChat: (update: Partial<ChatRecord>) => {
      chat = { ...chat, ...update };
    },
  };
}
afterEach(() => vi.useRealTimers());

describe("ChatTitleCoordinator", () => {
  it("starts pending generation independently and shares one persisted result across callers", async () => {
    const { coordinator, dependencies, generation } = setup();
    const first = coordinator.ensure(input, dependencies);
    const second = coordinator.ensure(input, dependencies);
    const done = vi.fn();
    void first.then(done);
    await vi.waitFor(() =>
      expect(dependencies.generate).toHaveBeenCalledOnce(),
    );
    expect(done).not.toHaveBeenCalled();
    expect(dependencies.complete).not.toHaveBeenCalled();
    generation.resolve({ title: "**Fix Readable Branch Names.**" });
    for (const result of await Promise.all([first, second]))
      expect(result.title).toBe("Fix Readable Branch Names");
    expect(dependencies.claim).toHaveBeenCalledOnce();
    expect(dependencies.complete).toHaveBeenCalledOnce();
  });

  it.each(["native 30-second timeout", "generation failed"])(
    "uses the persisted fallback after %s",
    async (message) => {
      const { coordinator, dependencies, generation } = setup();
      const ready = coordinator.ensure(input, dependencies);
      await vi.waitFor(() =>
        expect(dependencies.generate).toHaveBeenCalledOnce(),
      );
      generation.reject(new Error(message));
      expect((await ready).title).toBe("Fix branch names");
      expect(dependencies.fail).toHaveBeenCalledOnce();
    },
  );

  it("uses fallback after an invalid title", async () => {
    const { coordinator, dependencies, generation } = setup();
    generation.resolve({ title: "" });
    expect((await coordinator.ensure(input, dependencies)).title).toBe(
      "Fix branch names",
    );
  });

  it("preserves a manual edit made during generation", async () => {
    const { coordinator, dependencies, generation, setChat } = setup();
    const ready = coordinator.ensure(input, dependencies);
    await vi.waitFor(() =>
      expect(dependencies.generate).toHaveBeenCalledOnce(),
    );
    setChat({
      title: "Manual branch title",
      title_generation_state: "complete",
      title_manually_edited: 1,
    });
    dependencies.complete.mockResolvedValue(false);
    generation.resolve({ title: "Generated branch title" });
    expect((await ready).title).toBe("Manual branch title");
  });

  it("propagates persistence failure without replacing a successful generated title with fallback", async () => {
    const { coordinator, dependencies, generation } = setup();
    dependencies.complete.mockRejectedValue(new Error("database unavailable"));
    generation.resolve({ title: "Fix readable names" });
    await expect(coordinator.ensure(input, dependencies)).rejects.toThrow(
      "database unavailable",
    );
    expect(dependencies.fail).not.toHaveBeenCalled();
  });

  it("rejects a fallback that was not persisted", async () => {
    const { coordinator, dependencies, generation } = setup();
    dependencies.fail.mockResolvedValue(false);
    generation.resolve({ title: "" });
    await expect(coordinator.ensure(input, dependencies)).rejects.toThrow(
      "could not be saved",
    );
  });

  it("cancels one waiter without disrupting another or generating twice", async () => {
    const { coordinator, dependencies, generation } = setup();
    const abort = new AbortController();
    const cancelled = coordinator.ensure(input, dependencies, abort.signal);
    const ready = coordinator.ensure(input, dependencies);
    abort.abort();
    await expect(cancelled).rejects.toThrow("cancelled");
    generation.resolve({ title: "Fix branch names" });
    expect((await ready).title).toBe("Fix branch names");
    expect(dependencies.generate).toHaveBeenCalledOnce();
  });

  it("accepts startup recovery without restarting generation", async () => {
    const { coordinator, dependencies, setChat } = setup();
    setChat({ title: "Recovered fallback", title_generation_state: "failed" });
    expect((await coordinator.ensure(input, dependencies)).title).toBe(
      "Recovered fallback",
    );
    expect(dependencies.claim).not.toHaveBeenCalled();
  });

  it("observes another owner's result and bounds an abandoned owner's wait", async () => {
    vi.useFakeTimers();
    const { coordinator, dependencies, setChat } = setup();
    dependencies.claim.mockResolvedValue(false);
    setChat({ title_generation_state: "generating" });
    const first = coordinator.ensure(input, dependencies);
    await vi.advanceTimersByTimeAsync(100);
    setChat({
      title: "Other window title",
      title_generation_state: "complete",
    });
    await vi.advanceTimersByTimeAsync(100);
    expect((await first).title).toBe("Other window title");
    setChat({
      title: "Generating title...",
      title_generation_state: "generating",
    });
    const second = coordinator.ensure(input, dependencies);
    await vi.advanceTimersByTimeAsync(35_100);
    expect((await second).title).toBe("Fix branch names");
    expect(dependencies.generate).not.toHaveBeenCalled();
  });
});
