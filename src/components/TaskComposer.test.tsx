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

function renderComposer(overrides: Partial<TaskComposerProps> = {}) {
  const props: TaskComposerProps = {
    disabled: false,
    prompt: "",
    routeRecommendation: "direct-run",
    tokenEstimate: 0,
    models,
    modelLoadError: null,
    selectedModelId: "gpt-5.1-codex",
    selectedReasoningEffort: "medium",
    goalMode: false,
    planMode: false,
    accessLevel: "ask",
    contextFiles: [],
    onPromptChange: vi.fn(),
    onModelChange: vi.fn(),
    onReasoningEffortChange: vi.fn(),
    onGoalModeChange: vi.fn(),
    onPlanModeChange: vi.fn(),
    onAccessLevelChange: vi.fn(),
    onAddFiles: vi.fn(),
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

    await user.selectOptions(screen.getByLabelText("Agent"), "gpt-5.1-codex-max");
    await user.selectOptions(screen.getByLabelText("Reasoning"), "high");

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

    await user.selectOptions(screen.getByLabelText("Access"), "full");
    await user.selectOptions(screen.getByLabelText("Access"), "ask");

    expect(onAccessLevelChange).toHaveBeenCalledWith("full");
    expect(onAccessLevelChange).toHaveBeenCalledWith("ask");
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
