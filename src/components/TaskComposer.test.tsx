import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskComposer } from "./TaskComposer";
import { useState } from "react";
import type { ComponentProps } from "react";
import { ORCHESTRATOR_PROMPT_CONTEXT_MIME } from "../types";

type TaskComposerProps = ComponentProps<typeof TaskComposer>;

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
    ...render(<TaskComposer {...props} />),
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
    ...render(<ControlledComposer />),
  };
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

  it("disables Access while a run is active", () => {
    renderComposer({ runActive: true });

    expect(screen.getByRole("combobox", { name: "Access" })).toBeDisabled();
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
    const dataTransfer = createContextFileDataTransfer([
      {
        path: "/repo/README.md",
        name: "README.md",
        source: "explorer",
        status: "ready",
      },
    ]);

    fireEvent.dragOver(composer, { dataTransfer });
    expect(composer).toHaveClass("drop-target-active");
    fireEvent.drop(composer, { dataTransfer });

    expect(onContextFilesDrop).toHaveBeenCalledWith([
      {
        path: "/repo/README.md",
        name: "README.md",
        source: "explorer",
        status: "ready",
      },
    ]);
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
    const dataTransfer = createEmptyDataTransfer();

    fireEvent.dragOver(composer, { dataTransfer });
    expect(composer).toHaveClass("drop-target-active");
    fireEvent.drop(composer, { dataTransfer });

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

    fireEvent.drop(screen.getByLabelText("Task composer"), { dataTransfer });

    expect(onContextFilesDrop).toHaveBeenCalledWith([
      {
        path: "/repo/AGENTS.md",
        name: "AGENTS.md",
        source: "explorer",
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

    fireEvent.drop(screen.getByLabelText("Task composer"), { dataTransfer });

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

  it("submits the prompt when pressing Enter", async () => {
    const onRun = vi.fn();
    const { user } = renderControlledComposer({ onRun });
    const promptInput = screen.getByLabelText("Prompt");

    await user.type(promptInput, "Fix the failing test{Enter}");

    expect(onRun).toHaveBeenCalledOnce();
    expect(onRun).toHaveBeenCalledWith("Fix the failing test");
    expect(promptInput).toHaveValue("Fix the failing test");
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

  it("sizes multiline drafts through a declarative mirror without layout frames", () => {
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame");
    renderComposer();
    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    const prompt = "First line\nSecond line\nThird line";

    fireEvent.change(promptInput, {
      target: { value: prompt, selectionStart: prompt.length },
    });

    expect(document.querySelector(".prompt-autosize-mirror")?.textContent).toBe(
      `${prompt}\u200b`,
    );
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
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

  it("accepts a large paste-sized change without scheduling layout measurement", () => {
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
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
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

  it("disables text substitutions and normalizes smart quotes back to typed quotes", () => {
    const onPromptChange = vi.fn();
    renderControlledComposer({ onPromptChange });
    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;

    expect(promptInput).toHaveAttribute("autocapitalize", "none");
    expect(promptInput).toHaveAttribute("autocomplete", "off");
    expect(promptInput).toHaveAttribute("autocorrect", "off");
    expect(promptInput).toHaveAttribute("data-enable-grammarly", "false");
    expect(promptInput).toHaveAttribute("data-gramm", "false");
    expect(promptInput).toHaveAttribute("data-gramm_editor", "false");
    expect(promptInput).toHaveAttribute("spellcheck", "false");

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
