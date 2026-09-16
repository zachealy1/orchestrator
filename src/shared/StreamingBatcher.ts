import { isDocumentVisible, subscribeDocumentVisibility } from "./documentVisibility";

/** Timed reduction keeps run state current even when WebKit suspends animation frames. */
export class StreamingBatcher<T> {
  private readonly pending: T[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  private onReady: (() => void) | null = null;
  private disposed = false;

  enqueue(value: T, onReady: () => void): void {
    if (this.disposed) return;
    this.pending.push(value);
    this.onReady = onReady;
    if (this.pending.length >= 500) {
      this.clearTimer();
      onReady();
      return;
    }
    if (!this.unsubscribe) {
      this.unsubscribe = subscribeDocumentVisibility(() => {
        this.clearTimer();
        this.schedule();
      });
    }
    this.schedule();
  }

  drain(): T[] {
    this.clearTimer();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.onReady = null;
    return this.pending.splice(0);
  }

  dispose(): void {
    this.disposed = true;
    this.drain();
  }

  private schedule() {
    if (this.timer !== null || this.pending.length === 0 || this.disposed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.onReady?.();
    }, isDocumentVisible() ? 50 : 100);
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
