import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyRunView } from "../lib/codexEventReducer";
import {
  TaskChatTurn,
  buildNativePlanPreview,
  type TaskChatEntry,
} from "./TaskChatTranscript";

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
    expect(
      screen.queryByRole("button", { name: "Show full plan" }),
    ).not.toBeInTheDocument();
    const implementButton = screen.getByRole("button", {
      name: "Implement plan",
    });
    const reviseButton = screen.getByRole("button", { name: "Revise plan" });
    const cancelButton = screen.getByRole("button", { name: "Cancel plan" });
    expect(implementButton).toHaveClass(
      "native-plan-icon-action",
      "implement",
    );
    expect(reviseButton).toHaveClass("native-plan-icon-action", "revise");
    expect(cancelButton).toHaveClass("native-plan-icon-action", "cancel");
    expect(implementButton).toHaveAttribute("title", "Implement plan");
    expect(reviseButton).toHaveAttribute("title", "Revise plan");
    expect(cancelButton).toHaveAttribute("title", "Cancel plan");
    expect(implementButton).not.toHaveTextContent("Implement plan");
    expect(reviseButton).not.toHaveTextContent("Revise");
    expect(cancelButton).not.toHaveTextContent("Cancel");
    expect(
      implementButton.parentElement,
    ).toHaveClass("confirmation-actions");
    await user.click(implementButton);
    expect(onImplementPlan).toHaveBeenCalledWith(entry);
    await user.click(reviseButton);
    await user.type(screen.getByLabelText("What should change?"), "Add rollback steps");
    await user.click(screen.getByRole("button", { name: "Send revision" }));
    expect(onRevisePlan).toHaveBeenCalledWith(entry, "Add rollback steps");
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Cancel plan" }));
    expect(onCancelPlan).toHaveBeenCalledWith(entry);
  });

  it("collapses a long block-aware plan and expands it accessibly", async () => {
    const user = userEvent.setup();
    const entry = planEntry();
    entry.runView = {
      ...entry.runView,
      nativePlan: {
        ...entry.runView.nativePlan,
        completedText: [
          "# Overview",
          "",
          "This plan updates the workspace while preserving existing behavior.",
          "",
          "## Steps",
          "",
          "1. Inspect the current flow.",
          "   - Preserve nested requirements.",
          "   - Keep keyboard behavior.",
          "2. Implement the focused change.",
          "",
          "```ts",
          "const path = 'a/very/long/path/that/should/wrap/inside/the/plan/card';",
          "```",
          "",
          "## Validation",
          "",
          "| Area | Check |",
          "| --- | --- |",
          "| Chat | Scroll position remains stable |",
          "| Plan | Full content remains readable |",
          "",
          "## Risks",
          "",
          "Confirm very long content does not create nested scrolling.",
        ].join("\n"),
      },
    };

    const preview = buildNativePlanPreview(
      entry.runView.nativePlan.completedText,
    );
    expect(preview.isLong).toBe(true);
    expect(preview.previewText).toContain("```ts");
    expect(preview.previewText).not.toContain("## Validation");

    renderTurn(entry);
    const toggle = screen.getByRole("button", { name: "Show full plan" });
    const contentId = toggle.getAttribute("aria-controls");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(contentId).toBeTruthy();
    expect(document.getElementById(contentId!)).toHaveClass("collapsed");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName("Hide full plan");
    expect(document.getElementById(contentId!)).not.toHaveClass("collapsed");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Risks" })).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders streamlined structured choices and submits selected answers", async () => {
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
            autoResolutionMs: 60_000,
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
    expect(screen.queryByText("Codex needs your input")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Auto-continues if unanswered"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Scope")).not.toBeInTheDocument();
    const question = screen.getByText("Which scope?");
    expect(question.tagName).toBe("LEGEND");
    const focusedOption = screen.getByRole("radio", { name: "Focused" });
    const focusedLabel = focusedOption.closest("label");
    expect(focusedLabel).toHaveAttribute(
      "data-tooltip",
      "Smallest useful change",
    );
    expect(screen.getByText("Smallest useful change")).toHaveClass("sr-only");
    expect(
      screen.queryByRole("radio", { name: "None of the above" }),
    ).not.toBeInTheDocument();
    const customInstructions = screen.getByRole("textbox", {
      name: "None of the above: Which scope?",
    });
    expect(customInstructions.tagName).toBe("TEXTAREA");
    expect(customInstructions).toHaveAttribute(
      "placeholder",
      "None of the above - type your instructions",
    );
    expect(customInstructions.closest(".native-user-input-option")).toHaveClass(
      "native-user-input-other-option",
    );
    await user.type(customInstructions, "Use a canvas-based implementation");
    expect(screen.queryByPlaceholderText("Add a note (optional)")).not.toBeInTheDocument();
    const secret = screen.getByLabelText("Provide the token");
    expect(secret).toHaveAttribute("type", "password");
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    await user.type(secret, "secret-value{Enter}");

    expect(onAnswerUserInput).toHaveBeenCalledWith(
      entry,
      entry.runView.serverRequests[0],
      {
        answers: {
          scope: { answers: ["Use a canvas-based implementation"] },
          token: { answers: ["secret-value"] },
        },
      },
    );
  });
});
