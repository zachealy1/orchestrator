import type { RunEventInput } from "../../data/repositories";

type RunEventWriter = (events: RunEventInput[]) => Promise<void>;

export type RunEventBufferOptions = {
  delayMs?: number;
  maxBatchSize?: number;
};

export class RunEventBuffer {
  private readonly pending: RunEventInput[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private disposed = false;
  private readonly delayMs: number;
  private readonly maxBatchSize: number;

  constructor(
    private readonly write: RunEventWriter,
    { delayMs = 100, maxBatchSize = 50 }: RunEventBufferOptions = {},
  ) {
    this.delayMs = delayMs;
    this.maxBatchSize = maxBatchSize;
  }

  enqueue(event: RunEventInput): void {
    if (this.disposed) return;
    this.pending.push(event);
    if (this.pending.length >= this.maxBatchSize) {
      void this.flush();
      return;
    }
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.delayMs);
  }

  flush(): Promise<void> {
    this.clearTimer();
    const batch = this.pending.splice(0);
    if (batch.length === 0) return this.writeChain;

    const write = this.writeChain
      .catch(() => undefined)
      .then(() => this.write(batch));
    this.writeChain = write;
    return write;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimer();
    if (this.pending.length > 0) void this.flush();
  }

  private clearTimer(): void {
    if (this.flushTimer === null) return;
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }
}
