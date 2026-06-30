import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptyRunView } from "../lib/codexEventReducer";
import { TaskChatTranscript } from "./TaskChatTranscript";

describe("TaskChatTranscript", () => {
  it("renders submitted prompts and Codex output as clear message bodies", () => {
    render(
      <TaskChatTranscript
        entries={[
          {
            workspaceId: 1,
            runId: 2,
            taskId: 3,
            prompt: "Objective:\nFix the failing auth tests",
            submittedAt: "2026-06-30T17:30:00Z",
            status: "completed",
            runView: {
              ...emptyRunView,
              status: "completed",
              finalMessage: "Done:\n- Updated the auth flow",
            },
          },
        ]}
        onResolveRequest={vi.fn()}
      />,
    );

    const submittedPrompt = screen.getByLabelText("Submitted prompt");
    const codexResponse = screen.getByLabelText("Codex response");

    expect(submittedPrompt).toHaveClass("chat-message-body");
    expect(submittedPrompt).toHaveTextContent("Objective:");
    expect(submittedPrompt.textContent).toContain("\nFix the failing auth tests");
    expect(codexResponse).toHaveClass("chat-message-body");
    expect(codexResponse.textContent).toContain("\n- Updated the auth flow");
  });
});
