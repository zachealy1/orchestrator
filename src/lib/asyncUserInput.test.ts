import { describe, expect, it } from "vitest";
import { asyncMessageFields, asyncQuestions, asyncReplyFromItem, encodeAsyncReplies, parseAsyncReplies, readableAsyncReply } from "./asyncUserInput";
import { applyCodexMessage, emptyRunView, recordAsyncReply } from "./codexEventReducer";
import { buildTimelineItems } from "./runTimeline";
import { mergeHistoricalAsyncMessages } from "../features/asyncQuestions/history";

const item = { type: "agentMessage", id: "q1", text: "", delivery: "async", questions: [{ title: "Which color?", options: ["Blue", "Green"] }, { title: "Any constraints?" }] };
const replies = [{ questionItemId: '["request_user_input_async","q1",0]', question: "Which color?", answer: "Green" }];
const userItem = (id: string, clientId: string, answer = "Green") => ({ type: "userMessage", id, clientId, content: [{ type: "text", text: encodeAsyncReplies([{ ...replies[0], answer }]) }] });
describe("Codex async-question protocol", () => {
  it("preserves ordered questions and Codex's exact identifiers", () => {
    const questions = asyncQuestions(item.id, { text: "", ...asyncMessageFields(item) });
    expect(questions.map(q => q.id)).toEqual([JSON.stringify(["request_user_input_async", "q1", 0]), JSON.stringify(["request_user_input_async", "q1", 1])]);
    expect(questions[1].options).toEqual([]);
  });
  it("supports the legacy text-only async item", () => {
    expect(asyncQuestions("legacy", { text: "What next?", delivery: "async" })).toEqual([{ id: "legacy", sourceItemId: "legacy", title: "What next?", options: [] }]);
  });
  it.each([{ title: "" }, { title: "Q", options: [] }, { title: "Q", options: [12] }, null])("rejects malformed question %j", question => {
    expect(asyncQuestions("bad", { text: "fallback", ...asyncMessageFields({ delivery: "async", questions: [question] }) })).toEqual([]);
  });
  it("uses the native envelope, supports legacy single replies, and displays readable text", () => {
    const text = encodeAsyncReplies(replies);
    expect(text).toBe(`<send_user_message_question_reply>\n${JSON.stringify(replies)}\n</send_user_message_question_reply>`);
    expect(parseAsyncReplies(text)).toEqual(replies);
    expect(parseAsyncReplies(`<send_user_message_question_reply>${JSON.stringify(replies[0])}</send_user_message_question_reply>`)).toEqual(replies);
    expect(readableAsyncReply(text)).toBe("Which color?\nGreen");
    expect(parseAsyncReplies("<send_user_message_question_reply>[]</send_user_message_question_reply>")).toBeNull();
    expect(parseAsyncReplies("normal text")).toBeNull();
  });
  it("accepts only a single text reply and accepted steering items", () => {
    expect(asyncReplyFromItem({ ...userItem("u", "c"), content: [{ type: "text", text: encodeAsyncReplies(replies) }, { type: "image" }] })).toBeNull();
    expect(asyncReplyFromItem({ type: "steeringUserMessage", status: "pending", input: userItem("u", "c").content })).toBeNull();
  });
  it("keeps async messages out of final answers, plans, blocking requests and the plain timeline", () => {
    let state = { ...emptyRunView, status: "running" as const, threadId: "thread", turnId: "turn" };
    const message = { ...item, phase: "final_answer", text: "<proposed_plan>Not a plan</proposed_plan>" };
    let next = applyCodexMessage(state, { method: "item/started", params: { item: message } });
    next = applyCodexMessage(next, { method: "item/agentMessage/delta", params: { itemId: "q1", delta: "Question" } });
    next = applyCodexMessage(next, { method: "item/completed", params: { item: message } });
    expect(next.agentMessagesById.q1).toMatchObject({ delivery: "async", questions: item.questions, phase: "commentary", threadId: "thread", turnId: "turn" });
    expect(next.status).toBe("running"); expect(next.serverRequests).toEqual([]);
    expect(next.finalMessage).toBe(""); expect(next.nativePlan.completedText).toBe("");
    expect(buildTimelineItems(next).some(i => i.kind === "event" && i.event.kind === "message")).toBe(false);
  });
  it("deduplicates delayed native echoes without replacing a newer accepted answer", () => {
    let state = recordAsyncReply(emptyRunView, userItem("local1", "client1"));
    state = recordAsyncReply(state, userItem("local2", "client2", "Blue"));
    state = recordAsyncReply(state, userItem("server1", "client1"));
    expect(state.streamEvents).toHaveLength(2);
    expect(readableAsyncReply(state.streamEvents[1].text)).toContain("Blue");
  });
  it("restores paginated questions and accepted answers without raw markup or cross-thread leakage", () => {
    const view = { ...emptyRunView, threadId: "thread", turnId: "turn" };
    const latest = mergeHistoricalAsyncMessages(view, [{ ...userItem("u", "c"), sequence: 4 }]);
    const older = mergeHistoricalAsyncMessages({ ...view, ...latest }, [{ ...item, sequence: 1 }, { ...item, id: "child", threadId: "child-thread", sequence: 2 }]);
    expect(Object.keys(older.agentMessagesById)).toEqual(["q1"]);
    expect(older.streamEvents).toHaveLength(1);
    expect(parseAsyncReplies(older.streamEvents[0].text)).toEqual(replies);
  });
});

it("restores newest-first native pages in causal order even without sequence numbers", () => {
  const restored = mergeHistoricalAsyncMessages(emptyRunView, [userItem("new", "new", "Blue"), userItem("old", "old", "Green"), item]);
  expect(readableAsyncReply(restored.streamEvents[restored.streamEvents.length - 1].text)).toContain("Blue");
});

it("deduplicates an echo without client metadata after a newer answer", () => {
  let state = recordAsyncReply(emptyRunView, userItem("local1", "client1"));
  state = recordAsyncReply(state, userItem("local2", "client2", "Blue"));
  const echo = { ...userItem("server1", "client1"), clientId: undefined };
  state = recordAsyncReply(state, echo);
  expect(state.streamEvents).toHaveLength(2);
  expect(readableAsyncReply(state.streamEvents[state.streamEvents.length - 1].text)).toContain("Blue");
});
