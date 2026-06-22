import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PreflightPanel } from "./PreflightPanel";

describe("PreflightPanel", () => {
  it("renders checks and applies recommendations", async () => {
    const user = userEvent.setup();
    const onApplyRecommendation = vi.fn();

    render(
      <PreflightPanel
        report={{
          workspacePath: "/tmp/repo",
          tokenEstimate: 100,
          contextBudget: 128000,
          routeRecommendation: "plan-first",
          improvedPrompt: "Objective:\nFix",
          checks: [
            {
              id: "git",
              label: "Git repository",
              status: "pass",
              message: "Workspace is inside a Git repository",
              detail: null,
            },
            {
              id: "dirty",
              label: "Working tree",
              status: "warn",
              message: "2 changed files detected",
              detail: "M src/App.tsx",
            },
          ],
          recommendations: [
            {
              kind: "subagent",
              title: "Delegate exploration",
              body: "Spawn an explorer subagent.",
            },
          ],
        }}
        onApplyRecommendation={onApplyRecommendation}
      />,
    );

    expect(screen.getByText("Git repository")).toBeInTheDocument();
    expect(screen.getByText("2 changed files detected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /apply/i }));
    expect(onApplyRecommendation).toHaveBeenCalledWith({
      kind: "subagent",
      title: "Delegate exploration",
      body: "Spawn an explorer subagent.",
    });
  });
});
