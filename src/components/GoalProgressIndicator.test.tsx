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
        onEdit={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const indicator = screen.getByLabelText("Goal progress");
    const content = indicator.querySelector(".composer-strip-content");
    expect(indicator).toHaveClass(
      "composer-strip-row",
      "goal-progress-indicator",
    );
    expect(indicator).toHaveAttribute("data-tone", "active");
    expect(
      Array.from(content!.children).map((element) => element.className),
    ).toEqual([
      "composer-strip-icon",
      "composer-strip-primary",
      "composer-strip-end",
    ]);
    expect(
      Array.from(
        content!.querySelector(".composer-strip-primary")!.children,
      ).map((element) => element.className),
    ).toEqual([
      "composer-strip-title",
      "composer-strip-meta",
      "composer-strip-description",
    ]);
    expect(
      Array.from(
        content!.querySelector(".composer-strip-end")!.children,
      ).map((element) => element.className),
    ).toEqual([
      "composer-strip-state",
      "composer-strip-trailing",
    ]);
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
        onEdit={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const indicator = screen.getByLabelText("Goal progress");
    expect(indicator).toHaveAttribute("data-tone", "muted");
    act(() => vi.advanceTimersByTime(5_000));
    expect(indicator).toHaveTextContent("1hr 52m 6s");
    fireEvent.click(screen.getByRole("button", { name: "Resume goal" }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("disables duplicate actions and limits pause or resume by state", () => {
    const { rerender } = render(
      <GoalProgressIndicator
        progress={goal({ actionPending: "pausing" })}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onEdit={vi.fn()}
        onStop={vi.fn()}
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
        onEdit={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByText("Budget limited")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Pause goal" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Resume goal" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit goal" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Stop goal" })).toBeEnabled();
  });

  it("renders shared icon-only edit and stop actions and blocks duplicates", () => {
    const onEdit = vi.fn();
    const onStop = vi.fn();
    const { rerender } = render(
      <GoalProgressIndicator
        progress={goal()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onEdit={onEdit}
        onStop={onStop}
      />,
    );

    const edit = screen.getByRole("button", { name: "Edit goal" });
    const stop = screen.getByRole("button", { name: "Stop goal" });
    const pause = screen.getByRole("button", { name: "Pause goal" });
    expect(edit).toHaveClass("native-plan-icon-action");
    expect(stop).toHaveClass("native-plan-icon-action", "cancel");
    expect(pause).toHaveAttribute("data-tooltip", "Pause goal");
    expect(edit).toHaveAttribute("data-tooltip", "Edit goal");
    expect(stop).toHaveAttribute("data-tooltip", "Stop goal");
    expect(pause).not.toHaveAttribute("title");
    expect(edit).not.toHaveAttribute("title");
    expect(stop).not.toHaveAttribute("title");
    expect(edit).not.toHaveTextContent("Edit goal");
    expect(stop).not.toHaveTextContent("Stop goal");

    fireEvent.click(edit);
    fireEvent.click(stop);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);

    rerender(
      <GoalProgressIndicator
        progress={goal({ actionPending: "editing" })}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onEdit={onEdit}
        onStop={onStop}
      />,
    );
    expect(screen.getByText("Preparing edit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause goal" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit goal" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop goal" })).toBeDisabled();
  });

  it("keeps a long objective available while using the shared truncating slot", () => {
    const objective =
      "Standardise every composer status row without allowing long goal objectives to change the compact row height";

    render(
      <GoalProgressIndicator
        progress={goal({ objective })}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onEdit={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const description = screen.getByTitle(objective);
    expect(description).toHaveClass("composer-strip-description");
    expect(description).toHaveAttribute("aria-label", `Goal: ${objective}`);
  });
});
