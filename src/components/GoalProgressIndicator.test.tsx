import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalProgressIndicator } from "./GoalProgressIndicator";
import type { GoalProgressIndicatorModel } from "../lib/goalProgress";

function goal(
  overrides: Partial<GoalProgressIndicatorModel> = {},
): GoalProgressIndicatorModel {
  return {
    threadId: "thread-1",
    objective: "Finish the repository migration",
    status: "active",
    timeUsedSeconds: 6_726,
    observedAtMs: 10_000,
    actionPending: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("GoalProgressIndicator", () => {
  it("shows the objective, active duration, state, and pause action", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const onPause = vi.fn();

    render(
      <GoalProgressIndicator
        progress={goal()}
        onPause={onPause}
        onResume={vi.fn()}
      />,
    );

    const indicator = screen.getByLabelText("Goal progress");
    expect(indicator).toHaveTextContent("Goal");
    expect(indicator).toHaveTextContent("1hr 52m 6s");
    expect(indicator).toHaveTextContent("Finish the repository migration");
    expect(indicator).toHaveTextContent("In progress");

    act(() => vi.advanceTimersByTime(2_000));
    expect(indicator).toHaveTextContent("1hr 52m 8s");
    fireEvent.click(screen.getByRole("button", { name: "Pause goal" }));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it("freezes paused time and exposes a resume action", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const onResume = vi.fn();

    render(
      <GoalProgressIndicator
        progress={goal({ status: "paused" })}
        onPause={vi.fn()}
        onResume={onResume}
      />,
    );

    const indicator = screen.getByLabelText("Goal progress");
    act(() => vi.advanceTimersByTime(5_000));
    expect(indicator).toHaveTextContent("1hr 52m 6s");
    fireEvent.click(screen.getByRole("button", { name: "Resume goal" }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("disables duplicate actions and leaves limited goals informational", () => {
    const { rerender } = render(
      <GoalProgressIndicator
        progress={goal({ actionPending: "pausing" })}
        onPause={vi.fn()}
        onResume={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Pause goal" })).toBeDisabled();
    expect(screen.getByText("Pausing")).toBeInTheDocument();

    rerender(
      <GoalProgressIndicator
        progress={goal({
          status: "budgetLimited",
          actionPending: null,
        })}
        onPause={vi.fn()}
        onResume={vi.fn()}
      />,
    );
    expect(screen.getByText("Budget limited")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /goal/i }),
    ).not.toBeInTheDocument();
  });
});
