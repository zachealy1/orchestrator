import { createContext, useContext, useSyncExternalStore } from "react";
import type { RunViewState } from "../../lib/codexEventReducer";
import { asyncMessageFields, asyncQuestions, parseAsyncReplies, type AsyncAgentMessage } from "../../lib/asyncUserInput";
import { AsyncQuestionController, type QuestionGroup } from "./AsyncQuestionController";
import "./asyncQuestions.css";

export const AsyncQuestionContext = createContext<AsyncQuestionController | null>(null);
const subscribeNothing = () => () => {};
const zero = () => 0;

export function AsyncQuestions({ entryClientId, threadId, runView, panelOnly = false }: {
  entryClientId: string; threadId: string | null; runView?: RunViewState; panelOnly?: boolean;
}) {
  const controller = useContext(AsyncQuestionContext);
  useSyncExternalStore(controller?.subscribe ?? subscribeNothing, controller?.snapshot ?? zero);
  const groups = controller?.list().filter(group => group.target.entryClientId === entryClientId && group.target.threadId === threadId) ?? [];
  const liveIds = new Set(groups.flatMap(group => group.questions.map(q => q.id)));
  const restored = Object.entries(runView?.agentMessagesById ?? {}).flatMap(([id, message]) => asyncQuestions(id, message)).filter(q => !liveIds.has(q.id));
  const answers = new Map(runView?.streamEvents.flatMap(event =>
    event.kind === "steer" ? (parseAsyncReplies(event.text) ?? []).map(r => [r.questionItemId, r.answer] as const) : []) ?? []);
  if (!groups.length && !restored.length) return null;
  return <section className="async-questions" aria-label="Agent questions">
    {groups.map(group => <div key={group.key}>
      {!panelOnly && group.questions.map(q => <article className="async-question-message" key={q.id}
        data-agent-notification-target="user-input" data-agent-notification-id={q.id} tabIndex={-1}>
        <p>{q.title}</p>
        {q.lastSubmission !== null ? <div className="async-question-answer" aria-label="Submitted answer">{q.lastSubmission}</div> : null}
        {group.active && !group.pageIds.includes(q.id) ? <button type="button" onClick={() => controller!.open(group.key, q.id)}>
          {q.lastSubmission !== null ? "Update answer" : "Answer question"}
        </button> : null}
      </article>)}
      {group.active && group.selectedId ? <QuestionPanel group={group} controller={controller!} /> : null}
    </div>)}
    {restored.map(q => <article className="async-question-message" key={q.id}>
      <p>{q.title}</p>{answers.has(q.id) ? <div className="async-question-answer" aria-label="Submitted answer">{answers.get(q.id)}</div> : null}
    </article>)}
  </section>;
}

function QuestionPanel({ group, controller }: { group: QuestionGroup; controller: AsyncQuestionController }) {
  const q = group.questions.find(q => q.id === group.selectedId)!;
  const index = group.pageIds.indexOf(q.id);
  const freeText = !q.options.includes(q.draft);
  return <form className="approval async-question-panel" aria-label="Answer agent question"
    data-agent-notification-target="user-input" data-agent-notification-id={q.id}
    onPointerDown={() => controller.interact(group.key)} onFocusCapture={() => controller.interact(group.key)}
    onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); controller.minimize(group.key); }
    }}
    onSubmit={event => { event.preventDefault(); void controller.submit(group.key); }}>
    <header><span>Question {index + 1} of {group.pageIds.length}</span>
      <button type="button" aria-label="Minimize question" onClick={() => controller.minimize(group.key)}>Minimize</button>
    </header>
    <fieldset disabled={group.submitting}>
      <legend>{q.title}</legend>
      <div className="native-user-input-options">
        {q.options.map((option, optionIndex) => <label className={`native-user-input-option${q.draft === option ? " selected" : ""}`} key={`${optionIndex}:${option}`}>
          <input type="radio" name={`${group.key}:${q.id}`} checked={q.draft === option}
            onChange={() => controller.edit(group.key, q.id, option)} />
          <span>{option}</span>
        </label>)}
      </div>
      <label className="async-question-freeform">{q.options.length ? "Your own answer" : "Your answer"}
        <textarea aria-label={`Your answer: ${q.title}`} value={freeText ? q.draft : ""}
          placeholder="Type your answer" rows={2}
          onChange={event => controller.edit(group.key, q.id, event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault(); void controller.submit(group.key);
            }
          }} />
      </label>
    </fieldset>
    {group.error ? <p role="alert" className="native-user-input-error">{group.error}</p> : null}
    <footer>
      <button type="button" disabled={group.submitting} onClick={() => controller.skip(group.key)}>Skip</button>
      {index > 0 ? <button type="button" disabled={group.submitting} onClick={() => controller.select(group.key, group.pageIds[index - 1])}>Back</button> : null}
      <button type="submit" disabled={group.submitting || (index === group.pageIds.length - 1 && !group.questions.some(question => group.pageIds.includes(question.id) && question.draft.trim()))}>
        {group.submitting ? "Sending…" : index < group.pageIds.length - 1 ? "Next" : "Submit answer"}
      </button>
    </footer>
  </form>;
}

/** The inspector already displays native reply messages; avoid duplicating them in its live panel. */
export function SubagentAsyncQuestion({ itemId, message, threadId, profileKey }: {
  itemId: string; message: AsyncAgentMessage; threadId: string; profileKey: string;
}) {
  const controller = useContext(AsyncQuestionContext);
  useSyncExternalStore(controller?.subscribe ?? subscribeNothing, controller?.snapshot ?? zero);
  const group = controller?.list().find(group => group.target.profileKey === profileKey &&
    group.target.threadId === threadId && group.questions.some(q => q.sourceItemId === itemId));
  return <div>{asyncQuestions(itemId, { text: message.text, ...asyncMessageFields({ ...message }) }).map(q => <article className="async-question-message" key={q.id}
    data-agent-notification-target="user-input" data-agent-notification-id={q.id} tabIndex={-1}>
    <p>{q.title}</p>
    {group?.active && !group.pageIds.includes(q.id) ? <button type="button" onClick={() => controller!.open(group.key, q.id)}>
      {group.questions.find(question => question.id === q.id)?.lastSubmission ? "Update answer" : "Answer question"}
    </button> : null}
  </article>)}</div>;
}
