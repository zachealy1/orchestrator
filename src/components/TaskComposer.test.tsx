import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskComposer } from "./TaskComposer";

describe("TaskComposer", () => {
  it("updates the prompt and exposes advisory actions", async () => {
    const user = userEvent.setup();
    const onPromptChange = vi.fn();
    const onPreflight = vi.fn();

    render(
      <TaskComposer
        disabled={false}
        prompt=""
        improvedPrompt=""
        routeRecommendation="direct-run"
        tokenEstimate={0}
        useOss={false}
        ossProvider="ollama"
        onPromptChange={onPromptChange}
        onUseOssChange={vi.fn()}
        onOssProviderChange={vi.fn()}
        onPreflight={onPreflight}
        onPlanFirst={vi.fn()}
        onRun={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Prompt"), "Fix the tests");
    await user.click(screen.getByRole("button", { name: /preflight/i }));

    expect(onPromptChange).toHaveBeenCalled();
    expect(onPreflight).toHaveBeenCalledOnce();
  });

  it("keeps launch controls disabled until the advisory gate is ready", () => {
    render(
      <TaskComposer
        disabled
        prompt=""
        improvedPrompt=""
        routeRecommendation="plan-first"
        tokenEstimate={0}
        useOss={false}
        ossProvider="ollama"
        onPromptChange={vi.fn()}
        onUseOssChange={vi.fn()}
        onOssProviderChange={vi.fn()}
        onPreflight={vi.fn()}
        onPlanFirst={vi.fn()}
        onRun={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /run codex/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /plan first/i })).toBeDisabled();
  });
});
