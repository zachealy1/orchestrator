export type AnimationFrameScheduler = (callback: FrameRequestCallback) => number;
export type AnimationFrameCanceller = (handle: number) => void;

export class AnimationFrameBatcher<T> {
  private readonly pending: T[] = [];
  private frame: number | null = null;
  private disposed = false;

  constructor(
    private readonly schedule: AnimationFrameScheduler = (callback) =>
      window.requestAnimationFrame(callback),
    private readonly cancel: AnimationFrameCanceller = (handle) =>
      window.cancelAnimationFrame(handle),
  ) {}

  enqueue(value: T, onReady: () => void): void {
    if (this.disposed) return;
    this.pending.push(value);
    if (this.frame !== null) return;
    this.frame = this.schedule(() => {
      this.frame = null;
      if (!this.disposed) onReady();
    });
  }

  drain(): T[] {
    this.cancelFrame();
    return this.pending.splice(0);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelFrame();
    this.pending.splice(0);
  }

  private cancelFrame(): void {
    if (this.frame === null) return;
    this.cancel(this.frame);
    this.frame = null;
  }
}
