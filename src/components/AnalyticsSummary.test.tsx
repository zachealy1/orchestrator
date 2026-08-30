import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Workspace } from "../features/workspaces/types";
import { AnalyticsSummary } from "./AnalyticsSummary";

const workspaces: Workspace[] = [
  {
    id: 1,
    path: "/repo/platform",
    label: "Platform",
    default_account_id: null,
    selected_git_repository_path: null,
    last_opened_at: "2026-08-20T08:00:00Z",
    created_at: "2026-08-01T08:00:00Z",
  },
  {
    id: 2,
    path: "/repo/services",
    label: "Services",
    default_account_id: null,
    selected_git_repository_path: null,
    last_opened_at: "2026-08-19T08:00:00Z",
    created_at: "2026-08-02T08:00:00Z",
  },
];

describe("AnalyticsSummary", () => {
  it("renders real summary data and exposes workspace and date filters", async () => {
    const user = userEvent.setup();
    const onWorkspaceFilterChange = vi.fn();
    const onRangeChange = vi.fn();

    render(
      <AnalyticsSummary
        summary={{
          run_count: 20,
          completed_count: 18,
          failed_count: 2,
          total_tokens: 120_000,
          cached_tokens: 48_000,
          avg_duration_ms: 42_000,
        }}
        activity={[
          {
            date: "2026-08-19",
            completed_count: 8,
            failed_count: 1,
            total_tokens: 50_000,
          },
          {
            date: "2026-08-20",
            completed_count: 10,
            failed_count: 1,
            total_tokens: 70_000,
          },
        ]}
        workspaces={workspaces}
        workspaceFilter={null}
        range="30d"
        onWorkspaceFilterChange={onWorkspaceFilterChange}
        onRangeChange={onRangeChange}
      />,
    );

    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getAllByText("90%").length).toBeGreaterThan(0);
    expect(
      screen.queryByText("A clear view of how your workspaces are performing"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Showing data across 2 workspaces"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Completed and failed runs over time" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filter by workspace" }));
    expect(
      screen.getByRole("menuitemcheckbox", { name: /All workspaces/ }),
    ).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Platform" }));
    expect(onWorkspaceFilterChange).toHaveBeenCalledWith([1]);

    await user.click(screen.getByRole("combobox", { name: "Date range" }));
    await user.click(screen.getByRole("option", { name: "Last 90 days" }));
    expect(onRangeChange).toHaveBeenCalledWith("90d");
  });
});
