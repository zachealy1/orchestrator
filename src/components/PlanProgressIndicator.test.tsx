import { render, screen } from "@testing-library/react";
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
        }}
      />,
    );

    const indicator = screen.getByRole("status");
    expect(indicator).toHaveTextContent("Step 2 / 4");
    expect(indicator).toHaveTextContent("Run focused tests");
    expect(indicator).toHaveTextContent("In progress");
    expect(indicator).toHaveAttribute("data-state", "in-progress");
    expect(container.querySelector(".plan-progress-pulse")).toBeInTheDocument();
    expect(container.querySelector(".plan-progress-fill")).toHaveStyle({
      width: "25%",
    });
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
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Waiting for approval",
    );
    expect(container.querySelector(".plan-progress-pulse")).toBeNull();
  });
});
