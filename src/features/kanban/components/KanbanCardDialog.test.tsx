import { render, screen, waitFor } from "@testing-library/react";
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

async function selectComposerOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  const trigger = screen.getByRole("combobox", { name: label });
  await user.click(trigger);
  await user.click(screen.getByRole("option", { name: option }));
  expect(trigger).toHaveAttribute("aria-expanded", "false");
}

describe("KanbanCardDialog", () => {
  it("validates required fields and selected repository scope before submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<KanbanCardDialog {...dialogProps(onSubmit)} />);

    await user.click(screen.getByRole("button", { name: "Create card" }));
    const titleInput = screen.getByLabelText("Title");
    const titleError = screen.getByRole("alert");
    expect(titleError).toHaveTextContent("Enter a card title.");
    expect(titleInput).toHaveFocus();
    expect(titleInput).toHaveAttribute("aria-invalid", "true");
    expect(titleInput).toHaveAttribute("aria-describedby", titleError.id);

    await user.type(titleInput, "  Build board  ");
    await user.click(screen.getByRole("button", { name: "Create card" }));
    const descriptionInput = screen.getByLabelText("Description");
    const descriptionError = screen.getByRole("alert");
    expect(descriptionError).toHaveTextContent(
      "Describe the work for the agent.",
    );
    expect(descriptionInput).toHaveFocus();
    expect(descriptionInput).toHaveAttribute("aria-invalid", "true");
    expect(descriptionInput).toHaveAttribute(
      "aria-describedby",
      descriptionError.id,
    );

    await user.type(descriptionInput, "  Implement and verify it.  ");
    expect(
      screen.getByRole("checkbox", { name: /Include current uncommitted changes/ }),
    ).not.toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Selected repositories" }));
    await user.click(screen.getByRole("button", { name: "Create card" }));
    const repositoryError = screen.getByRole("alert");
    const repositoryGroup = screen.getByRole("group", {
      name: "Repository scope",
    });
    const repositoryOption = screen.getByRole("checkbox", { name: /orchestrator/ });
    expect(repositoryError).toHaveTextContent(
      "Choose at least one repository",
    );
    expect(repositoryGroup).toHaveAttribute("aria-invalid", "true");
    expect(repositoryGroup).toHaveAttribute(
      "aria-describedby",
      repositoryError.id,
    );
    expect(repositoryOption).toHaveFocus();

    await user.click(repositoryOption);
    await selectComposerOption(user, "Account", "Work");
    await selectComposerOption(user, "Access mode", "Full access");
    await selectComposerOption(user, "Model", "GPT-5");
    await selectComposerOption(user, "Reasoning level", "High");
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
      submissionMode: "normal",
      contextFiles: [],
      includeDirtyChanges: false,
      includeConversationHistory: false,
    });
  });

  it("contains keyboard focus and resets model-dependent execution choices", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(
      <KanbanCardDialog
        {...dialogProps(onSubmit)}
        onCancel={onCancel}
        defaults={{
          title: "Plan a release",
          description: "Prepare and verify the release.",
          accountId: "account-1",
          model: "gpt-5",
          reasoningLevel: "high",
        }}
        accountOptions={[
          { value: "account-1", label: "Work" },
          { value: "account-2", label: "Personal" },
        ]}
        modelOptions={[
          { value: "gpt-5", label: "GPT-5" },
          { value: "gpt-6", label: "GPT-6" },
        ]}
        modelReasoningOptions={{
          "gpt-5": [{ value: "high", label: "High" }],
          "gpt-6": [],
        }}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveFocus());
    const closeButton = screen.getByRole("button", { name: "Close card dialog" });
    const submitButton = screen.getByRole("button", { name: "Create card" });
    closeButton.focus();
    await user.tab({ shift: true });
    expect(submitButton).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.click(screen.getByRole("combobox", { name: "Model" }));
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("listbox", { name: "Model options" }),
    ).not.toBeInTheDocument();

    await selectComposerOption(user, "Account", "Personal");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveTextContent(
      "Account default",
    );
    expect(
      screen.getByRole("combobox", { name: "Reasoning level" }),
    ).toBeDisabled();

    await selectComposerOption(user, "Model", "GPT-5");
    expect(
      screen.getByRole("combobox", { name: "Reasoning level" }),
    ).toBeEnabled();
    await selectComposerOption(user, "Reasoning level", "High");
    await selectComposerOption(user, "Model", "GPT-6");
    expect(
      screen.getByRole("combobox", { name: "Reasoning level" }),
    ).toBeDisabled();

    await user.click(submitButton);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "account-2",
        model: "gpt-6",
        reasoningLevel: "",
      }),
    );
  });

  it("edits the agent mode and adds and removes context files", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onPickContextFiles = vi.fn().mockResolvedValue([
      {
        path: "/workspace/spec.md",
        name: "spec.md",
        source: "picker" as const,
        mediaKind: "file" as const,
        status: "ready" as const,
      },
      {
        path: "/workspace/reference.png",
        name: "reference.png",
        source: "picker" as const,
        mediaKind: "image" as const,
        status: "ready" as const,
      },
    ]);
    render(
      <KanbanCardDialog
        {...dialogProps(onSubmit)}
        defaults={{
          title: "Plan a release",
          description: "Prepare and verify the release.",
        }}
        onPickContextFiles={onPickContextFiles}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "Plan" }));
    await user.click(
      screen.getByRole("button", { name: "Add files to agent context" }),
    );
    expect(await screen.findByText("spec.md")).toBeInTheDocument();
    expect(screen.getByText("reference.png")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove spec.md" }));
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionMode: "plan",
        contextFiles: [
          expect.objectContaining({
            path: "/workspace/reference.png",
            mediaKind: "image",
          }),
        ],
      }),
    );
  });

  it("hides repository scope and targets the sole repository automatically", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <KanbanCardDialog
        {...dialogProps(onSubmit)}
        repositories={[repositories[0]!]}
        defaults={{
          title: "Update documentation",
          description: "Refresh the project documentation.",
          repositoryScope: "all",
          repositoryIds: [],
        }}
      />,
    );

    expect(
      screen.queryByRole("group", { name: "Repository scope" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "Selected repositories" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /orchestrator/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: /Include current uncommitted changes/,
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryScope: "selected",
        repositoryIds: ["repo-1"],
      }),
    );
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
    expect(
      screen.getByText(/Process state and approvals are not copied/),
    ).toBeInTheDocument();

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
        modelReasoningOptions={{}}
        executionSettingsLocked
      />,
    );

    expect(screen.getByLabelText("Title")).toBeEnabled();
    expect(screen.getByLabelText("Description")).toBeEnabled();
    expect(screen.getByLabelText("Account")).toBeDisabled();
    expect(screen.getByLabelText("Access mode")).toBeDisabled();
    expect(screen.getByLabelText("Model")).toBeDisabled();
    expect(screen.getByLabelText("Reasoning level")).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Chat" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Add files to agent context" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", {
        name: /Include current uncommitted changes/,
      }),
    ).toBeDisabled();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(cancel).toHaveClass("native-plan-icon-action", "cancel");
    expect(save).toHaveClass("native-plan-icon-action", "implement");
    expect(cancel).toHaveAttribute("title", "Cancel");
    expect(save).toHaveAttribute("title", "Save changes");
    expect(cancel).not.toHaveTextContent("Cancel");
    expect(save).not.toHaveTextContent("Save changes");

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Updated metadata");
    await user.click(save);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Updated metadata",
        accountId: "account-1",
        model: "gpt-5",
        reasoningLevel: "high",
        repositoryIds: ["repo-1"],
      }),
    );
  });
});
