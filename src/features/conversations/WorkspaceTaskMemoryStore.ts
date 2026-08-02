import type { WorkspaceTaskMemory } from "./runtimeState";

export class WorkspaceTaskMemoryStore {
  readonly records: Record<number, WorkspaceTaskMemory | undefined> = {};

  get(workspaceId: number): WorkspaceTaskMemory | undefined {
    return this.records[workspaceId];
  }

  set(workspaceId: number, memory: WorkspaceTaskMemory): void {
    this.records[workspaceId] = memory;
  }

  update(
    workspaceId: number,
    update: (current: WorkspaceTaskMemory | undefined) => WorkspaceTaskMemory,
  ): WorkspaceTaskMemory {
    const memory = update(this.records[workspaceId]);
    this.records[workspaceId] = memory;
    return memory;
  }

  delete(workspaceId: number): void {
    delete this.records[workspaceId];
  }

  clear(): void {
    Object.keys(this.records).forEach((key) => delete this.records[Number(key)]);
  }
}
