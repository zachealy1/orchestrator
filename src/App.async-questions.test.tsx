import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMocks, prepareDefaults, prepareSignedInRun, renderApp, startMockRun, emitCodexNotification, setWindowWidth } from "./test/appRuntimeHarness";
import { encodeAsyncReplies } from "./lib/asyncUserInput";

const mocks = getMocks();
const questionItem = { type: "agentMessage", id: "async-q1", delivery: "async", text: "", questions: [{ title: "Which color should I use?", options: ["Blue", "Green"] }] };
const emitQuestion = () => emitCodexNotification({ method: "item/completed", params: { threadId: "thread-1", turnId: "turn-1", item: questionItem } });
beforeEach(() => {
  mocks.listeners.clear(); vi.clearAllMocks(); vi.useRealTimers(); localStorage.clear(); setWindowWidth(1024);
  document.documentElement.removeAttribute("data-theme");
  mocks.virtuosoState = { ranges: [{ startIndex: 0, endIndex: 0 }], scrollTop: 0 };
  prepareDefaults(); prepareSignedInRun();
});
describe("native async questions in the application", () => {
  it("continues streaming and sends a reply to the active account without a blocking request", async () => {
    const { user } = await renderApp(); await startMockRun(user, "Build the color picker");
    await emitQuestion();
    expect(await screen.findByRole("radio", { name: "Blue" })).toBeChecked();
    expect(mocks.resolveCodexServerRequestMock).not.toHaveBeenCalled();
    await emitCodexNotification({ method: "item/agentMessage/delta", params: { threadId: "thread-1", turnId: "turn-1", itemId: "independent-work", delta: "I am checking the existing styles." } });
    expect(await screen.findByText("I am checking the existing styles.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Green" }));
    expect(mocks.codexRpcMock.mock.calls.some(call => call[1] === "turn/steer")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Submit answer" }));
    await waitFor(() => expect(mocks.codexRpcMock).toHaveBeenCalledWith(7, "turn/steer", expect.objectContaining({
      threadId: "thread-1", expectedTurnId: "turn-1", clientUserMessageId: expect.any(String), input: [{ type: "text", text: encodeAsyncReplies([{ questionItemId: JSON.stringify(["request_user_input_async", "async-q1", 0]), question: "Which color should I use?", answer: "Green" }]), text_elements: [] }],
    })));
    expect(screen.getByLabelText("Submitted answer")).toHaveTextContent("Green");
    expect(mocks.resolveCodexServerRequestMock).not.toHaveBeenCalled();
  });
  it("closes questions when the turn finishes and retains readable question history", async () => {
    const { user } = await renderApp(); await startMockRun(user, "Choose a color"); await emitQuestion();
    fireEvent.change(screen.getByRole("textbox", { name: /Your answer:/ }), { target: { value: "Purple" } });
    await user.click(screen.getByRole("button", { name: "Submit answer" }));
    await waitFor(() => expect(screen.getByLabelText("Submitted answer")).toHaveTextContent("Purple"));
    await emitCodexNotification({ method: "item/completed", params: { threadId: "thread-1", turnId: "turn-1", item: { type: "agentMessage", id: "final", phase: "final_answer", text: "Implemented the picker." } } });
    await emitCodexNotification({ method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } } });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Update answer" })).not.toBeInTheDocument());
    expect(screen.getByText("Which color should I use?")).toBeInTheDocument();
    expect(screen.getByLabelText("Submitted answer")).toHaveTextContent("Purple");
    expect(screen.queryByText(/send_user_message_question_reply/)).not.toBeInTheDocument();
  });
});

it("notifies once for an async question outside the visible chat", async () => {
  mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");
  const { user } = await renderApp(); await startMockRun(user, "Build the color picker");
  window.dispatchEvent(new Event("focus"));
  await user.click(screen.getByRole("button", { name: "Analytics" }));
  await emitQuestion(); await emitQuestion();
  await waitFor(() => expect(mocks.sendAgentNotificationMock).toHaveBeenCalledWith(expect.objectContaining({
    title: "Codex has a question", body: "Which color should I use?", target: expect.objectContaining({
      profileKey: "account:7", threadId: "thread-1", turnId: "turn-1",
      requestId: JSON.stringify(["request_user_input_async", "async-q1", 0]),
    }),
  })));
  expect(mocks.sendAgentNotificationMock).toHaveBeenCalledTimes(1);
});
