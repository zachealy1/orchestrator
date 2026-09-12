import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AsyncQuestionController, type AsyncQuestionDependencies } from "./AsyncQuestionController";
import { AsyncQuestionContext, AsyncQuestions } from "./AsyncQuestions";
import { asyncQuestionScope, encodeAsyncReplies } from "../../lib/asyncUserInput";
import { emptyRunView } from "../../lib/codexEventReducer";
import type { ActiveRunControl } from "../runs/runtimeTypes";

const scope = asyncQuestionScope("account:7", "thread", "turn");
const control = { profileKey: "account:7", accountId: 7, threadId: "thread", turnId: "turn", clientId: "entry", workspaceId: 1, chatId: 2, runId: 3,
  runView: { ...emptyRunView, status: "running", threadId: "thread", turnId: "turn" } } as unknown as ActiveRunControl;
let controller: AsyncQuestionController, deps: AsyncQuestionDependencies;
const question = (id = "q1", threadId = "thread", questions = [{ title: "Which color?", options: ["Blue", "Green"] }]) => ({ method: "item/completed", params: { threadId, turnId: "turn", item: { type: "agentMessage", id, text: "", delivery: "async", questions } } });
const view = () => <AsyncQuestionContext.Provider value={controller}><AsyncQuestions entryClientId="entry" threadId="thread" /></AsyncQuestionContext.Provider>;
beforeEach(() => {
  vi.useFakeTimers();
  deps = { findControl: vi.fn(() => control), isActive: vi.fn(() => true), steer: vi.fn().mockResolvedValue({}), persist: vi.fn().mockResolvedValue(undefined),
    updateView: vi.fn(), notify: vi.fn().mockResolvedValue(undefined), removeNotification: vi.fn().mockResolvedValue(undefined), reportError: vi.fn() };
  controller = new AsyncQuestionController(() => deps);
});
afterEach(() => { controller.dispose(); vi.useRealTimers(); });
describe("async-question interaction", () => {
  it("preselects the first option and sends only on explicit submission", async () => {
    controller.observe(control, question()); render(view());
    expect(screen.getByRole("radio", { name: "Blue" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Green" }));
    expect(deps.steer).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Submit answer" })));
    expect(deps.steer).toHaveBeenCalledOnce();
    expect(deps.steer).toHaveBeenCalledWith(expect.objectContaining({ profileKey: "account:7", accountId: 7 }), expect.objectContaining({ threadId: "thread", expectedTurnId: "turn", clientUserMessageId: expect.any(String), input: [{ type: "text", text: encodeAsyncReplies([{ questionItemId: JSON.stringify(["request_user_input_async", "q1", 0]), question: "Which color?", answer: "Green" }]), text_elements: [] }] }));
    expect(screen.getByLabelText("Submitted answer")).toHaveTextContent("Green");
  });
  it("dismisses after 30 seconds without submitting, and can be reopened", () => {
    controller.observe(control, question()); render(view());
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.queryByRole("form", { name: "Answer agent question" })).not.toBeInTheDocument();
    expect(deps.steer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Answer question" }));
    expect(screen.getByRole("form", { name: "Answer agent question" })).toBeInTheDocument();
  });
  it("keeps free-text drafts after navigation/unmount and cancels the timer on interaction", () => {
    controller.observe(control, question()); const rendered = render(view());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Purple" } });
    rendered.unmount(); act(() => vi.advanceTimersByTime(60_000)); render(view());
    expect(screen.getByRole("textbox")).toHaveValue("Purple");
    expect(deps.steer).not.toHaveBeenCalled();
  });
  it("supports multiple questions, partial answers, back navigation, and explicit skip", async () => {
    controller.observe(control, question("multi", "thread", [{ title: "Which color?", options: ["Blue"] }, { title: "Any constraints?", options: ["Small"] }]));
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("radio", { name: "Blue" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(deps.steer).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "No dependencies" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Submit answer" })));
    const params = vi.mocked(deps.steer).mock.calls[0][1];
    expect(JSON.stringify(params)).toContain("No dependencies");
    expect(JSON.stringify(params)).not.toContain("Blue");
  });
  it("supports free-text-only questions", async () => {
    controller.observe(control, { ...question(), params: { ...question().params, item: { ...question().params.item, questions: [{ title: "What constraints?" }] } } });
    render(view()); expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Offline" } });
    await act(async () => fireEvent.submit(screen.getByRole("form")));
    expect(screen.getByLabelText("Submitted answer")).toHaveTextContent("Offline");
  });
  it("retains the draft after a failed submission and allows retry", async () => {
    vi.mocked(deps.steer).mockRejectedValueOnce(new Error("Disconnected"));
    controller.observe(control, question()); render(view());
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Submit answer" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Disconnected");
    expect(screen.getByRole("radio", { name: "Blue" })).toBeChecked();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Submit answer" })));
    expect(deps.steer).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deps.steer).mock.calls[0][1].clientUserMessageId).toBe(vi.mocked(deps.steer).mock.calls[1][1].clientUserMessageId);
  });
  it("prevents double submission and never starts or queues a stale turn", async () => {
    let finish!: () => void;
    vi.mocked(deps.steer).mockImplementation(() => new Promise(resolve => { finish = () => resolve({}); }));
    controller.observe(control, question());
    const first = controller.submit(scope); await controller.submit(scope);
    expect(deps.steer).toHaveBeenCalledOnce();
    controller.observe(control, { method: "turn/completed", params: { threadId: "thread", turn: { id: "turn" } } });
    finish(); await first;
    expect(controller.get(scope)?.active).toBe(false);
    await controller.submit(scope); expect(deps.steer).toHaveBeenCalledOnce();
  });
  it("rejects a changed active turn before sending", async () => {
    controller.observe(control, question()); vi.mocked(deps.isActive).mockReturnValue(false);
    await controller.submit(scope); expect(deps.steer).not.toHaveBeenCalled();
    expect(controller.get(scope)?.active).toBe(false);
  });
  it("deduplicates repeated question events and routes child replies to their own thread", async () => {
    controller.observe(control, question("child", "child-thread"));
    controller.observe(control, question("child", "child-thread"));
    expect(deps.notify).toHaveBeenCalledOnce();
    const key = asyncQuestionScope("account:7", "child-thread", "turn");
    await controller.submit(key);
    expect(deps.steer).toHaveBeenCalledWith(expect.objectContaining({ subagentThreadId: "child-thread", entryClientId: "entry" }), expect.objectContaining({ threadId: "child-thread", expectedTurnId: "turn" }));
    expect(deps.updateView).not.toHaveBeenCalled();
  });
  it("minimizes without answering and permits revising a submitted answer", async () => {
    controller.observe(control, question()); render(view());
    fireEvent.click(screen.getByRole("button", { name: "Minimize question" }));
    expect(deps.steer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Answer question" }));
    await act(async () => fireEvent.submit(screen.getByRole("form")));
    fireEvent.click(screen.getByRole("button", { name: "Update answer" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Orange" } });
    await act(async () => fireEvent.submit(screen.getByRole("form")));
    expect(screen.getByLabelText("Submitted answer")).toHaveTextContent("Orange");
    expect(deps.steer).toHaveBeenCalledTimes(2);
  });
});

it("submits only nonempty answers and dismisses the batch's blank questions", async () => {
  controller.observe(control, { ...question(), params: { ...question().params, item: { ...question().params.item,
    questions: [{ title: "Which color?", options: ["Blue"] }, { title: "Any constraints?" }],
  } } });
  render(view());
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Submit answer" })));
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(JSON.stringify(vi.mocked(deps.steer).mock.calls[0][1])).not.toContain("Any constraints?");
});

it("does not restart an interacted panel's timer when another question arrives", () => {
  controller.observe(control, question()); controller.interact(scope);
  controller.observe(control, question("q2"));
  vi.advanceTimersByTime(30_000);
  expect(controller.get(scope)?.selectedId).not.toBeNull();
});
