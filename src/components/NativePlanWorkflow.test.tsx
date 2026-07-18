import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyRunView } from "../lib/codexEventReducer";
import { TaskChatTurn, type TaskChatEntry } from "./TaskChatTranscript";

function renderTurn(entry: TaskChatEntry, overrides: Record<string, unknown> = {}) {
  const props = {
    entry,
    editable: false,
    editing: false,
    editingPrompt: "",
    onEditingPromptChange: vi.fn(),
    onSubmitEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    onStartEdit: vi.fn(),
    onResolveRequest: vi.fn(),
    ...overrides,
  };
  return render(<TaskChatTurn {...props} />);
}

function planEntry(): TaskChatEntry {
  return {
    clientId: "plan-entry",
    workspaceId: 1,
    chatId: 2,
    turnIndex: 1,
    runId: 3,
    taskId: 4,
    prompt: "Plan the feature",
    submittedAt: "2026-07-14T10:00:00.000Z",
    status: "completed",
    runView: {
      ...emptyRunView,
      status: "completed",
      streamEvents: [
        {
          id: "plan-activity-1",
          kind: "activity",
          text: "Prepared the implementation plan",
          timestamp: "2026-07-14T10:00:01.000Z",
        },
      ],
      nativePlan: {
        ...emptyRunView.nativePlan,
        intent: "plan",
        mode: "plan",
        phase: "awaiting-approval",
        planItemId: "plan-1",
        previewText: "Draft",
        completedText: "# Final plan\n\n1. Build it",
        completedTurnId: "turn-1",
        reviewState: "available",
      },
    },
  };
}

describe("native Plan transcript workflow", () => {
  it("renders the authoritative completed plan and invokes implementation approval", async () => {
    const user = userEvent.setup();
    const entry = planEntry();
    const onImplementPlan = vi.fn();
    const onRevisePlan = vi.fn();
    const onCancelPlan = vi.fn();
    renderTurn(entry, { onImplementPlan, onRevisePlan, onCancelPlan });

    const trace = screen.getByLabelText("Run trace");
    const plan = screen.getByLabelText("Codex plan");
    expect(
      trace.compareDocumentPosition(plan) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Final plan" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Implement plan" }));
    expect(onImplementPlan).toHaveBeenCalledWith(entry);
    await user.click(screen.getByRole("button", { name: "Revise" }));
    await user.type(screen.getByLabelText("What should change?"), "Add rollback steps");
    await user.click(screen.getByRole("button", { name: "Send revision" }));
    expect(onRevisePlan).toHaveBeenCalledWith(entry, "Add rollback steps");
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelPlan).toHaveBeenCalledWith(entry);
  });

  it("renders structured choices, secret free-form input, notes, and submits all answers", async () => {
    const user = userEvent.setup();
    const entry = planEntry();
    entry.status = "running";
    entry.runView = {
      ...entry.runView,
      status: "running",
      nativePlan: {
        ...entry.runView.nativePlan,
        phase: "awaiting-clarification",
        reviewState: "none",
      },
      serverRequests: [
        {
          id: "request-1",
          method: "item/tool/requestUserInput",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            itemId: "item-1",
            autoResolutionMs: null,
            questions: [
              {
                id: "scope",
                header: "Scope",
                question: "Which scope?",
                isOther: true,
                isSecret: false,
                options: [
                  { label: "Focused", description: "Smallest useful change" },
                  { label: "Broad", description: "Include adjacent work" },
                ],
              },
              {
                id: "token",
                header: "Token",
                question: "Provide the token",
                isOther: false,
                isSecret: true,
                options: null,
              },
            ],
          },
        },
      ],
    };
    const onAnswerUserInput = vi.fn();
    renderTurn(entry, { onAnswerUserInput });

    const metrics = screen.getByLabelText("Run metrics");
    const plan = screen.getByLabelText("Codex plan");
    expect(
      metrics.compareDocumentPosition(plan) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: /Focused/ }));
    await user.type(screen.getByLabelText("Scope note"), "Prefer two files");
    const secret = screen.getByLabelText("Token");
    expect(secret).toHaveAttribute("type", "password");
    await user.type(secret, "secret-value");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(onAnswerUserInput).toHaveBeenCalledWith(
      entry,
      entry.runView.serverRequests[0],
      {
        answers: {
          scope: { answers: ["Focused", "Prefer two files"] },
          token: { answers: ["secret-value"] },
        },
      },
    );
  });
});
