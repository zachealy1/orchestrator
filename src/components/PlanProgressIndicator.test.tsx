import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PlanProgressIndicator } from "./PlanProgressIndicator";

describe("PlanProgressIndicator", () => {
  it("renders compact step, state, label, and progress information", () => {
    const { container } = render(
      <PlanProgressIndicator
        progress={{
          currentStep: 2,
          totalSteps: 4,
          completedSteps: 1,
          progressPercent: 25,
          stepLabel: "Run focused tests",
          state: "in-progress",
          steps: [
            { step: "Inspect the repository", status: "completed" },
            { step: "Run focused tests", status: "in_progress" },
            { step: "Review the diff", status: "pending" },
            { step: "Report the result", status: "pending" },
          ],
        }}
      />,
    );

    const indicator = screen.getByRole("status");
    const indicatorShell = container.querySelector(".plan-progress-indicator");
    expect(indicator).toHaveTextContent("Step 2 / 4");
    expect(indicator).toHaveTextContent("Run focused tests");
    expect(indicator).toHaveTextContent("In progress");
    expect(indicatorShell).toHaveAttribute("data-state", "in-progress");
    expect(container.querySelector(".plan-progress-marker")).toBeNull();
    expect(container.querySelector(".plan-progress-pulse")).toBeNull();
    expect(container.querySelector(".plan-progress-fill")).toHaveStyle({
      width: "25%",
    });
  });

  it("shows every named step in a hover and keyboard-focus tooltip", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PlanProgressIndicator
        progress={{
          currentStep: 2,
          totalSteps: 3,
          completedSteps: 1,
          progressPercent: 33,
          stepLabel: "Implement the change",
          state: "in-progress",
          steps: [
            { step: "Inspect the repository", status: "completed" },
            { step: "Implement the change", status: "in_progress" },
            { step: "Run verification", status: "pending" },
          ],
        }}
      />,
    );

    const indicator = container.querySelector(".plan-progress-indicator");
    expect(indicator).not.toBeNull();
    const tooltip = screen.getByRole("tooltip", { hidden: true });
    expect(tooltip).toHaveTextContent("Inspect the repository");
    expect(tooltip).toHaveTextContent("Implement the change");
    expect(tooltip).toHaveTextContent("Run verification");
    expect(indicator).toHaveAttribute("data-tooltip-visible", "false");

    await user.hover(indicator as HTMLElement);
    expect(indicator).toHaveAttribute("data-tooltip-visible", "true");
    expect(indicator).toHaveAttribute("aria-describedby", tooltip.id);

    await user.unhover(indicator as HTMLElement);
    await user.tab();
    expect(indicator).toHaveFocus();
    expect(indicator).toHaveAttribute("data-tooltip-visible", "true");
  });

  it("uses a non-animated state when progress is waiting for approval", () => {
    const { container } = render(
      <PlanProgressIndicator
        progress={{
          currentStep: 3,
          totalSteps: 5,
          completedSteps: 2,
          progressPercent: 40,
          stepLabel: "Apply workspace changes",
          state: "waiting-approval",
          steps: [
            { step: "Inspect the repository", status: "completed" },
            { step: "Draft the change", status: "completed" },
            { step: "Apply workspace changes", status: "in_progress" },
            { step: "Run verification", status: "pending" },
            { step: "Report the result", status: "pending" },
          ],
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Waiting for approval",
    );
    expect(container.querySelector(".plan-progress-marker")).toBeNull();
  });
});
