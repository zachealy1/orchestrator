import { describe, expect, it } from "vitest";
import type {
  PromptQueueContextFingerprint,
  PromptQueueItem,
} from "../types";
import { createRunExecutionSettings } from "./runExecutionSettings";
import {
  comparePromptQueueDisplayOrder,
  comparePromptQueueDispatchOrder,
  createQueuedPromptSnapshot,
  isPromptQueueItemAutoDispatchEligible,
  isPromptQueueItemMutable,
  parsePromptQueueItemRecord,
  parseQueuedPromptSnapshot,
  PROMPT_QUEUE_MAX_ATTACHMENTS,
  PROMPT_QUEUE_MAX_ITEMS,
  PROMPT_QUEUE_MAX_PROMPT_CHARACTERS,
  queuePromptPreview,
  rebaselinePromptQueueContextFingerprint,
  serializeQueuedPromptSnapshot,
  validatePromptQueueDraft,
} from "./promptQueue";

const fingerprint: PromptQueueContextFingerprint = {
  version: 1,
  workspacePath: "/workspace/project",
  branch: "main",
  headCommit: "abc123",
  worktreeFingerprint: "worktree-1",
  profileKey: "account:7",
  threadId: "thread-1",
  conversationRevision: 3,
  files: [
    {
      path: "/workspace/project/src/App.tsx",
      canonicalPath: "/workspace/project/src/App.tsx",
      size: 1200,
      modifiedAtMs: 1234,
      available: true,
    },
  ],
};

const executionSettings = createRunExecutionSettings({
  accountId: 7,
  profileKey: "account:7",
  selectedBranch: "main",
  mode: "plan",
  intent: "plan",
  accessMode: "ask-for-approval",
  computerUseEnabled: true,
  model: "gpt-5.6",
  reasoningEffort: "high",
  useOss: false,
  ossProvider: "ollama",
  contextFiles: [
    {
      path: "/workspace/project/src/App.tsx",
      canonicalPath: "/workspace/project/src/App.tsx",
      name: "App.tsx",
      relativePath: "src/App.tsx",
      source: "picker",
      status: "ready",
    },
  ],
  selectedSkills: [
    {
      id: "frontend",
      name: "Frontend",
      description: "Implement frontend behavior",
    },
  ],
  goalMode: false,
});

function queueItem(
  id: string,
  position: number,
  sendNowPriority: number | null,
  status: PromptQueueItem["status"] = "queued",
  autoSendEnabled = true,
): PromptQueueItem {
  return {
    id,
    clientMessageId: `message-${id}`,
    workspaceId: 1,
    chatId: 2,
    position,
    sendNowPriority,
    autoSendEnabled,
    prompt: `Prompt ${id}`,
    snapshot: createQueuedPromptSnapshot({
      prompt: `Prompt ${id}`,
      executionSettings,
      contextFingerprint: fingerprint,
    }),
    status,
    linkedRunId: null,
    linkedTurnId: null,
    error: null,
    staleReasons: [],
    createdAt: `2026-07-26T10:00:0${position}Z`,
    updatedAt: `2026-07-26T10:00:0${position}Z`,
    acceptedAt: null,
    completedAt: null,
  };
}

describe("prompt queue snapshots", () => {
  it("round-trips the complete immutable execution context", () => {
    const snapshot = createQueuedPromptSnapshot({
      prompt: "Prepare the release plan",
      executionSettings,
      contextFingerprint: fingerprint,
    });

    expect(
      parseQueuedPromptSnapshot(serializeQueuedPromptSnapshot(snapshot)),
    ).toEqual(snapshot);
  });

  it("rejects malformed snapshots and records without applying partial settings", () => {
    expect(parseQueuedPromptSnapshot('{"version":2}')).toBeNull();
    expect(
      parsePromptQueueItemRecord({
        id: "queue-1",
        client_message_id: "message-1",
        workspace_id: 1,
        chat_id: 2,
        position: 0,
        send_now_priority: null,
        auto_send_enabled: 1,
        prompt_text: "Prompt",
        execution_snapshot_json: '{"version":2}',
        context_fingerprint_json: JSON.stringify(fingerprint),
        conversation_revision: 3,
        status: "queued",
        linked_run_id: null,
        linked_turn_id: null,
        error: null,
        stale_reasons_json: null,
        created_at: "2026-07-26T10:00:00Z",
        updated_at: "2026-07-26T10:00:00Z",
        accepted_at: null,
        completed_at: null,
      }),
    ).toBeNull();
  });
});

describe("prompt queue dispatch rules", () => {
  it("preserves send-now request order ahead of untouched queue items", () => {
    const items = [
      queueItem("normal", 0, null),
      queueItem("priority-two", 2, 2),
      queueItem("priority-one", 1, 1),
    ];

    expect(items.sort(comparePromptQueueDispatchOrder).map((item) => item.id)).toEqual([
      "priority-one",
      "priority-two",
      "normal",
    ]);
  });

  it("keeps visible queue order stable when send-now priority changes", () => {
    const items = [
      queueItem("normal", 0, null),
      queueItem("priority-two", 2, 2),
      queueItem("priority-one", 1, 1),
    ];

    expect(items.sort(comparePromptQueueDisplayOrder).map((item) => item.id)).toEqual([
      "normal",
      "priority-one",
      "priority-two",
    ]);
  });

  it("protects starting, steering, and active items from mutation", () => {
    expect(isPromptQueueItemMutable(queueItem("queued", 0, null))).toBe(true);
    expect(
      isPromptQueueItemMutable(queueItem("starting", 0, null, "starting")),
    ).toBe(false);
    expect(
      isPromptQueueItemMutable(queueItem("steering", 0, null, "steering")),
    ).toBe(false);
    expect(
      isPromptQueueItemMutable(queueItem("active", 0, null, "active")),
    ).toBe(false);
  });

  it("bypasses held items unless they have an explicit send-now priority", () => {
    expect(
      isPromptQueueItemAutoDispatchEligible(
        queueItem("held", 0, null, "queued", false),
      ),
    ).toBe(false);
    expect(
      isPromptQueueItemAutoDispatchEligible(
        queueItem("held-priority", 0, 1, "scheduled-next", false),
      ),
    ).toBe(true);
    expect(
      isPromptQueueItemAutoDispatchEligible(queueItem("automatic", 0, null)),
    ).toBe(true);
  });

  it("rebaselines repository context after a successful queued turn", () => {
    const next = rebaselinePromptQueueContextFingerprint({
      expected: fingerprint,
      inspection: {
        workspacePath: "/workspace/project",
        branch: "feature/queue",
        headCommit: "def456",
        worktreeFingerprint: "worktree-2",
        files: [
          {
            path: "/workspace/project/spec.md",
            canonicalPath: "/workspace/project/spec.md",
            size: 128,
            modifiedAtMs: 42,
            available: true,
          },
        ],
      },
      executionProfileKey: "account:7",
      currentProfileKey: "account:7",
      currentThreadId: "thread-2",
      conversationRevision: 4,
    });

    expect(next).toMatchObject({
      workspacePath: "/workspace/project",
      branch: "feature/queue",
      headCommit: "def456",
      worktreeFingerprint: "worktree-2",
      profileKey: "account:7",
      threadId: "thread-2",
      conversationRevision: 4,
    });
    expect(next.files).toEqual([
      expect.objectContaining({
        path: "/workspace/project/spec.md",
        available: true,
      }),
    ]);
  });
});

describe("prompt queue limits", () => {
  it("enforces prompt, attachment, and per-chat queue limits", () => {
    expect(
      validatePromptQueueDraft({
        prompt: " ",
        attachmentCount: 0,
        currentQueueSize: 0,
      }),
    ).toMatch(/write a prompt/i);
    expect(
      validatePromptQueueDraft({
        prompt: "x".repeat(PROMPT_QUEUE_MAX_PROMPT_CHARACTERS + 1),
        attachmentCount: 0,
        currentQueueSize: 0,
      }),
    ).toMatch(/100,000/);
    expect(
      validatePromptQueueDraft({
        prompt: "Valid",
        attachmentCount: PROMPT_QUEUE_MAX_ATTACHMENTS + 1,
        currentQueueSize: 0,
      }),
    ).toMatch(/20 attachments/);
    expect(
      validatePromptQueueDraft({
        prompt: "Valid",
        attachmentCount: 0,
        currentQueueSize: PROMPT_QUEUE_MAX_ITEMS,
      }),
    ).toMatch(/maximum of 50/);
    expect(
      validatePromptQueueDraft({
        prompt: "Valid",
        attachmentCount: 1,
        currentQueueSize: 49,
      }),
    ).toBeNull();
  });

  it("creates a bounded single-line preview", () => {
    expect(queuePromptPreview("  First\n\n second   third  ", 12)).toBe(
      "First secon…",
    );
  });
});
