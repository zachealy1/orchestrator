import { describe, expect, it } from "vitest";
import type { WorkspaceTaskMemory } from "./runtimeState";
import { WorkspaceTaskMemoryStore } from "./WorkspaceTaskMemoryStore";

const memory = (prompt: string): WorkspaceTaskMemory => ({
  selection: { kind: "new" },
  prompt,
  contextFiles: [],
  selectedSkills: [],
  historicalTranscript: null,
  transcriptViewportSnapshot: null,
});

describe("WorkspaceTaskMemoryStore", () => {
  it("isolates task memory by workspace", () => {
    const store = new WorkspaceTaskMemoryStore();
    store.set(1, memory("one"));
    store.set(2, memory("two"));

    expect(store.get(1)?.prompt).toBe("one");
    expect(store.get(2)?.prompt).toBe("two");
  });

  it("clears deleted workspace memory", () => {
    const store = new WorkspaceTaskMemoryStore();
    store.set(1, memory("draft"));
    store.delete(1);
    expect(store.get(1)).toBeUndefined();
  });
});
