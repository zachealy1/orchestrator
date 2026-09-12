import type { CodexMessage, CodexProfileKey } from "./types";
import {
  streamIdentity,
  streamIdentityKey,
  streamRunKey,
} from "../../lib/streamIdentity";

export type StreamNotification = {
  ownerId?: string;
  profileKey: CodexProfileKey;
  message: CodexMessage;
};
type Cancel = () => void;
export type StreamClock = {
  frame: (callback: () => void) => Cancel;
  timer: (callback: () => void, ms: number) => Cancel;
  animate: () => boolean;
  subscribe: (callback: () => void) => Cancel;
};
function browserClock(): StreamClock {
  return {
    frame: (callback) => {
      const id = requestAnimationFrame(callback);
      return () => cancelAnimationFrame(id);
    },
    timer: (callback, ms) => {
      const id = setTimeout(callback, ms);
      return () => clearTimeout(id);
    },
    animate: () =>
      typeof requestAnimationFrame === "function" &&
      document.visibilityState !== "hidden" &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    subscribe: (callback) => {
      const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
      document.addEventListener("visibilitychange", callback);
      media?.addEventListener("change", callback);
      return () => {
        document.removeEventListener("visibilitychange", callback);
        media?.removeEventListener("change", callback);
      };
    },
  };
}

/** Presentation buffering is independent of recording the original protocol events. */
export class CodexStreamScheduler {
  private buffers = new Map<string, StreamNotification>();
  private publish: ((messages: StreamNotification[]) => void) | null = null;
  private cancelFrame: Cancel | null = null;
  private cancelOutput: Cancel | null = null;
  private unsubscribe: Cancel | null = null;
  private drains = new Map<string, { frames: number; resolve: () => void }>();
  private lanes = new Map<string, Promise<void>>();
  private epochs = new Map<string, number>();
  private releases = new WeakMap<CodexMessage, () => void>();
  readonly recorded = new WeakSet<CodexMessage>();
  private disposed = false;
  constructor(private clock: StreamClock = browserClock()) {}

  enqueue(
    value: StreamNotification,
    publish: (messages: StreamNotification[]) => void,
  ) {
    if (this.disposed) return;
    this.publish = publish;
    this.unsubscribe ??= this.clock.subscribe(() => {
      if (!this.clock.animate()) this.flush();
    });
    const key = JSON.stringify([
      value.ownerId,
      streamIdentityKey(streamIdentity(value.message, value.profileKey)),
    ]);
    const previous = this.buffers.get(key);
    this.buffers.set(key, {
      ...value,
      message: {
        ...value.message,
        params: {
          ...value.message.params,
          delta:
            String(previous?.message.params?.delta ?? "") +
            String(value.message.params?.delta ?? ""),
        },
      },
    });
    this.schedule();
  }

  /** Serialize lifecycle handlers per thread, while unrelated runs continue independently. */
  dispatch(
    value: StreamNotification,
    callback: () => void | Promise<void>,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const key = streamRunKey(value.profileKey, value.message);
    if (isUrgent(value.message)) this.flush(key);
    const previous = this.lanes.get(key);
    const epoch = this.epochs.get(key) ?? 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.lanes.set(key, gate);
    const run = () => {
      if (this.disposed || epoch !== (this.epochs.get(key) ?? 0)) return;
      this.releases.set(value.message, release);
      return callback();
    };
    // Invoke the first handler synchronously: turn binding latches depend on this.
    let pending: Promise<void>;
    try {
      pending = previous ? previous.then(run, run) : Promise.resolve(run());
    } catch (error) {
      pending = Promise.reject(error);
    }
    void pending.then(release, release);
    void gate.then(() => {
      this.releases.delete(value.message);
      if (this.lanes.get(key) === gate) this.lanes.delete(key);
    });
    return pending;
  }

  /** Release after applying the lifecycle state; slow persistence/RPC housekeeping must not block input. */
  applied(message: CodexMessage) {
    this.releases.get(message)?.();
  }

  before(value: StreamNotification): Promise<void> | undefined {
    const key = streamRunKey(value.profileKey, value.message);
    const normalCompletion =
      value.message.method === "item/completed" ||
      (value.message.method === "turn/completed" && !isUrgent(value.message));
    const pending = [...this.buffers.values()].filter(
      (item) => streamRunKey(item.profileKey, item.message) === key,
    );
    if (
      !normalCompletion ||
      !this.clock.animate() ||
      pending.reduce(
        (size, item) => size + String(item.message.params?.delta ?? "").length,
        0,
      ) <= 24
    ) {
      this.flush(key);
      return;
    }
    this.flushOutputs(key);
    if (!this.hasBuffers(key)) return;
    return new Promise<void>((resolve) => {
      this.drains.set(key, { frames: 8, resolve });
      this.schedule();
    });
  }

  flush(key?: string) {
    const values = this.take(
      (value) => !key || streamRunKey(value.profileKey, value.message) === key,
    );
    if (values.length) this.publish?.(values);
    this.finishDrains();
    this.cancelUnusedTimers();
  }

  /** Used by explicit view/recovery boundaries that already apply the returned batch. */
  drain(): StreamNotification[] {
    const values = this.take(() => true);
    this.finishDrains();
    this.cancelUnusedTimers();
    return values;
  }

  reset(key: string) {
    this.epochs.set(key, (this.epochs.get(key) ?? 0) + 1);
    this.lanes.delete(key);
    this.take((value) => streamRunKey(value.profileKey, value.message) === key);
    this.finishDrains();
    this.cancelUnusedTimers();
  }

  dispose() {
    this.flush();
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private schedule() {
    const values = [...this.buffers.values()];
    if (values.some((value) => !isOutput(value)) && !this.cancelFrame) {
      const tick = () => {
        this.cancelFrame = null;
        this.tick();
      };
      this.cancelFrame = this.clock.animate()
        ? this.clock.frame(tick)
        : this.clock.timer(tick, 16);
    }
    if (values.some(isOutput) && !this.cancelOutput) {
      this.cancelOutput = this.clock.timer(() => {
        this.cancelOutput = null;
        this.flushOutputs();
      }, 50);
    }
  }

  private tick() {
    if (!this.clock.animate()) {
      this.flush();
      return;
    }
    const batch: StreamNotification[] = [];
    for (const [key, value] of this.buffers) {
      if (isOutput(value)) continue;
      const identity = streamIdentity(value.message, value.profileKey);
      const drain = this.drains.get(
        streamRunKey(value.profileKey, value.message),
      );
      const delta = String(value.message.params?.delta ?? "");
      const length =
        identity.target === "reasoningSummary"
          ? delta.length
          : Math.max(24, drain ? Math.ceil(delta.length / drain.frames) : 24);
      // Do not render half of a UTF-16 surrogate pair.
      const end =
        length < delta.length &&
        /[\uD800-\uDBFF]/.test(delta.charAt(length - 1))
          ? length + 1
          : length;
      batch.push({
        ...value,
        message: {
          ...value.message,
          params: { ...value.message.params, delta: delta.slice(0, end) },
        },
      });
      if (end >= delta.length) this.buffers.delete(key);
      else
        this.buffers.set(key, {
          ...value,
          message: {
            ...value.message,
            params: { ...value.message.params, delta: delta.slice(end) },
          },
        });
    }
    for (const drain of this.drains.values())
      drain.frames = Math.max(1, drain.frames - 1);
    if (batch.length) this.publish?.(batch);
    this.finishDrains();
    this.schedule();
  }

  private flushOutputs(key?: string) {
    const values = this.take(
      (value) =>
        isOutput(value) &&
        (!key || streamRunKey(value.profileKey, value.message) === key),
    );
    if (values.length) this.publish?.(values);
    this.finishDrains();
    this.cancelUnusedTimers();
  }
  private take(predicate: (value: StreamNotification) => boolean) {
    const values: StreamNotification[] = [];
    for (const [key, value] of this.buffers)
      if (predicate(value)) {
        values.push(value);
        this.buffers.delete(key);
      }
    return values;
  }
  private hasBuffers(key: string) {
    return [...this.buffers.values()].some(
      (value) => streamRunKey(value.profileKey, value.message) === key,
    );
  }
  private finishDrains() {
    for (const [key, drain] of this.drains)
      if (!this.hasBuffers(key)) {
        this.drains.delete(key);
        drain.resolve();
      }
  }
  private cancelUnusedTimers() {
    if (![...this.buffers.values()].some((value) => !isOutput(value))) {
      this.cancelFrame?.();
      this.cancelFrame = null;
    }
    if (![...this.buffers.values()].some(isOutput)) {
      this.cancelOutput?.();
      this.cancelOutput = null;
    }
  }
}
function isOutput(value: StreamNotification) {
  return streamIdentity(value.message).target === "commandOutput";
}
function isUrgent(message: CodexMessage) {
  const turn = message.params?.turn as { status?: string } | undefined;
  return (
    message.id != null ||
    message.method === "error" ||
    message.method === "turn/interrupted" ||
    (message.method === "turn/completed" &&
      ["failed", "interrupted", "cancelled", "canceled"].includes(
        turn?.status ?? "",
      ))
  );
}
