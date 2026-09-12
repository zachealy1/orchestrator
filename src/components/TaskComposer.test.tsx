import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TaskComposer as ProductionTaskComposer,
  type ComposerActions,
  type ComposerModel,
} from "./TaskComposer";
import { useState } from "react";
import {
  createQueuedPromptSnapshot,
} from "../lib/promptQueue";
import { createRunExecutionSettings } from "../lib/runExecutionSettings";
import {
  type SubagentRecord,
} from "../lib/subagents";
import { AppServices } from "../runtime/AppServices";
import { renderWithAppServices } from "../test/renderWithAppServices";
import { ORCHESTRATOR_PROMPT_CONTEXT_MIME } from "../features/composer/types";
import type { PromptQueueItem } from "../features/queue/types";

type TaskComposerProps = ComposerModel & ComposerActions;

function TaskComposer(props: TaskComposerProps) {
  const {
    onAccountChange,
    onPromptChange,
    onModelChange,
    onReasoningEffortChange,
    onGoalModeChange,
    onPlanModeChange,
    onPauseGoal,
    onResumeGoal,
    onEditGoal,
    onStopGoal,
    onInspectSubagent,
    onReconcileSubagents,
    onQueueEdit,
    onQueueRemove,
    onQueueRetry,
    onQueueAutoSendChange,
    onQueueSendNow,
    onQueueReorder,
    onQueueEditCancel,
    onDispatchQueued,
    onAccessModeChange,
    onAddFiles,
    onMentionSearch,
    onMentionFileSelect,
    onMentionClose,
    onSlashCommandSearch,
    onSlashCommandSelect,
    onSlashCommandClose,
    onContextFilesDrop,
    onContextFilesDropError,
    onDropSurfaceElementChange,
    onPromptElementChange,
    hasContextFileDropFallback,
    getContextFileDropFallback,
    onContextFileDropHandled,
    onRemoveFile,
    onRemoveSkill,
    onRun,
    onStop,
    ...model
  } = props;

  return (
    <ProductionTaskComposer
      model={model}
      actions={{
        onAccountChange,
        onPromptChange,
        onModelChange,
        onReasoningEffortChange,
        onGoalModeChange,
        onPlanModeChange,
        onPauseGoal,
        onResumeGoal,
        onEditGoal,
        onStopGoal,
        onInspectSubagent,
        onReconcileSubagents,
        onQueueEdit,
        onQueueRemove,
        onQueueRetry,
        onQueueAutoSendChange,
        onQueueSendNow,
        onQueueReorder,
        onQueueEditCancel,
        onDispatchQueued,
        onAccessModeChange,
        onAddFiles,
        onMentionSearch,
        onMentionFileSelect,
        onMentionClose,
        onSlashCommandSearch,
        onSlashCommandSelect,
        onSlashCommandClose,
        onContextFilesDrop,
        onContextFilesDropError,
        onDropSurfaceElementChange,
        onPromptElementChange,
        hasContextFileDropFallback,
        getContextFileDropFallback,
        onContextFileDropHandled,
        onRemoveFile,
        onRemoveSkill,
        onRun,
        onStop,
      }}
    />
  );
}

let services: AppServices;

beforeEach(() => {
  services = new AppServices();
});

afterEach(() => {
  cleanup();
  services?.dispose();
});

const models: TaskComposerProps["models"] = [
  {
    id: "gpt-5.1-codex",
    model: "gpt-5.1-codex",
    displayName: "GPT-5.1 Codex",
    description: "Default coding agent",
    hidden: false,
    supportedReasoningEfforts: [
      { reasoningEffort: "medium", description: "Balanced reasoning" },
      { reasoningEffort: "high", description: "Deeper reasoning" },
    ],
    defaultReasoningEffort: "medium",
    isDefault: true,
  },
  {
    id: "gpt-5.1-codex-max",
    model: "gpt-5.1-codex-max",
    displayName: "GPT-5.1 Codex Max",
    description: "Higher capability coding agent",
    hidden: false,
    supportedReasoningEfforts: [
      { reasoningEffort: "high", description: "Deeper reasoning" },
    ],
    defaultReasoningEffort: "high",
    isDefault: false,
  },
];

const accounts: TaskComposerProps["accounts"] = [
  {
    id: 7,
    label: "Work account",
    email: "dev@example.com",
    plan_type: "plus",
    status: "signed_in",
    last_error: null,
    last_used_at: "2026-06-22T00:00:00Z",
    created_at: "2026-06-22T00:00:00Z",
    updated_at: "2026-06-22T00:00:00Z",
    deleted_at: null,
  },
];

function queuedPrompt(): PromptQueueItem {
  const executionSettings = createRunExecutionSettings({
    accountId: 7,
    profileKey: "account:7",
    selectedBranch: "main",
    mode: "run",
    intent: "normal",
    accessMode: "ask-for-approval",
    computerUseEnabled: true,
    model: "gpt-5.1-codex",
    reasoningEffort: "medium",
    contextFiles: [],
    selectedSkills: [],
    goalMode: false,
  });
  const contextFingerprint = {
    version: 2 as const,
    workspacePath: "/workspace",
    repositories: [
      {
        repositoryPath: "/workspace",
        branch: "main",
        headCommit: "abc",
        worktreeFingerprint: "clean",
      },
    ],
    profileKey: "account:7" as const,
    threadId: "thread-1",
    conversationRevision: 1,
    files: [],
  };
  return {
    id: "queue-1",
    clientMessageId: "message-queue-1",
    workspaceId: 1,
    chatId: 2,
    position: 0,
    sendNowPriority: null,
    autoSendEnabled: true,
    prompt: "Queued follow-up",
    snapshot: createQueuedPromptSnapshot({
      prompt: "Queued follow-up",
      executionSettings,
      contextFingerprint,
    }),
    status: "queued",
    linkedRunId: null,
    linkedTurnId: null,
    error: null,
    staleReasons: [],
    createdAt: "2026-07-26T10:00:00Z",
    updatedAt: "2026-07-26T10:00:00Z",
    acceptedAt: null,
    completedAt: null,
  };
}

function activeSubagent(chatId: number): SubagentRecord {
  return {
    id: `subagent-${chatId}`,
    ownerClientId: "owner",
    workspaceId: 1,
    chatId,
    runId: 3,
    parentTurnId: "parent-turn",
    profileKey: "account:7",
    accountId: 7,
    rootThreadId: "root-thread",
    parentThreadId: "root-thread",
    childThreadId: `child-thread-${chatId}`,
    childTurnId: `child-turn-${chatId}`,
    spawnItemId: `spawn-${chatId}`,
    task: `Inspect chat ${chatId}`,
    depth: 1,
    status: "running",
    statusBeforeAttention: null,
    agentStatus: "running",
    needsAttention: false,
    error: null,
    finalResult: null,
    startedAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:00:01.000Z",
    completedAt: null,
  };
}

function renderComposer(overrides: Partial<TaskComposerProps> = {}) {
  const props: TaskComposerProps = {
    disabled: false,
    runActive: false,
    prompt: "",
    accounts,
    selectedAccountId: 7,
    accountSelectionDisabled: false,
    models,
    modelLoadError: null,
    selectedModelId: "gpt-5.1-codex",
    selectedReasoningEffort: "medium",
    goalMode: false,
    planMode: false,
    accessMode: "ask-for-approval",
    contextFiles: [],
    selectedSkills: [],
    mentionResults: [],
    mentionSearchStatus: "idle",
    mentionSearchError: null,
    slashCommandResults: [],
    slashCommandSearchStatus: "idle",
    slashCommandSearchError: null,
    onAccountChange: vi.fn(),
    onPromptChange: vi.fn(),
    onModelChange: vi.fn(),
    onReasoningEffortChange: vi.fn(),
    onGoalModeChange: vi.fn(),
    onPlanModeChange: vi.fn(),
    onPauseGoal: vi.fn(),
    onResumeGoal: vi.fn(),
    onEditGoal: vi.fn(),
    onStopGoal: vi.fn(),
    onAccessModeChange: vi.fn(),
    onAddFiles: vi.fn(),
    onMentionSearch: vi.fn(),
    onMentionFileSelect: vi.fn(),
    onMentionClose: vi.fn(),
    onSlashCommandSearch: vi.fn(),
    onSlashCommandSelect: vi.fn(),
    onSlashCommandClose: vi.fn(),
    onContextFilesDrop: vi.fn(),
    onRemoveFile: vi.fn(),
    onRemoveSkill: vi.fn(),
    onRun: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };

  return {
    props,
    user: userEvent.setup(),
    ...renderWithAppServices(<TaskComposer {...props} />, {}, services),
  };
}

function renderControlledComposer(overrides: Partial<TaskComposerProps> = {}) {
  const user = userEvent.setup();
  const onPromptChange = overrides.onPromptChange ?? vi.fn();
  const initialPrompt = overrides.prompt ?? "";

  function ControlledComposer() {
    const [prompt, setPrompt] = useState(initialPrompt);
    const props: TaskComposerProps = {
      disabled: false,
      runActive: false,
      accounts,
      selectedAccountId: 7,
      accountSelectionDisabled: false,
      models,
      modelLoadError: null,
      selectedModelId: "gpt-5.1-codex",
      selectedReasoningEffort: "medium",
      goalMode: false,
      planMode: false,
      accessMode: "ask-for-approval",
      contextFiles: [],
      selectedSkills: [],
      mentionResults: [],
      mentionSearchStatus: "idle",
      mentionSearchError: null,
      slashCommandResults: [],
      slashCommandSearchStatus: "idle",
      slashCommandSearchError: null,
      onAccountChange: vi.fn(),
      onModelChange: vi.fn(),
      onReasoningEffortChange: vi.fn(),
      onGoalModeChange: vi.fn(),
      onPlanModeChange: vi.fn(),
      onPauseGoal: vi.fn(),
      onResumeGoal: vi.fn(),
      onEditGoal: vi.fn(),
      onStopGoal: vi.fn(),
      onAccessModeChange: vi.fn(),
      onAddFiles: vi.fn(),
      onMentionSearch: vi.fn(),
      onMentionFileSelect: vi.fn(),
      onMentionClose: vi.fn(),
      onSlashCommandSearch: vi.fn(),
      onSlashCommandSelect: vi.fn(),
      onSlashCommandClose: vi.fn(),
      onContextFilesDrop: vi.fn(),
      onRemoveFile: vi.fn(),
      onRemoveSkill: vi.fn(),
      onRun: vi.fn(),
      onStop: vi.fn(),
      ...overrides,
      prompt,
      onPromptChange: (nextPrompt: string) => {
        setPrompt(nextPrompt);
        onPromptChange(nextPrompt);
      },
    };

    return <TaskComposer {...props} />;
  }

  return {
    user,
    onPromptChange,
    ...renderWithAppServices(<ControlledComposer />, {}, services),
  };
}

function getComposerInputZone() {
  const zone = screen.getByLabelText("Prompt").closest(".composer-input-zone");
  if (!(zone instanceof HTMLElement)) {
    throw new Error("Composer input zone was not rendered");
  }
  return zone;
}

function createContextFileDataTransfer(files: unknown[]) {
  let dropEffect = "none";

  return {
    types: ["application/x-orchestrator-context-file"],
    files: [],
    effectAllowed: "copy",
    get dropEffect() {
      return dropEffect;
    },
    set dropEffect(value: string) {
      dropEffect = value;
    },
    getData: (type: string) =>
      type === "application/x-orchestrator-context-file"
        ? JSON.stringify(files)
        : "",
    setData: vi.fn(),
  };
}

function createNativeFileDataTransfer(files: File[]) {
  let dropEffect = "none";

  return {
    types: ["Files"],
    files,
    effectAllowed: "copy",
    get dropEffect() {
      return dropEffect;
    },
    set dropEffect(value: string) {
      dropEffect = value;
    },
    getData: () => "",
    setData: vi.fn(),
  };
}

function createEmptyDataTransfer() {
  let dropEffect = "none";

  return {
    types: [],
    files: [],
    effectAllowed: "copy",
    get dropEffect() {
      return dropEffect;
    },
    set dropEffect(value: string) {
      dropEffect = value;
    },
    getData: () => "",
    setData: vi.fn(),
  };
}

function createPromptContextClipboardData(payload?: unknown) {
  const data = new Map<string, string>();
  if (payload !== undefined) {
    data.set(ORCHESTRATOR_PROMPT_CONTEXT_MIME, JSON.stringify(payload));
  }

  return {
    getData: vi.fn((type: string) => data.get(type) ?? ""),
    setData: vi.fn((type: string, value: string) => {
      data.set(type, value);
    }),
  };
}

describe("TaskComposer", () => {
  it("shows plan progress above the input without replacing focused text", () => {
    const initialProgress = {
      currentStep: 1,
      totalSteps: 3,
      completedSteps: 0,
      progressPercent: 0,
      stepLabel: "Inspect the repository",
      state: "in-progress" as const,
      steps: [
        { step: "Inspect the repository", status: "in_progress" as const },
        { step: "Implement the change", status: "pending" as const },
        { step: "Run verification", status: "pending" as const },
      ],
    };
    const { props, rerender } = renderComposer({
      prompt: "Keep this draft",
      planProgress: initialProgress,
    });
    const prompt = screen.getByLabelText("Prompt");
    prompt.focus();

    const indicator = screen.getByRole("status");
    expect(
      indicator.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(prompt).toHaveFocus();
    expect(prompt).toHaveValue("Keep this draft");

    rerender(
      <TaskComposer
        {...props}
        planProgress={{
          ...initialProgress,
          currentStep: 2,
          completedSteps: 1,
          progressPercent: 33,
          stepLabel: "Implement the change",
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Step 2 / 3");
    expect(prompt).toHaveFocus();
    expect(prompt).toHaveValue("Keep this draft");
  });

  it("stacks goal, plan, subagent, and queue progress inside the composer", () => {
    const planProgress = {
      currentStep: 1,
      totalSteps: 2,
      completedSteps: 0,
      progressPercent: 0,
      stepLabel: "Inspect the repository",
      state: "in-progress" as const,
      steps: [
        { step: "Inspect the repository", status: "in_progress" as const },
        { step: "Implement the change", status: "pending" as const },
      ],
    };
    const goalProgress = {
      threadId: "thread-1",
      objective: "Finish the workspace migration",
      status: "active" as const,
      timeUsedSeconds: 42,
      observedAtMs: Date.now(),
      actionPending: null,
    };
    const queueItems = [queuedPrompt()];
    services.subagents.replaceConversation("chat:2", [activeSubagent(2)]);
    const { container, props, rerender } = renderComposer({
      prompt: "Keep this draft",
      goalProgress,
      planProgress,
      subagentConversationKey: "chat:2",
      onInspectSubagent: vi.fn(),
      queueItems,
    });

    const prompt = screen.getByLabelText("Prompt");
    prompt.focus();
    rerender(
      <TaskComposer
        {...props}
        goalProgress={goalProgress}
        planProgress={planProgress}
        subagentConversationKey="chat:2"
        onInspectSubagent={vi.fn()}
        queueItems={queueItems}
      />,
    );

    const composer = screen.getByRole("region", { name: "Task composer" });
    const stack = composer.querySelector(".composer-status-stack");

    expect(stack).not.toBeNull();
    expect(composer).toHaveClass("has-composer-status");
    expect(stack).toContainElement(screen.getByLabelText("Goal progress"));
    expect(stack).toContainElement(screen.getByRole("status"));
    expect(Array.from(stack!.children)).toEqual([
      screen.getByLabelText("Goal progress"),
      screen.getByRole("status").closest(".plan-progress-indicator"),
      stack!.querySelector(".subagent-status-row"),
      stack!.querySelector(".prompt-queue-status-row"),
    ]);
    expect(
      stack!.compareDocumentPosition(prompt) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(container.querySelector(".unrouted-approval-warning")).toBeNull();
    expect(prompt).toHaveFocus();
    expect(prompt).toHaveValue("Keep this draft");
  });

  it("closes the subagent popover when the selected chat changes", async () => {
    services.subagents.replaceConversation("chat:2", [activeSubagent(2)]);
    services.subagents.replaceConversation("chat:3", [activeSubagent(3)]);
    const onInspectSubagent = vi.fn();
    const { props, rerender, user } = renderComposer({
      subagentConversationKey: "chat:2",
      onInspectSubagent,
    });

    await user.click(screen.getByRole("button", { name: /Subagents/i }));
    expect(
      screen.getByRole("region", { name: "Subagents" }),
    ).toBeInTheDocument();

    rerender(
      <TaskComposer
        {...props}
        subagentConversationKey="chat:3"
        onInspectSubagent={onInspectSubagent}
      />,
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Subagents" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("updates the prompt and exposes composer actions", async () => {
    const onPromptChange = vi.fn();
    const { user } = renderComposer({ onPromptChange });

    await user.type(screen.getByLabelText("Prompt"), "Fix the tests");

    expect(onPromptChange).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /preflight/i })).not.toBeInTheDocument();
  });

  it("removes legacy access guidance from the composer", () => {
    renderComposer();

    expect(screen.queryByText("Use Codex OSS mode")).not.toBeInTheDocument();
    expect(screen.queryByText("workspace-write")).not.toBeInTheDocument();
    expect(screen.queryByText("on-request approvals")).not.toBeInTheDocument();
    expect(screen.queryByText(/boundary crossings ask first/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no command network access/i)).not.toBeInTheDocument();
  });

  it("renders agent and reasoning controls", async () => {
    const onModelChange = vi.fn();
    const onReasoningEffortChange = vi.fn();
    const { user } = renderComposer({ onModelChange, onReasoningEffortChange });

    await user.click(screen.getByRole("combobox", { name: "Agent" }));
    await user.click(
      screen.getByRole("option", { name: "GPT-5.1 Codex Max" }),
    );
    await user.click(screen.getByRole("combobox", { name: "Reasoning" }));
    await user.click(screen.getByRole("option", { name: "High" }));

    expect(onModelChange).toHaveBeenCalledWith("gpt-5.1-codex-max");
    expect(onReasoningEffortChange).toHaveBeenCalledWith("high");
  });

  it("renders goal and plan mode toggles", async () => {
    const onGoalModeChange = vi.fn();
    const onPlanModeChange = vi.fn();
    const { user } = renderComposer({ onGoalModeChange, onPlanModeChange });

    await user.click(screen.getByRole("button", { name: /goal mode/i }));
    await user.click(screen.getByRole("button", { name: /plan mode/i }));

    expect(onGoalModeChange).toHaveBeenCalledWith(true);
    expect(onPlanModeChange).toHaveBeenCalledWith(true);
  });

  it("requests the other mode to turn off when enabling goal or plan mode", async () => {
    const onGoalModeChange = vi.fn();
    const onPlanModeChange = vi.fn();
    const { user, unmount } = renderComposer({
      goalMode: false,
      planMode: true,
      onGoalModeChange,
      onPlanModeChange,
    });

    await user.click(screen.getByRole("button", { name: /goal mode/i }));

    expect(onGoalModeChange).toHaveBeenCalledWith(true);
    expect(onPlanModeChange).toHaveBeenCalledWith(false);

    unmount();
    onGoalModeChange.mockClear();
    onPlanModeChange.mockClear();
    renderComposer({
      goalMode: true,
      planMode: false,
      onGoalModeChange,
      onPlanModeChange,
    });

    await user.click(screen.getByRole("button", { name: /plan mode/i }));

    expect(onPlanModeChange).toHaveBeenCalledWith(true);
    expect(onGoalModeChange).toHaveBeenCalledWith(false);
  });

  it("keeps Add files beside the mode controls and removes file search", () => {
    renderComposer();

    const toolbar = screen.getByRole("toolbar", { name: /prompt actions/i });
    expect(within(toolbar).getByRole("button", { name: /goal mode/i })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: /plan mode/i })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: /add files/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/search workspace files/i)).not.toBeInTheDocument();
  });

  it("renders one Access dropdown with the two supported modes", async () => {
    const onAccessModeChange = vi.fn();
    const { user } = renderComposer({ onAccessModeChange });

    const access = screen.getByRole("combobox", { name: "Access" });
    await user.click(access);
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(
      screen.getByRole("option", { name: "Ask for approval" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Full access" }));

    expect(onAccessModeChange).toHaveBeenCalledWith("full-access");
    expect(screen.queryByRole("combobox", { name: "Approvals" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Sandbox" })).not.toBeInTheDocument();
  });

  it("keeps Access available for prompts queued behind an active run", () => {
    renderComposer({ runActive: true });

    expect(screen.getByRole("combobox", { name: "Access" })).toBeEnabled();
  });

  it("keeps workspace and branch selection out of the composer", () => {
    renderComposer();

    expect(
      screen.queryByRole("combobox", { name: "Folder" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Branch" })).not.toBeInTheDocument();
  });

  it("selects a run account", async () => {
    const onAccountChange = vi.fn();
    const secondAccount = {
      ...accounts[0],
      id: 8,
      label: "Personal account",
      email: "personal@example.com",
    };
    const { user } = renderComposer({
      accounts: [...accounts, secondAccount],
      selectedAccountId: 8,
      onAccountChange,
    });

    await user.click(screen.getByRole("combobox", { name: "Run account" }));
    await user.click(screen.getByRole("option", { name: "Work account" }));
    expect(onAccountChange).toHaveBeenCalledWith(7);
  });

  it("offers the authenticated Codex app account as a shared profile", async () => {
    const onAccountChange = vi.fn();
    const { user } = renderComposer({
      sharedCodexProfileAvailable: true,
      onAccountChange,
    });

    await user.click(screen.getByRole("combobox", { name: "Run account" }));
    await user.click(
      screen.getByRole("option", { name: "Codex app account (shared)" }),
    );
    expect(onAccountChange).toHaveBeenCalledWith(0);
  });

  it("renders source-specific context files above the prompt and removes files", async () => {
    const onRemoveFile = vi.fn();
    const { user } = renderComposer({
      onRemoveFile,
      prompt: "Update App.css",
      contextFiles: [
        {
          path: "/repo/src/App.css",
          name: "App.css",
          source: "search",
          status: "ready",
        },
        {
          path: "/repo/src/App.tsx",
          name: "App.tsx",
          source: "picker",
          status: "ready",
        },
        {
          path: "/repo/AGENTS.md",
          name: "AGENTS.md",
          source: "explorer",
          status: "ready",
        },
      ],
    });

    const contextList = screen.getByLabelText("Selected context files");
    const promptShell = contextList.closest(".prompt-shell");
    expect(promptShell).toContainElement(screen.getByLabelText("Prompt"));
    expect(contextList.nextElementSibling).toHaveClass("prompt-field");
    expect(within(contextList).queryByText("#")).not.toBeInTheDocument();
    expect(within(contextList).queryByText("App.css")).not.toBeInTheDocument();
    expect(screen.getByText("CSS")).toBeInTheDocument();
    expect(screen.getByText("App.css")).toBeInTheDocument();
    expect(within(contextList).getByText("TSX")).toBeInTheDocument();
    expect(within(contextList).getByText("MD")).toBeInTheDocument();
    expect(contextList.querySelectorAll(".context-attachment")).toHaveLength(2);
    expect(screen.getByText("App.tsx")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /remove app\.tsx/i }));
    expect(onRemoveFile).toHaveBeenCalledWith("/repo/src/App.tsx");
  });

  it("copies inline file references with context metadata", () => {
    const clipboardData = createPromptContextClipboardData();
    renderComposer({
      prompt: "Update TXT hello-world.txt",
      contextFiles: [
        {
          path: "/repo/hello-world.txt",
          name: "hello-world.txt",
          source: "search",
          status: "ready",
        },
      ],
    });

    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    promptInput.setSelectionRange(7, "Update TXT hello-world.txt".length);
    fireEvent.copy(promptInput, { clipboardData });

    expect(clipboardData.setData).toHaveBeenCalledWith(
      "text/plain",
      "[hello-world.txt](/repo/hello-world.txt:1)",
    );
    const rawPayload = clipboardData.setData.mock.calls.find(
      ([type]) => type === ORCHESTRATOR_PROMPT_CONTEXT_MIME,
    )?.[1];
    if (typeof rawPayload !== "string") {
      throw new Error("Missing prompt context clipboard payload");
    }
    expect(JSON.parse(rawPayload)).toMatchObject({
      version: 1,
      prompt: "[hello-world.txt](/repo/hello-world.txt:1)",
      files: [
        {
          path: "/repo/hello-world.txt",
          name: "hello-world.txt",
          source: "search",
          status: "ready",
        },
      ],
    });
  });

  it("pastes inline file references with context metadata", () => {
    const onPromptChange = vi.fn();
    const onMentionFileSelect = vi.fn();
    const clipboardData = createPromptContextClipboardData({
      version: 1,
      prompt: "[hello-world.txt](/repo/hello-world.txt:1)",
      files: [
        {
          path: "/repo/hello-world.txt",
          name: "hello-world.txt",
          source: "search",
          status: "ready",
        },
      ],
    });
    renderComposer({
      prompt: "Delete the ",
      onPromptChange,
      onMentionFileSelect,
    });

    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    promptInput.setSelectionRange("Delete the ".length, "Delete the ".length);
    fireEvent.paste(promptInput, { clipboardData });

    expect(onPromptChange).toHaveBeenCalledWith(
      "Delete the TXT hello-world.txt",
    );
    expect(onMentionFileSelect).toHaveBeenCalledWith({
      path: "/repo/hello-world.txt",
      name: "hello-world.txt",
      source: "search",
      status: "ready",
    });
  });

  it("adds explorer files from the internal drag payload", () => {
    const onContextFilesDrop = vi.fn();
    renderComposer({ onContextFilesDrop });

    const composer = screen.getByLabelText("Task composer");
    const inputZone = getComposerInputZone();
    const dataTransfer = createContextFileDataTransfer([
      {
        path: "/repo/README.md",
        name: "README.md",
        source: "explorer",
        status: "ready",
      },
    ]);

    fireEvent.dragOver(inputZone, { dataTransfer });
    expect(composer).toHaveClass("drop-target-active");
    fireEvent.drop(inputZone, { dataTransfer });

    expect(onContextFilesDrop).toHaveBeenCalledWith([
      {
        path: "/repo/README.md",
        name: "README.md",
        source: "explorer",
        status: "ready",
      },
    ]);
  });

  it("ignores context file drops outside the prompt input zone", () => {
    const onContextFilesDrop = vi.fn();
    renderComposer({ onContextFilesDrop });
    const dataTransfer = createContextFileDataTransfer([
      {
        path: "/repo/README.md",
        name: "README.md",
        source: "explorer",
        status: "ready",
      },
    ]);

    fireEvent.drop(screen.getByLabelText("Task composer"), { dataTransfer });

    expect(onContextFilesDrop).not.toHaveBeenCalled();
  });

  it("uses the fallback explorer drag file when the drop payload is empty", () => {
    const onContextFilesDrop = vi.fn();
    const onContextFileDropHandled = vi.fn();
    const fallbackFile = {
      path: "/repo/README.md",
      name: "README.md",
      source: "explorer" as const,
      status: "ready" as const,
    };
    renderComposer({
      onContextFilesDrop,
      hasContextFileDropFallback: () => true,
      getContextFileDropFallback: () => [fallbackFile],
      onContextFileDropHandled,
    });

    const composer = screen.getByLabelText("Task composer");
    const inputZone = getComposerInputZone();
    const dataTransfer = createEmptyDataTransfer();

    fireEvent.dragOver(inputZone, { dataTransfer });
    expect(composer).toHaveClass("drop-target-active");
    fireEvent.drop(inputZone, { dataTransfer });

    expect(onContextFilesDrop).toHaveBeenCalledWith([fallbackFile]);
    expect(onContextFileDropHandled).toHaveBeenCalledOnce();
  });

  it("adds native dropped files when a file path is available", () => {
    const onContextFilesDrop = vi.fn();
    renderComposer({ onContextFilesDrop });

    const droppedFile = new File(["# Agents"], "AGENTS.md", {
      type: "text/markdown",
    });
    Object.defineProperty(droppedFile, "path", {
      value: "/repo/AGENTS.md",
    });
    const dataTransfer = createNativeFileDataTransfer([droppedFile]);

    fireEvent.drop(getComposerInputZone(), { dataTransfer });

    expect(onContextFilesDrop).toHaveBeenCalledWith([
      {
        path: "/repo/AGENTS.md",
        name: "AGENTS.md",
        source: "picker",
        status: "ready",
      },
    ]);
  });

  it("reports native dropped files without usable paths", () => {
    const onContextFilesDrop = vi.fn();
    const onContextFilesDropError = vi.fn();
    renderComposer({ onContextFilesDrop, onContextFilesDropError });

    const dataTransfer = createNativeFileDataTransfer([
      new File(["content"], "local-only.txt"),
    ]);

    fireEvent.drop(getComposerInputZone(), { dataTransfer });

    expect(onContextFilesDrop).not.toHaveBeenCalled();
    expect(onContextFilesDropError).toHaveBeenCalledWith(
      "Skipped 1 dropped file because the file path was unavailable.",
    );
  });

  it("keeps launch controls disabled until the composer is ready", () => {
    renderComposer({ disabled: true });

    expect(screen.getByRole("button", { name: /run codex/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /preflight/i })).not.toBeInTheDocument();
  });

  it("shows an enabled stop button while a run is active", async () => {
    const onStop = vi.fn();
    const { user } = renderComposer({
      disabled: true,
      runActive: true,
      onStop,
    });

    expect(screen.queryByRole("button", { name: /run codex/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /preflight/i })).not.toBeInTheDocument();
    const stopButton = screen.getByRole("button", { name: /stop codex/i });
    expect(stopButton).toBeEnabled();

    await user.click(stopButton);

    expect(onStop).toHaveBeenCalledOnce();
  });

  it("turns the stop button into the queue play button while typing during a run", async () => {
    const onRun = vi.fn();
    const onStop = vi.fn();
    const { user } = renderControlledComposer({
      runActive: true,
      onRun,
      onStop,
    });
    const promptInput = screen.getByLabelText("Prompt");
    const stopButton = screen.getByRole("button", { name: "Stop Codex" });

    expect(
      document.querySelectorAll(".composer-run-group .send-button"),
    ).toHaveLength(1);

    await user.type(promptInput, "Run this next");

    const queueButton = screen.getByRole("button", {
      name: "Add prompt to queue",
    });
    expect(queueButton).toBe(stopButton);
    expect(
      screen.queryByRole("button", { name: "Stop Codex" }),
    ).not.toBeInTheDocument();
    expect(
      document.querySelectorAll(".composer-run-group .send-button"),
    ).toHaveLength(1);

    await user.click(queueButton);

    expect(onRun).toHaveBeenCalledWith("Run this next");
    expect(onStop).not.toHaveBeenCalled();

    await user.clear(promptInput);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Stop Codex" })).toBe(
        stopButton,
      ),
    );
    expect(
      document.querySelectorAll(".composer-run-group .send-button"),
    ).toHaveLength(1);
  });

  it("submits the prompt when pressing Enter", async () => {
    const onRun = vi.fn();
    const { user } = renderControlledComposer({ onRun });
    const promptInput = screen.getByLabelText("Prompt");

    await user.type(promptInput, "Fix the failing test{Enter}");

    expect(onRun).toHaveBeenCalledOnce();
    expect(onRun).toHaveBeenCalledWith("Fix the failing test");
    expect(promptInput).toHaveValue("Fix the failing test");
  });

  it("submits the loaded prompt with Enter after enabling Plan Mode", async () => {
    const onRun = vi.fn();
    const onPlanModeChange = vi.fn();
    const { user } = renderControlledComposer({
      prompt: "Plan the implementation",
      onPlanModeChange,
      onRun,
    });
    const promptInput = screen.getByLabelText("Prompt");

    await user.click(screen.getByRole("button", { name: "Plan mode" }));
    expect(onPlanModeChange).toHaveBeenCalledWith(true);
    expect(promptInput).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(onRun).toHaveBeenCalledOnce();
    expect(onRun).toHaveBeenCalledWith("Plan the implementation");
  });

  it("submits a new prompt with one Enter when the queue already has an item", async () => {
    const onRun = vi.fn();
    const { user } = renderControlledComposer({
      queueItems: [queuedPrompt()],
      onRun,
    });
    const promptInput = screen.getByLabelText("Prompt");

    await user.type(promptInput, "Queue this after the existing prompt");
    await user.keyboard("{Enter}");

    expect(onRun).toHaveBeenCalledOnce();
    expect(onRun).toHaveBeenCalledWith(
      "Queue this after the existing prompt",
    );
  });

  it("keeps Shift+Enter as multiline input when prompts are queued", async () => {
    const onRun = vi.fn();
    const { user } = renderControlledComposer({
      queueItems: [queuedPrompt()],
      onRun,
    });
    const promptInput = screen.getByLabelText("Prompt");

    await user.type(promptInput, "First line");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.type(promptInput, "Second line");

    expect(onRun).not.toHaveBeenCalled();
    expect(promptInput).toHaveValue("First line\nSecond line");
  });

  it("uses the normal composer to save or cancel a queued prompt edit", async () => {
    const onRun = vi.fn();
    const onQueueEditCancel = vi.fn();
    const onGoalModeChange = vi.fn();
    const onPlanModeChange = vi.fn();
    const { user } = renderControlledComposer({
      disabled: true,
      modelSelectionDisabled: true,
      prompt: "Refine the queued prompt",
      queueItems: [queuedPrompt()],
      queueEditActive: true,
      onQueueEditCancel,
      onGoalModeChange,
      onPlanModeChange,
      onRun,
    });
    const promptInput = screen.getByLabelText("Prompt");

    expect(screen.queryByText("Editing queued prompt")).not.toBeInTheDocument();
    expect(document.querySelector(".prompt-queue-edit-status")).toBeNull();
    expect(
      screen.queryByRole("dialog", { name: "Edit queued prompt" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Goal mode" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Plan mode" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Agent" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Reasoning" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Run account" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Access" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Goal mode" }));
    await user.click(screen.getByRole("button", { name: "Plan mode" }));
    expect(onGoalModeChange).toHaveBeenCalledWith(true);
    expect(onPlanModeChange).toHaveBeenCalledWith(true);

    await user.click(promptInput);
    await user.keyboard("{Enter}");
    expect(onRun).toHaveBeenCalledWith("Refine the queued prompt");

    await user.keyboard("{Escape}");
    expect(onQueueEditCancel).toHaveBeenCalledOnce();
  });

  it("never turns an empty queued-prompt edit into a Stop action", async () => {
    const onRun = vi.fn();
    const onStop = vi.fn();
    renderControlledComposer({
      prompt: "",
      queueItems: [queuedPrompt()],
      queueEditActive: true,
      runActive: true,
      onRun,
      onStop,
    });

    const save = screen.getByRole("button", {
      name: "Save queued prompt",
    });
    expect(save).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Stop Codex" }),
    ).not.toBeInTheDocument();
    fireEvent.click(save);
    expect(onRun).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });

  it("shows save errors without restoring the removed edit status row", () => {
    renderControlledComposer({
      prompt: "Refine the queued prompt",
      queueItems: [queuedPrompt()],
      queueEditActive: true,
      queueEditError: "Select an available model for the queued prompt.",
    });

    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent("Select an available model for the queued prompt.");
    expect(screen.queryByText("Editing queued prompt")).not.toBeInTheDocument();
    expect(document.querySelector(".prompt-queue-edit-status")).toBeNull();
  });

  it("dispatches the first queued prompt when Enter is pressed on an empty composer", async () => {
    const onDispatchQueued = vi.fn();
    const onRun = vi.fn();
    const { user } = renderControlledComposer({
      queueItems: [queuedPrompt()],
      onDispatchQueued,
      onRun,
    });
    const promptInput = screen.getByLabelText("Prompt");

    await user.click(promptInput);
    await user.keyboard("{Enter}");

    expect(onDispatchQueued).toHaveBeenCalledOnce();
    expect(onRun).not.toHaveBeenCalled();
  });

  it.each(["button", "enter"])("explicitly dispatches a held queue item via %s without restoring automatic sending", async (action) => {
    const onDispatchQueued = vi.fn();
    const { user } = renderControlledComposer({
      queueItems: [{ ...queuedPrompt(), autoSendEnabled: false }],
      onDispatchQueued,
    });
    const promptInput = screen.getByLabelText("Prompt");

    expect(onDispatchQueued).not.toHaveBeenCalled();
    const runNext = screen.getByRole("button", { name: "Run next queued prompt" });
    expect(runNext).toBeEnabled();
    if (action === "button") await user.click(runNext);
    else {
      await user.click(promptInput);
      await user.keyboard("{Enter}");
    }
    expect(onDispatchQueued).toHaveBeenCalledOnce();
  });

  it("queues a future prompt while the current run is active", async () => {
    const onRun = vi.fn();
    const { user } = renderControlledComposer({
      runActive: true,
      onRun,
    });
    const promptInput = screen.getByLabelText("Prompt");

    await user.type(promptInput, "Run this after the current turn{Enter}");

    expect(onRun).toHaveBeenCalledOnce();
    expect(onRun).toHaveBeenCalledWith("Run this after the current turn");
  });

  it("submits a Plan Mode prompt with an image when pressing Enter", async () => {
    const onRun = vi.fn();
    const { user } = renderControlledComposer({
      planMode: true,
      contextFiles: [
        {
          path: "/repo/snake-game-header.webp",
          name: "snake-game-header.webp",
          source: "picker",
          status: "ready",
          mediaKind: "image",
          mimeType: "image/webp",
          width: 1280,
          height: 720,
        },
      ],
      onRun,
    });
    const promptInput = screen.getByLabelText("Prompt");

    await user.type(promptInput, "Plan a more realistic snake game{Enter}");

    expect(onRun).toHaveBeenCalledOnce();
    expect(onRun).toHaveBeenCalledWith("Plan a more realistic snake game");
  });

  it("keeps the live draft stable across unrelated parent renders", () => {
    const { props, rerender } = renderComposer({
      prompt: "Initial",
      promptRevision: 0,
    });
    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    promptInput.focus();
    fireEvent.change(promptInput, {
      target: { value: "Initial local draft", selectionStart: 19 },
    });
    promptInput.setSelectionRange(7, 7);

    rerender(
      <TaskComposer
        {...props}
        prompt="stale parent value"
        promptRevision={0}
        runActive
      />,
    );

    expect(promptInput).toHaveValue("Initial local draft");
    expect(promptInput).toHaveFocus();
    expect(promptInput.selectionStart).toBe(7);
    expect(promptInput.selectionEnd).toBe(7);
  });

  it("applies an explicit external prompt revision without remounting the input", () => {
    const { props, rerender } = renderComposer({
      prompt: "Draft",
      promptRevision: 0,
    });
    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    promptInput.focus();

    rerender(
      <TaskComposer
        {...props}
        prompt="Restored after setup failure"
        promptRevision={1}
      />,
    );

    expect(screen.getByLabelText("Prompt")).toBe(promptInput);
    expect(promptInput).toHaveValue("Restored after setup failure");
    expect(promptInput).toHaveFocus();
  });

  it("does not let pending visual work overwrite an external prompt revision", () => {
    let pendingVisualFrame: FrameRequestCallback | null = null;
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        pendingVisualFrame = callback;
        return 41;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);
    const { props, rerender } = renderComposer({
      prompt: "Initial draft",
      promptRevision: 0,
    });
    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;

    fireEvent.change(promptInput, {
      target: { value: "Pending local draft", selectionStart: 19 },
    });
    expect(requestAnimationFrameSpy).toHaveBeenCalledOnce();

    rerender(
      <TaskComposer
        {...props}
        prompt="Restored after setup failure"
        promptRevision={1}
      />,
    );
    act(() => {
      pendingVisualFrame?.(performance.now());
    });

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(41);
    expect(promptInput).toHaveValue("Restored after setup failure");
    expect(document.querySelector(".prompt-autosize-mirror")?.textContent).toBe(
      "Restored after setup failure\u200b",
    );
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  it("keeps rapid long-form input ordered and submits the latest local value", async () => {
    const onRun = vi.fn();
    const { user } = renderComposer({ onRun });
    const promptInput = screen.getByLabelText("Prompt");
    const prompt = Array.from({ length: 80 }, (_, index) => `word-${index}`).join(" ");

    await user.type(promptInput, prompt);
    await user.keyboard("{Enter}");

    expect(promptInput).toHaveValue(prompt);
    expect(onRun).toHaveBeenCalledWith(prompt);
  });

  it("coalesces multiline autosize presentation into one visual frame", () => {
    let visualFrame: FrameRequestCallback | null = null;
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        visualFrame = callback;
        return 1;
      });
    renderComposer();
    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    const prompt = "First line\nSecond line\nThird line";

    fireEvent.change(promptInput, {
      target: { value: prompt, selectionStart: prompt.length },
    });

    expect(promptInput).toHaveValue(prompt);
    expect(requestAnimationFrameSpy).toHaveBeenCalledOnce();
    expect(document.querySelector(".prompt-autosize-mirror")?.textContent).toBe(
      "\u200b",
    );
    act(() => {
      visualFrame?.(performance.now());
    });
    expect(document.querySelector(".prompt-autosize-mirror")?.textContent).toBe(
      `${prompt}\u200b`,
    );
    requestAnimationFrameSpy.mockRestore();
  });

  it("enables submission even when WKWebView suspends animation frames", () => {
    vi.useFakeTimers();
    const frameSpy = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(41);
    try {
      renderComposer();
      fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "A native prompt", selectionStart: 15 } });
      expect(screen.getByRole("button", { name: "Run Codex" })).toBeDisabled();
      act(() => { vi.advanceTimersByTime(100); });
      expect(screen.getByRole("button", { name: "Run Codex" })).toBeEnabled();
      expect(document.querySelector(".prompt-autosize-mirror")?.textContent).toBe("A native prompt\u200b");
    } finally {
      cleanup();
      frameSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps the native draft current while coalescing rapid visual work", () => {
    let visualFrame: FrameRequestCallback | null = null;
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        visualFrame = callback;
        return 1;
      });
    const onPromptChange = vi.fn();
    renderComposer({ onPromptChange });
    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;

    for (const value of ["r", "re", "res", "resp", "respo", "responsive"]) {
      fireEvent.change(promptInput, {
        target: { value, selectionStart: value.length },
      });
    }

    expect(promptInput).toHaveValue("responsive");
    expect(onPromptChange).toHaveBeenLastCalledWith("responsive");
    expect(requestAnimationFrameSpy).toHaveBeenCalledOnce();
    act(() => {
      visualFrame?.(performance.now());
    });
    expect(document.querySelector(".prompt-autosize-mirror")?.textContent).toBe(
      "responsive\u200b",
    );
    requestAnimationFrameSpy.mockRestore();
  });

  it("does not run command searches while typing ordinary prompt text", async () => {
    const onMentionSearch = vi.fn();
    const onMentionClose = vi.fn();
    const onSlashCommandSearch = vi.fn();
    const onSlashCommandClose = vi.fn();
    const { user } = renderComposer({
      onMentionSearch,
      onMentionClose,
      onSlashCommandSearch,
      onSlashCommandClose,
    });

    await user.type(
      screen.getByLabelText("Prompt"),
      "Keep rapid typing responsive through a long ordinary sentence",
    );

    expect(onMentionSearch).not.toHaveBeenCalled();
    expect(onMentionClose).not.toHaveBeenCalled();
    expect(onSlashCommandSearch).not.toHaveBeenCalled();
    expect(onSlashCommandClose).not.toHaveBeenCalled();
  });

  it("preserves focus, selection, and draft text through streaming-state updates", () => {
    const { props, rerender } = renderComposer({
      prompt: "A long prompt remains editable",
      promptRevision: 0,
    });
    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    promptInput.focus();
    promptInput.setSelectionRange(7, 13);

    rerender(
      <TaskComposer
        {...props}
        prompt="stale parent prompt"
        promptRevision={0}
        runActive
      />,
    );

    expect(promptInput).toHaveValue("A long prompt remains editable");
    expect(promptInput).toHaveFocus();
    expect(promptInput.selectionStart).toBe(7);
    expect(promptInput.selectionEnd).toBe(13);
  });

  it("accepts a large paste-sized change with one bounded visual update", () => {
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame");
    renderComposer();
    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    const prompt = Array.from(
      { length: 2_000 },
      (_, index) => `line ${index}: preserve input responsiveness`,
    ).join("\n");

    fireEvent.change(promptInput, {
      target: { value: prompt, selectionStart: prompt.length },
    });

    expect(promptInput).toHaveValue(prompt);
    expect(
      (document.querySelector(".prompt-autosize-mirror")?.textContent ?? "")
        .length,
    ).toBeLessThan(100);
    expect(requestAnimationFrameSpy).toHaveBeenCalledOnce();
    requestAnimationFrameSpy.mockRestore();
  });

  it("leaves native undo, redo, and cursor movement shortcuts to the textarea", () => {
    renderComposer();
    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;

    expect(
      fireEvent.keyDown(promptInput, { key: "z", metaKey: true }),
    ).toBe(true);
    expect(
      fireEvent.keyDown(promptInput, { key: "z", metaKey: true, shiftKey: true }),
    ).toBe(true);
    expect(fireEvent.keyDown(promptInput, { key: "ArrowLeft" })).toBe(true);
    expect(fireEvent.keyDown(promptInput, { key: "ArrowRight" })).toBe(true);
  });

  it("preserves repeated and selection-based native deletion", async () => {
    const { user } = renderControlledComposer();
    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;

    await user.type(promptInput, "abcdef");
    await user.keyboard("{Backspace>3/}");
    expect(promptInput).toHaveValue("abc");

    promptInput.setSelectionRange(1, 3);
    await user.keyboard("{Delete}");
    expect(promptInput).toHaveValue("a");
    expect(promptInput).toHaveFocus();
  });

  it("preserves repeated printable input from a held key", async () => {
    const { user } = renderControlledComposer();
    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;

    promptInput.focus();
    await user.keyboard("{a>24/}");

    expect(promptInput).toHaveValue("a".repeat(24));
    expect(promptInput).toHaveFocus();
    expect(promptInput.selectionStart).toBe(24);
    expect(promptInput.selectionEnd).toBe(24);
  });

  it("does not run mention searches or normalize text during IME composition", () => {
    const onPromptChange = vi.fn();
    const onMentionSearch = vi.fn();
    renderComposer({ onPromptChange, onMentionSearch });
    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;

    fireEvent.compositionStart(promptInput);
    fireEvent.change(promptInput, {
      target: { value: "入力@file", selectionStart: 7 },
    });

    expect(promptInput).toHaveValue("入力@file");
    expect(onPromptChange).toHaveBeenLastCalledWith("入力@file");
    expect(onMentionSearch).not.toHaveBeenCalled();

    fireEvent.compositionEnd(promptInput, {
      data: "入力@file",
    });

    expect(onMentionSearch).toHaveBeenLastCalledWith("file");
  });

  it("adds a newline when pressing Shift Enter", async () => {
    const onRun = vi.fn();
    const { user } = renderControlledComposer({ onRun });
    const promptInput = screen.getByLabelText("Prompt");

    await user.type(promptInput, "First line");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.type(promptInput, "Second line");

    expect(onRun).not.toHaveBeenCalled();
    expect(promptInput).toHaveValue("First line\nSecond line");
  });

  it("enables spell check while disabling text substitutions and normalizing smart quotes", () => {
    const onPromptChange = vi.fn();
    renderControlledComposer({ onPromptChange });
    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;

    expect(promptInput).toHaveAttribute("autocapitalize", "none");
    expect(promptInput).toHaveAttribute("autocomplete", "off");
    expect(promptInput).toHaveAttribute("autocorrect", "off");
    expect(promptInput).toHaveAttribute("writingsuggestions", "false");
    expect(promptInput).toHaveAttribute("data-enable-grammarly", "false");
    expect(promptInput).toHaveAttribute("data-gramm", "false");
    expect(promptInput).toHaveAttribute("data-gramm_editor", "false");
    expect(promptInput).toHaveAttribute("spellcheck", "true");

    fireEvent.change(promptInput, {
      target: { value: "\u201chello\u201d and \u2018world\u2019" },
    });

    expect(onPromptChange).toHaveBeenLastCalledWith("\"hello\" and 'world'");
    expect(promptInput).toHaveValue("\"hello\" and 'world'");
  });

  it("opens workspace file mentions while typing an @ token", async () => {
    const onMentionSearch = vi.fn();
    const { user } = renderControlledComposer({
      onMentionSearch,
      mentionSearchStatus: "loaded",
      mentionResults: [
        {
          path: "/repo/src/App.tsx",
          name: "App.tsx",
          source: "search",
          status: "ready",
        },
      ],
    });

    await user.type(screen.getByLabelText("Prompt"), "@app");

    expect(onMentionSearch).toHaveBeenLastCalledWith("app");
    const listbox = screen.getByRole("listbox", {
      name: "Workspace file suggestions",
    });
    expect(listbox).toBeInTheDocument();
    expect(listbox).toHaveClass("mention-search-popover");
    const promptShell = listbox.closest(".prompt-shell");
    expect(promptShell).toContainElement(screen.getByLabelText("Prompt"));
    expect(promptShell?.nextElementSibling).toHaveClass("composer-meta-row");
    expect(screen.getByRole("option", { name: /app\.tsx/i })).toBeInTheDocument();
  });

  it("selects a mention with the keyboard and removes the typed @query", async () => {
    const onMentionFileSelect = vi.fn();
    const onMentionClose = vi.fn();
    const selectedFile = {
      path: "/repo/src/App.tsx",
      name: "App.tsx",
      source: "search" as const,
      status: "ready" as const,
    };
    const { user, onPromptChange } = renderControlledComposer({
      mentionSearchStatus: "loaded",
      mentionResults: [selectedFile],
      onMentionFileSelect,
      onMentionClose,
    });

    const promptInput = screen.getByLabelText("Prompt");
    await user.type(promptInput, "Fix @app");
    await user.keyboard("{Enter}");

    expect(onMentionFileSelect).toHaveBeenCalledWith(selectedFile);
    expect(onMentionClose).toHaveBeenCalled();
    expect(onPromptChange).toHaveBeenLastCalledWith("Fix TSX App.tsx ");
    expect(promptInput).toHaveValue("Fix TSX App.tsx ");
  });

  it("inserts a real space before inline file references typed after text", async () => {
    const selectedFile = {
      path: "/repo/src/App.tsx",
      name: "App.tsx",
      source: "search" as const,
      status: "ready" as const,
    };
    const { user, onPromptChange } = renderControlledComposer({
      mentionSearchStatus: "loaded",
      mentionResults: [selectedFile],
    });

    const promptInput = screen.getByLabelText("Prompt");
    await user.type(promptInput, "Fix@app");
    await user.keyboard("{Enter}");

    expect(onPromptChange).toHaveBeenLastCalledWith("Fix TSX App.tsx ");
    expect(promptInput).toHaveValue("Fix TSX App.tsx ");
  });

  it("selects a mention with the mouse", async () => {
    const onMentionFileSelect = vi.fn();
    const selectedFile = {
      path: "/repo/src/App.tsx",
      name: "App.tsx",
      source: "search" as const,
      status: "ready" as const,
    };
    const { user } = renderControlledComposer({
      mentionSearchStatus: "loaded",
      mentionResults: [selectedFile],
      onMentionFileSelect,
    });

    await user.type(screen.getByLabelText("Prompt"), "@app");
    await user.click(screen.getByRole("option", { name: /app\.tsx/i }));

    expect(onMentionFileSelect).toHaveBeenCalledWith(selectedFile);
    expect(screen.getByLabelText("Prompt")).toHaveValue("TSX App.tsx ");
  });

  it("renders inline file overlay text with the same text content as the textarea token", () => {
    renderComposer({
      prompt: "Fix TSX App.tsx now",
      contextFiles: [
        {
          path: "/repo/src/App.tsx",
          name: "App.tsx",
          source: "search",
          status: "ready",
        },
      ],
    });

    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    const highlight = document.querySelector(".prompt-inline-highlight");

    expect(highlight).not.toBeNull();
    expect(highlight?.textContent).toBe(promptInput.value);
  });

  it("removes the whole inline file reference when backspacing inside it", async () => {
    const onRemoveFile = vi.fn();
    const inlineFile = {
      path: "/repo/src/App.tsx",
      name: "App.tsx",
      source: "search" as const,
      status: "ready" as const,
    };
    const { user } = renderControlledComposer({
      prompt: "Fix TSX App.tsx now",
      contextFiles: [inlineFile],
      onRemoveFile,
    });

    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    promptInput.focus();
    promptInput.setSelectionRange("Fix TSX App.t".length, "Fix TSX App.t".length);
    await user.keyboard("{Backspace}");

    expect(onRemoveFile).toHaveBeenCalledWith("/repo/src/App.tsx");
    expect(promptInput).toHaveValue("Fix now");
  });

  it("removes the whole inline file reference when backspacing after it", async () => {
    const onRemoveFile = vi.fn();
    const inlineFile = {
      path: "/repo/src/App.tsx",
      name: "App.tsx",
      source: "search" as const,
      status: "ready" as const,
    };
    const { user } = renderControlledComposer({
      prompt: "Fix TSX App.tsx ",
      contextFiles: [inlineFile],
      onRemoveFile,
    });

    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    promptInput.focus();
    promptInput.setSelectionRange(promptInput.value.length, promptInput.value.length);
    await user.keyboard("{Backspace}");

    expect(onRemoveFile).toHaveBeenCalledWith("/repo/src/App.tsx");
    expect(promptInput).toHaveValue("Fix ");
  });

  it("closes mention search with Escape", async () => {
    const onMentionClose = vi.fn();
    const { user } = renderControlledComposer({
      onMentionClose,
      mentionSearchStatus: "loaded",
      mentionResults: [
        {
          path: "/repo/src/App.tsx",
          name: "App.tsx",
          source: "search",
          status: "ready",
        },
      ],
    });

    await user.type(screen.getByLabelText("Prompt"), "@app");
    await user.keyboard("{Escape}");

    expect(onMentionClose).toHaveBeenCalled();
    expect(
      screen.queryByRole("listbox", { name: "Workspace file suggestions" }),
    ).not.toBeInTheDocument();
  });

  it("renders mention search empty, disabled, loading, error, and no-result states", async () => {
    const disabled = renderControlledComposer({
      mentionSearchStatus: "disabled",
    });

    await disabled.user.type(screen.getByLabelText("Prompt"), "@app");
    expect(screen.getByText("Choose a folder first.")).toBeInTheDocument();
    disabled.unmount();

    const empty = renderControlledComposer({
      mentionSearchStatus: "loaded",
    });
    await empty.user.type(screen.getByLabelText("Prompt"), "@");
    expect(screen.getByText("Type a file name.")).toBeInTheDocument();
    empty.unmount();

    const loading = renderControlledComposer({
      mentionSearchStatus: "loading",
    });
    await loading.user.type(screen.getByLabelText("Prompt"), "@app");
    expect(screen.getByText("Searching files...")).toBeInTheDocument();
    loading.unmount();

    const errored = renderControlledComposer({
      mentionSearchStatus: "error",
      mentionSearchError: "Index failed",
    });
    await errored.user.type(screen.getByLabelText("Prompt"), "@app");
    expect(screen.getByText("Index failed")).toBeInTheDocument();
    errored.unmount();

    const noResults = renderControlledComposer({
      mentionSearchStatus: "loaded",
      mentionResults: [],
    });
    await noResults.user.type(screen.getByLabelText("Prompt"), "@app");
    expect(screen.getByText("No files found.")).toBeInTheDocument();
  });

  it("opens slash command suggestions while typing a / token", async () => {
    const onSlashCommandSearch = vi.fn();
    const { user } = renderControlledComposer({
      onSlashCommandSearch,
      slashCommandSearchStatus: "loaded",
      slashCommandResults: [
        {
          kind: "builtin",
          command: "plan",
          title: "Plan mode",
          description: "Turn on plan-first routing",
        },
      ],
    });

    await user.type(screen.getByLabelText("Prompt"), "/pla");

    expect(onSlashCommandSearch).toHaveBeenLastCalledWith("pla");
    const listbox = screen.getByRole("listbox", {
      name: "Slash command suggestions",
    });
    expect(listbox).toHaveClass("mention-search-popover");
    expect(screen.getByRole("option", { name: /plan mode/i })).toBeInTheDocument();
  });

  it("selects a slash command with the keyboard and removes the typed /query", async () => {
    const onSlashCommandSelect = vi.fn();
    const onSlashCommandClose = vi.fn();
    const command = {
      kind: "builtin" as const,
      command: "goal" as const,
      title: "Goal",
      description: "Set a persistent objective",
    };
    const { user, onPromptChange } = renderControlledComposer({
      slashCommandSearchStatus: "loaded",
      slashCommandResults: [command],
      onSlashCommandSelect,
      onSlashCommandClose,
    });

    const promptInput = screen.getByLabelText("Prompt");
    await user.type(promptInput, "Use /goal");
    await user.keyboard("{Enter}");

    expect(onSlashCommandSelect).toHaveBeenCalledWith(command);
    expect(onSlashCommandClose).toHaveBeenCalled();
    expect(onPromptChange).toHaveBeenLastCalledWith("Use");
    expect(promptInput).toHaveValue("Use");
  });

  it("opens reasoning choices from the slash reasoning command", async () => {
    const onReasoningEffortChange = vi.fn();
    const reasoningCommand = {
      kind: "builtin" as const,
      command: "reasoning" as const,
      title: "Reasoning",
      description: "Choose effort",
    };
    const { user } = renderControlledComposer({
      slashCommandSearchStatus: "loaded",
      slashCommandResults: [reasoningCommand],
      onReasoningEffortChange,
    });

    await user.type(screen.getByLabelText("Prompt"), "/rea");
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("listbox", { name: "Reasoning effort suggestions" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /high/i }));
    expect(onReasoningEffortChange).toHaveBeenCalledWith("high");
    expect(screen.getByLabelText("Prompt")).toHaveValue("");
  });

  it("renders slash skill chips and removes them", async () => {
    const onRemoveSkill = vi.fn();
    const { user } = renderComposer({
      selectedSkills: [
        {
          id: "docs",
          name: "Docs",
          description: "Use project documentation",
        },
      ],
      onRemoveSkill,
    });

    expect(screen.getByText("Docs")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /remove docs/i }));
    expect(onRemoveSkill).toHaveBeenCalledWith("docs");
  });

  it("does not open slash commands for ordinary relative file paths", async () => {
    const onSlashCommandSearch = vi.fn();
    const { user } = renderControlledComposer({
      onSlashCommandSearch,
      slashCommandSearchStatus: "loaded",
      slashCommandResults: [
        {
          kind: "builtin",
          command: "status",
          title: "Status",
          description: "Show status",
        },
      ],
    });

    await user.type(screen.getByLabelText("Prompt"), "Open src/App.tsx");

    expect(onSlashCommandSearch).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("listbox", { name: "Slash command suggestions" }),
    ).not.toBeInTheDocument();
  });
});
