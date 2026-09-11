import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitBranchList } from "../../workspaces/types";
import { KanbanTargetBranchSelect } from "./KanbanTargetBranchSelect";

const mocks = vi.hoisted(() => ({ listGitBranches: vi.fn() }));
vi.mock("../../../codexClient", () => mocks);
const target = { repositoryPath: "/workspace/repo", branch: "release" };
const props = () => ({ active: true, workspacePath: "/workspace", repositoryPath: target.repositoryPath, disabled: false, onSave: vi.fn().mockResolvedValue(undefined), onError: vi.fn() });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.listGitBranches.mockResolvedValue({ branches: ["main", "release"], currentBranch: "main" });
});

describe("Kanban branch selection", () => {
  it("initializes the current source branch once and lists existing branches with chat styling", async () => {
    const user = userEvent.setup();
    const callbacks = props();
    render(<KanbanTargetBranchSelect {...callbacks} />);
    await waitFor(() => expect(callbacks.onSave).toHaveBeenCalledWith({ ...target, branch: "main" }, true));
    const trigger = screen.getByRole("combobox", { name: "Target branch" });
    expect(trigger.closest(".workspace-branch-select")).toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByRole("option", { name: "release" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Create branch..." })).not.toBeInTheDocument();
    expect(mocks.listGitBranches).toHaveBeenCalledWith("/workspace", "/workspace/repo");
    expect(callbacks.onSave).toHaveBeenCalledTimes(1);
  });

  it("keeps the persisted target independent of chat and supports keyboard selection", async () => {
    const user = userEvent.setup();
    const callbacks = props();
    render(<KanbanTargetBranchSelect {...callbacks} target={target} />);
    const trigger = screen.getByRole("combobox", { name: "Target branch" });
    await waitFor(() => expect(trigger).toHaveTextContent("release"));
    await waitFor(() => expect(trigger).toBeEnabled());
    trigger.focus();
    await user.keyboard("{ArrowDown}{Home}{Enter}");
    expect(callbacks.onSave).toHaveBeenCalledWith({ ...target, branch: "main" });
    expect(trigger).toHaveTextContent("release");
  });

  it("displays a deleted target as unavailable and refreshes options when reopened", async () => {
    const user = userEvent.setup();
    mocks.listGitBranches.mockResolvedValue({ branches: ["main"], currentBranch: "main" });
    render(<KanbanTargetBranchSelect {...props()} target={target} />);
    const trigger = screen.getByRole("combobox", { name: "Target branch" });
    await waitFor(() => expect(trigger).toHaveTextContent("release (unavailable)"));
    mocks.listGitBranches.mockResolvedValue({ branches: ["main", "release"], currentBranch: "main" });
    await user.click(trigger);
    await waitFor(() => expect(trigger).toHaveTextContent(/^release$/));
  });

  it("discards requests from the previous repository", async () => {
    let finish!: (value: GitBranchList) => void;
    mocks.listGitBranches.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const callbacks = props();
    const view = render(<KanbanTargetBranchSelect {...callbacks} />);
    view.unmount();
    render(<KanbanTargetBranchSelect {...callbacks} repositoryPath="/other" target={{ repositoryPath: "/other", branch: "main" }} />);
    await act(async () => { finish({ branches: ["stale"], currentBranch: "stale" }); });
    expect(callbacks.onSave).not.toHaveBeenCalled();
    expect(screen.queryByText("stale")).not.toBeInTheDocument();
  });

  it("reports save failures while retaining the committed target", async () => {
    const user = userEvent.setup();
    const callbacks = props();
    callbacks.onSave.mockRejectedValue(new Error("database unavailable"));
    render(<KanbanTargetBranchSelect {...callbacks} target={target} />);
    const trigger = screen.getByRole("combobox", { name: "Target branch" });
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "main" }));
    await waitFor(() => expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining("database unavailable")));
    expect(trigger).toHaveTextContent("release");
  });
});
