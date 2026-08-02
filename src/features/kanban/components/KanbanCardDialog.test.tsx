import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KanbanCardDialog } from "./KanbanCardDialog";
import type { KanbanCard } from "./types";

const repositories = [
  { id: "repo-1", label: "orchestrator", path: "/workspace/orchestrator" },
  { id: "repo-2", label: "docs", path: "/workspace/docs" },
];

const options = [{ value: "gpt-5", label: "GPT-5" }];

function existingCard(): KanbanCard {
  return {
    id: "card-1",
    title: "Original task",
    description: "Preserve this task description",
    columnId: "in-review",
    position: 0,
    repositoryScope: "selected",
    repositories: [repositories[0]!],
    accountId: "account-1",
    accountLabel: "Work",
    accessMode: "full-access",
    model: "gpt-5",
    modelLabel: "GPT-5",
    reasoningLevel: "high",
    executionState: "completed-awaiting-review",
    branches: [
      {
        repositoryId: "repo-1",
        repositoryLabel: "orchestrator",
        branch: "codex/card-1",
        worktreePath: "/worktrees/card-1",
      },
    ],
  };
}

function dialogProps(onSubmit = vi.fn()) {
  return {
    open: true,
    mode: "create" as const,
    repositories,
    accountOptions: [{ value: "account-1", label: "Work" }],
    modelOptions: options,
    reasoningOptions: [{ value: "high", label: "High" }],
    onCancel: vi.fn(),
    onSubmit,
  };
}

describe("KanbanCardDialog", () => {
  it("validates required fields and selected repository scope before submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<KanbanCardDialog {...dialogProps(onSubmit)} />);

    await user.click(screen.getByRole("button", { name: "Create card" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a card title.");

    await user.type(screen.getByLabelText("Title"), "  Build board  ");
    await user.click(screen.getByRole("button", { name: "Create card" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Describe the work for the agent.",
    );

    await user.type(screen.getByLabelText("Description"), "  Implement and verify it.  ");
    expect(
      screen.getByRole("checkbox", { name: /Include current uncommitted changes/ }),
    ).not.toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Selected repositories" }));
    await user.click(screen.getByRole("button", { name: "Create card" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose at least one repository",
    );

    await user.click(screen.getByRole("checkbox", { name: /orchestrator/ }));
    await user.selectOptions(screen.getByLabelText("Account"), "account-1");
    await user.selectOptions(screen.getByLabelText("Access mode"), "full-access");
    await user.selectOptions(screen.getByLabelText("Model"), "gpt-5");
    await user.selectOptions(screen.getByLabelText("Reasoning level"), "high");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: "Build board",
      description: "Implement and verify it.",
      repositoryScope: "selected",
      repositoryIds: ["repo-1"],
      accountId: "account-1",
      accessMode: "full-access",
      model: "gpt-5",
      reasoningLevel: "high",
      includeDirtyChanges: false,
      includeConversationHistory: false,
    });
  });

  it("duplicates into an independent draft and does not reset edits on equivalent rerenders", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const card = existingCard();
    const { rerender } = render(
      <KanbanCardDialog
        {...dialogProps(onSubmit)}
        mode="duplicate"
        card={card}
        defaults={{}}
      />,
    );

    const title = screen.getByLabelText("Title");
    expect(title).toHaveValue("Original task copy");
    const history = screen.getByRole("checkbox", {
      name: /Include conversation context/,
    });
    expect(history).not.toBeChecked();
    expect(screen.getByText(/process, execution state, branches/)).toBeInTheDocument();

    await user.clear(title);
    await user.type(title, "Independent follow-up");
    rerender(
      <KanbanCardDialog
        {...dialogProps(onSubmit)}
        mode="duplicate"
        card={{ ...card }}
        defaults={{}}
      />,
    );
    expect(screen.getByLabelText("Title")).toHaveValue("Independent follow-up");

    await user.click(history);
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Independent follow-up",
        includeDirtyChanges: false,
        includeConversationHistory: true,
        repositoryIds: ["repo-1"],
      }),
    );
    const submitted = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(submitted).not.toHaveProperty("branches");
    expect(submitted).not.toHaveProperty("executionState");
  });

  it("keeps metadata editable while locking provisioned execution settings", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <KanbanCardDialog
        {...dialogProps(onSubmit)}
        mode="edit"
        card={existingCard()}
        executionSettingsLocked
      />,
    );

    expect(screen.getByLabelText("Title")).toBeEnabled();
    expect(screen.getByLabelText("Description")).toBeEnabled();
    expect(screen.getByLabelText("Account")).toBeDisabled();
    expect(screen.getByLabelText("Access mode")).toBeDisabled();
    expect(screen.getByLabelText("Model")).toBeDisabled();
    expect(screen.getByLabelText("Reasoning level")).toBeDisabled();
    expect(
      screen.getByRole("checkbox", {
        name: /Include current uncommitted changes/,
      }),
    ).toBeDisabled();

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Updated metadata");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Updated metadata",
        accountId: "account-1",
        repositoryIds: ["repo-1"],
      }),
    );
  });
});
