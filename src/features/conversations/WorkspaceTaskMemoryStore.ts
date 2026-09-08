import type { WorkspaceTaskMemory } from "./runtimeState";

export class WorkspaceTaskMemoryStore {
  readonly records: Record<number, WorkspaceTaskMemory | undefined> = {};

  constructor() {
    if (typeof localStorage === "undefined") return;
    try {
      const saved = JSON.parse(localStorage.getItem("orchestrator.update-drafts.v1") ?? "{}");
      for (const [id, value] of Object.entries(saved)) {
        const memory = value as WorkspaceTaskMemory;
        if (!/^\d+$/.test(id) || !memory || typeof memory.prompt !== "string"
          || !Array.isArray(memory.contextFiles) || !Array.isArray(memory.selectedSkills)
          || !["new", "chat"].includes(memory.selection?.kind)) continue;
        this.records[Number(id)] = { ...memory, historicalTranscript: null, transcriptViewportSnapshot: null };
      }
      localStorage.removeItem("orchestrator.update-drafts.v1");
    } catch { /* Invalid recovery data never prevents startup. */ }
  }

  saveForUpdate() {
    const drafts = Object.fromEntries(Object.entries(this.records).filter(([, memory]) => memory).map(([id, memory]) => [id, {
      prompt: memory!.prompt, contextFiles: memory!.contextFiles, selectedSkills: memory!.selectedSkills,
      selection: memory!.selection.kind === "draft" ? { kind: "new" } : memory!.selection,
    }]));
    // Quota/permission errors propagate: do not restart after failing to save a draft.
    localStorage.setItem("orchestrator.update-drafts.v1", JSON.stringify(drafts));
  }

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
