import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskComposer } from "./TaskComposer";
import type { ComponentProps } from "react";

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
    prompt: "",
    routeRecommendation: "direct-run",
    tokenEstimate: 0,
    accounts,
    selectedAccountId: 7,
    accountSelectionDisabled: false,
    branches: ["main", "feature/chat-controls"],
    selectedBranch: "main",
    models,
    modelLoadError: null,
    selectedModelId: "gpt-5.1-codex",
    selectedReasoningEffort: "medium",
    goalMode: false,
    planMode: false,
    accessLevel: "ask",
    contextFiles: [],
    onAccountChange: vi.fn(),
    onBranchChange: vi.fn(),
    onPromptChange: vi.fn(),
    onModelChange: vi.fn(),
    onReasoningEffortChange: vi.fn(),
    onGoalModeChange: vi.fn(),
    onPlanModeChange: vi.fn(),
    onAccessLevelChange: vi.fn(),
    onAddFiles: vi.fn(),
    onContextFilesDrop: vi.fn(),
    onRemoveFile: vi.fn(),
    onPreflight: vi.fn(),
    onRun: vi.fn(),
    ...overrides,
  };

  return {
    props,
    user: userEvent.setup(),
    ...render(<TaskComposer {...props} />),
  };
}

describe("TaskComposer", () => {
  it("updates the prompt and exposes advisory actions", async () => {
    const onPromptChange = vi.fn();
    const onPreflight = vi.fn();
    const { user } = renderComposer({ onPromptChange, onPreflight });

    await user.type(screen.getByLabelText("Prompt"), "Fix the tests");
    await user.click(screen.getByRole("button", { name: /preflight/i }));

    expect(onPromptChange).toHaveBeenCalled();
    expect(onPreflight).toHaveBeenCalledOnce();
  });

  it("removes the old OSS and approval banner", () => {
    renderComposer();

    expect(screen.queryByText("Use Codex OSS mode")).not.toBeInTheDocument();
    expect(screen.queryByText("workspace-write")).not.toBeInTheDocument();
    expect(screen.queryByText("on-request approvals")).not.toBeInTheDocument();
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

  it("keeps Add files beside the mode controls and removes file search", () => {
    renderComposer();

    const toolbar = screen.getByRole("toolbar", { name: /prompt actions/i });
    expect(within(toolbar).getByRole("button", { name: /goal mode/i })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: /plan mode/i })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: /add files/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/search workspace files/i)).not.toBeInTheDocument();
  });

  it("renders access level as a dropdown", async () => {
    const onAccessLevelChange = vi.fn();
    const { user } = renderComposer({ onAccessLevelChange });

    await user.click(screen.getByRole("combobox", { name: "Access" }));
    await user.click(screen.getByRole("option", { name: "Full access" }));
    await user.click(screen.getByRole("combobox", { name: "Access" }));
    await user.click(screen.getByRole("option", { name: "Ask for approval" }));

    expect(onAccessLevelChange).toHaveBeenCalledWith("full");
    expect(onAccessLevelChange).toHaveBeenCalledWith("ask");
  });

  it("keeps workspace selection out of the composer and renders branches", async () => {
    const onBranchChange = vi.fn();
    const { user } = renderComposer({ onBranchChange });

    expect(
      screen.queryByRole("combobox", { name: "Folder" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Branch" }));
    await user.click(
      screen.getByRole("option", { name: "feature/chat-controls" }),
    );

    expect(onBranchChange).toHaveBeenCalledWith("feature/chat-controls");
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

  it("renders selected file chips and removes files", async () => {
    const onRemoveFile = vi.fn();
    const { user } = renderComposer({
      onRemoveFile,
      contextFiles: [
        {
          path: "/repo/src/App.tsx",
          name: "App.tsx",
          source: "picker",
          status: "ready",
        },
      ],
    });

    expect(screen.getByText("App.tsx")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /remove app\.tsx/i }));
    expect(onRemoveFile).toHaveBeenCalledWith("/repo/src/App.tsx");
  });

  it("keeps launch controls disabled until the advisory gate is ready", () => {
    renderComposer({ disabled: true });

    expect(screen.getByRole("button", { name: /run codex/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /preflight/i })).toBeDisabled();
  });
});
