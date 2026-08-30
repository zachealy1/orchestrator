import {
  BrainCircuit,
  Check,
  ChevronDown,
  FileCode2,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Send,
  Square,
  TerminalSquare,
  X,
} from "lucide-react";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Virtuoso } from "react-virtuoso";
import type { ApprovalResolutionHandler } from "../lib/codexApprovals";
import { emptyRunView, type RunViewState } from "../lib/codexEventReducer";
import {
  isActiveSubagentStatus,
  useConversationSubagents,
  type SubagentRecord,
  type SubagentInstruction,
  type SubagentTranscript,
  type SubagentTranscriptItem,
  type SubagentTranscriptTurn,
} from "../lib/subagents";
import { useAppServices } from "../runtime/AppServices";
import type {
  NativeUserInputRequest,
  UserInputResponse,
} from "../lib/nativePlanMode";
import { requestKey } from "../lib/nativePlanMode";
import {
  RunApprovalRequests,
  type TaskChatEntry,
} from "./TaskChatTurn";
import { statusLabel, SubagentStatusIcon } from "./SubagentStatus";

type Props = {
  conversationKey: string;
  subagentId: string;
  parentEntry: TaskChatEntry | null;
  parentRunView: RunViewState | null;
  onClose: () => void;
  onLoadTranscript: (subagent: SubagentRecord) => Promise<SubagentTranscript>;
  onResolveRequest: ApprovalResolutionHandler;
  onAnswerUserInput: (
    entry: TaskChatEntry,
    request: NativeUserInputRequest,
    response: UserInputResponse,
  ) => void;
  onSteer: (subagent: SubagentRecord, instruction: string) => Promise<void>;
  onStop: (subagent: SubagentRecord) => Promise<void>;
};

type TranscriptState =
  | { status: "loading"; transcript: SubagentTranscript | null; error: null }
  | {
      status: "loaded";
      transcript: SubagentTranscript;
      error: null;
    }
  | {
      status: "error";
      transcript: SubagentTranscript | null;
      error: string;
    };

const ACTIVE_TRANSCRIPT_REFRESH_MS = 700;

export const SubagentInspector = memo(function SubagentInspector({
  conversationKey,
  subagentId,
  parentEntry,
  parentRunView,
  onClose,
  onLoadTranscript,
  onResolveRequest,
  onAnswerUserInput,
  onSteer,
  onStop,
}: Props) {
  const { subagents, subagentTranscripts } = useAppServices();
  const records = useConversationSubagents(subagents, conversationKey);
  const record =
    records.find((candidate) => candidate.id === subagentId) ?? null;
  const [transcriptState, setTranscriptState] = useState<TranscriptState>({
    status: "loading",
    transcript: null,
    error: null,
  });
  const [instruction, setInstruction] = useState("");
  const [steering, setSteering] = useState(false);
  const [steerError, setSteerError] = useState<string | null>(null);
  const [stopConfirmationOpen, setStopConfirmationOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const [taskPromptExpanded, setTaskPromptExpanded] = useState(true);
  const loadGenerationRef = useRef(0);
  const transcriptRequestCountRef = useRef(0);
  const loadedRecordRevisionRef = useRef("");
  const recordRef = useRef(record);
  const steeringLockRef = useRef(false);
  recordRef.current = record;

  useEffect(() => {
    if (!record) return;
    const generation = ++loadGenerationRef.current;
    const cacheKey = transcriptCacheKey(record);
    const cached = subagentTranscripts.get(cacheKey) ?? null;
    const requestedRevision = record.updatedAt;
    setTranscriptState({
      status: cached ? "loaded" : "loading",
      transcript: cached,
      error: null,
    } as TranscriptState);
    const timer = window.setTimeout(() => {
      transcriptRequestCountRef.current += 1;
      void onLoadTranscript(record)
        .then((transcript) => {
          if (loadGenerationRef.current !== generation) return;
          subagentTranscripts.set(cacheKey, transcript);
          loadedRecordRevisionRef.current = requestedRevision;
          setTranscriptState({
            status: "loaded",
            transcript,
            error: null,
          });
        })
        .catch((error) => {
          if (loadGenerationRef.current !== generation) return;
          setTranscriptState({
            status: "error",
            transcript: cached,
            error:
              error instanceof Error
                ? error.message
                : "The subagent transcript is unavailable.",
          });
        })
        .finally(() => {
          transcriptRequestCountRef.current = Math.max(
            0,
            transcriptRequestCountRef.current - 1,
          );
        });
    }, cached ? 240 : 0);
    return () => window.clearTimeout(timer);
  }, [
    onLoadTranscript,
    record?.childTurnId,
    record?.completedAt,
    record?.id,
    subagentTranscripts,
  ]);

  useEffect(() => {
    if (!record || !isActiveSubagentStatus(record.status)) return;
    const recordId = record.id;
    const timer = window.setInterval(() => {
      const current = recordRef.current;
      if (
        !current ||
        current.id !== recordId ||
        !isActiveSubagentStatus(current.status) ||
        current.updatedAt === loadedRecordRevisionRef.current ||
        transcriptRequestCountRef.current > 0
      ) {
        return;
      }
      const generation = loadGenerationRef.current;
      const requestedRevision = current.updatedAt;
      const cacheKey = transcriptCacheKey(current);
      transcriptRequestCountRef.current += 1;
      void onLoadTranscript(current)
        .then((transcript) => {
          if (
            loadGenerationRef.current !== generation ||
            recordRef.current?.id !== recordId
          ) {
            return;
          }
          subagentTranscripts.set(cacheKey, transcript);
          loadedRecordRevisionRef.current = requestedRevision;
          setTranscriptState({
            status: "loaded",
            transcript,
            error: null,
          });
        })
        .catch(() => {
          // Keep the last usable transcript during a transient streaming read.
          loadedRecordRevisionRef.current = requestedRevision;
        })
        .finally(() => {
          transcriptRequestCountRef.current = Math.max(
            0,
            transcriptRequestCountRef.current - 1,
          );
        });
    }, ACTIVE_TRANSCRIPT_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [onLoadTranscript, record?.id, record?.status, subagentTranscripts]);

  const interactionRunView = useMemo(
    () =>
      record && parentRunView
        ? filterSubagentInteractions(parentRunView, record.childThreadId)
        : null,
    [parentRunView, record],
  );
  const hasInteractions = Boolean(
    interactionRunView &&
      (interactionRunView.approvalRequests.length > 0 ||
        interactionRunView.serverRequests.length > 0),
  );
  const interactionEntry = useMemo(
    () =>
      parentEntry && interactionRunView && hasInteractions
        ? { ...parentEntry, runView: interactionRunView }
        : null,
    [hasInteractions, interactionRunView, parentEntry],
  );
  const transcriptTurns = useMemo(
    () => {
      const turns = transcriptState.transcript?.turns.filter(
        (turn) => turn.items.length > 0,
      ) ?? [];
      return includePersistedInstructions(
        turns,
        transcriptState.transcript?.instructions ?? [],
        visibleRecordTask(record),
      );
    },
    [record, transcriptState.transcript],
  );
  const taskPrompt = useMemo(
    () =>
      transcriptState.transcript?.instructions?.find(
        (instruction) => instruction.kind === "spawn",
      )?.text ?? visibleRecordTask(record),
    [record, transcriptState.transcript],
  );
  const canStop =
    Boolean(record?.childTurnId) &&
    Boolean(record && isActiveSubagentStatus(record.status));
  const canSteer =
    canStop &&
    record?.status !== "needs-attention" &&
    record?.status !== "stopping";

  if (!record) {
    return (
      <aside className="subagent-inspector" aria-label="Subagent inspector">
        <header className="subagent-inspector-header">
          <strong>Subagent unavailable</strong>
          <InspectorIconButton label="Close inspector" onClick={onClose}>
            <X size={15} aria-hidden="true" />
          </InspectorIconButton>
        </header>
        <p className="subagent-inspector-empty">
          This subagent is no longer available in the selected conversation.
        </p>
      </aside>
    );
  }

  async function submitInstruction() {
    const value = instruction.trim();
    if (!value || steeringLockRef.current || !record || !canSteer) return;
    steeringLockRef.current = true;
    setSteering(true);
    setSteerError(null);
    try {
      await onSteer(record, value);
      setInstruction("");
    } catch (error) {
      setSteerError(
        error instanceof Error
          ? error.message
          : "Could not send the instruction.",
      );
    } finally {
      steeringLockRef.current = false;
      setSteering(false);
    }
  }

  async function confirmStop() {
    if (stopping || !record) return;
    setStopping(true);
    setStopError(null);
    try {
      await onStop(record);
      setStopConfirmationOpen(false);
    } catch (error) {
      setStopError(
        error instanceof Error ? error.message : "Could not stop the subagent.",
      );
    } finally {
      setStopping(false);
    }
  }

  return (
    <aside
      className={`subagent-inspector${
        hasInteractions ? " has-interactions" : ""
      }`}
      aria-label={`Subagent inspector: ${record.task}`}
    >
      <header className="subagent-inspector-header">
        <div className="subagent-inspector-title">
          <span className="subagent-inspector-title-icon">
            <SubagentStatusIcon status={record.status} />
          </span>
          <span>
            <strong>Subagent</strong>
            <small>{statusLabel(record.status)}</small>
          </span>
        </div>
        <div className="subagent-inspector-header-actions">
          <InspectorIconButton
            label="Refresh subagent transcript"
            onClick={() => {
              const generation = ++loadGenerationRef.current;
              const requestedRevision = record.updatedAt;
              subagentTranscripts.delete(transcriptCacheKey(record));
              setTranscriptState({
                status: "loading",
                transcript: transcriptState.transcript,
                error: null,
              });
              transcriptRequestCountRef.current += 1;
              void onLoadTranscript(record)
                .then((transcript) => {
                  if (loadGenerationRef.current !== generation) return;
                  subagentTranscripts.set(
                    transcriptCacheKey(record),
                    transcript,
                  );
                  loadedRecordRevisionRef.current = requestedRevision;
                  setTranscriptState({
                    status: "loaded",
                    transcript,
                    error: null,
                  });
                })
                .catch((error) => {
                  if (loadGenerationRef.current !== generation) return;
                  setTranscriptState({
                    status: "error",
                    transcript: transcriptState.transcript,
                    error:
                      error instanceof Error
                        ? error.message
                        : "The subagent transcript is unavailable.",
                  });
                })
                .finally(() => {
                  transcriptRequestCountRef.current = Math.max(
                    0,
                    transcriptRequestCountRef.current - 1,
                  );
                });
            }}
          >
            <RefreshCw size={15} aria-hidden="true" />
          </InspectorIconButton>
          <InspectorIconButton label="Close inspector" onClick={onClose}>
            <X size={15} aria-hidden="true" />
          </InspectorIconButton>
        </div>
      </header>

      <section className="subagent-task-prompt" aria-label="Task prompt">
        <button
          type="button"
          className="subagent-task-prompt-toggle"
          aria-expanded={taskPromptExpanded}
          onClick={() => setTaskPromptExpanded((current) => !current)}
        >
          <span>Task prompt</span>
          <ChevronDown size={15} aria-hidden="true" />
        </button>
        {taskPromptExpanded ? (
          taskPrompt ? (
            <div className="subagent-task-prompt-content">{taskPrompt}</div>
          ) : (
            <p className="subagent-task-prompt-unavailable">
              Original prompt unavailable for this older subagent.
            </p>
          )
        ) : null}
      </section>

      {interactionEntry && interactionRunView ? (
        <div className="subagent-inspector-interactions">
          <RunApprovalRequests
            entry={interactionEntry}
            runView={interactionRunView}
            onResolveRequest={onResolveRequest}
            onAnswerUserInput={onAnswerUserInput}
          />
        </div>
      ) : null}

      <div className="subagent-inspector-transcript">
        {transcriptState.status === "loading" &&
        !transcriptState.transcript ? (
          <div className="subagent-inspector-loading">
            <LoaderCircle className="spin" size={16} aria-hidden="true" />
            <span>Loading subagent transcript</span>
          </div>
        ) : transcriptTurns.length > 0 ? (
          <Virtuoso
            className="subagent-transcript-list"
            data={transcriptTurns}
            computeItemKey={(_, turn) => turn.id}
            increaseViewportBy={{ top: 500, bottom: 800 }}
            followOutput={canStop ? "auto" : false}
            itemContent={(_, turn) => (
              <SubagentTranscriptTurnView turn={turn} />
            )}
          />
        ) : (
          <div className="run-summary muted subagent-inspector-empty">
            {record.finalResult ??
              "No user-visible transcript is available for this subagent."}
          </div>
        )}
        {transcriptState.status === "error" ? (
          <div className="subagent-inspector-error" role="alert">
            {transcriptState.error}
          </div>
        ) : null}
      </div>

      <footer className="subagent-inspector-controls">
        <label className="subagent-steer-field">
          <span className="sr-only">Send instruction to subagent</span>
          <textarea
            rows={2}
            value={instruction}
            placeholder={
              canSteer
                ? "Send an instruction"
                : "Subagent is not accepting instructions"
            }
            disabled={!canSteer || steering || stopping}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
                return;
              }
              event.preventDefault();
              void submitInstruction();
            }}
          />
        </label>
        <div className="subagent-inspector-control-actions">
          <InspectorIconButton
            label="Stop subagent"
            onClick={() => setStopConfirmationOpen(true)}
            disabled={!canStop || steering || stopping}
            destructive
          >
            <Square size={14} aria-hidden="true" />
          </InspectorIconButton>
          <InspectorIconButton
            label="Send instruction"
            onClick={() => void submitInstruction()}
            disabled={!canSteer || !instruction.trim() || steering || stopping}
            emphasis
          >
            {steering ? (
              <LoaderCircle className="spin" size={15} aria-hidden="true" />
            ) : (
              <Send size={15} aria-hidden="true" />
            )}
          </InspectorIconButton>
        </div>
        {steerError ? (
          <p className="subagent-inspector-error" role="alert">
            {steerError}
          </p>
        ) : null}
      </footer>

      {stopConfirmationOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="modal-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !stopping) {
                  setStopConfirmationOpen(false);
                }
              }}
            >
              <section
                className="confirmation-dialog subagent-stop-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="subagent-stop-title"
                onKeyDown={(event) => {
                  if (event.key === "Escape" && !stopping) {
                    event.preventDefault();
                    setStopConfirmationOpen(false);
                  }
                }}
              >
                <div>
                  <h2 id="subagent-stop-title">Stop this subagent?</h2>
                  <p>
                    Active child subagents will be stopped first. Completed
                    transcript content remains available.
                  </p>
                  {stopError ? (
                    <p className="subagent-inspector-error" role="alert">
                      {stopError}
                    </p>
                  ) : null}
                </div>
                <div className="confirmation-actions">
                  <InspectorIconButton
                    label="Keep subagent running"
                    onClick={() => setStopConfirmationOpen(false)}
                    disabled={stopping}
                  >
                    <X size={15} aria-hidden="true" />
                  </InspectorIconButton>
                  <InspectorIconButton
                    label="Stop subagent"
                    onClick={() => void confirmStop()}
                    disabled={stopping}
                    destructive
                  >
                    {stopping ? (
                      <LoaderCircle
                        className="spin"
                        size={15}
                        aria-hidden="true"
                      />
                    ) : (
                      <Check size={15} aria-hidden="true" />
                    )}
                  </InspectorIconButton>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </aside>
  );
});

function filterSubagentInteractions(
  runView: RunViewState,
  childThreadId: string,
): RunViewState {
  const approvalRequests = runView.approvalRequests.filter(
    (request) => request.threadId === childThreadId,
  );
  const serverRequests = runView.serverRequests.filter((request) => {
    const params =
      request.params && typeof request.params === "object"
        ? (request.params as Record<string, unknown>)
        : {};
    return params.threadId === childThreadId;
  });
  const approvalKeys = new Set(
    approvalRequests.map((request) => request.key),
  );
  const serverKeys = new Set(
    serverRequests.map(requestKey),
  );
  return {
    ...emptyRunView,
    threadId: childThreadId,
    approvalRequests,
    serverRequests,
    approvalResourcesByItemId: runView.approvalResourcesByItemId,
    pendingInteractionOrder: runView.pendingInteractionOrder.filter(
      (interaction) =>
        interaction.kind === "approval"
          ? approvalKeys.has(interaction.key)
          : serverKeys.has(interaction.key),
    ),
    nativePlan: runView.nativePlan,
  };
}

const SubagentTranscriptTurnView = memo(function SubagentTranscriptTurnView({
  turn,
}: {
  turn: SubagentTranscriptTurn;
}) {
  const userItems = turn.items.filter(
    (item): item is Extract<SubagentTranscriptItem, { kind: "user" }> =>
      item.kind === "user",
  );
  const streamItems = turn.items.filter(
    (item) =>
      item.kind === "activity" ||
      item.kind === "reasoning" ||
      (item.kind === "assistant" && item.phase === "commentary"),
  );
  const summaryItems = turn.items.filter(
    (
      item,
    ): item is Extract<
      SubagentTranscriptItem,
      { kind: "assistant" | "plan" }
    > =>
      item.kind === "plan" ||
      (item.kind === "assistant" && item.phase !== "commentary"),
  );

  return (
    <article className="subagent-transcript-turn" data-turn-status={turn.status}>
      {userItems.map((item) => (
        <div className="submitted-prompt-stack" key={item.id}>
          <article className="submitted-prompt" aria-label="Submitted prompt">
            {item.text}
          </article>
        </div>
      ))}
      {streamItems.length > 0 || summaryItems.length > 0 ? (
        <article className="chat-message assistant-message">
          <div
            className={`run-output-surface ${
              isActiveTranscriptTurn(turn.status) ? "running" : "completed"
            }`}
          >
            {streamItems.length > 0 ? (
              <div className="stream-event-list" aria-label="App-server stream">
                {streamItems.flatMap((item) =>
                  renderSubagentStreamItem(item),
                )}
              </div>
            ) : null}
            {summaryItems.map((item) => (
              <div
                className="run-summary markdown-summary"
                aria-label={
                  item.kind === "plan" ? "Subagent plan" : "Run summary"
                }
                key={item.id}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                  {item.text}
                </ReactMarkdown>
              </div>
            ))}
          </div>
        </article>
      ) : null}
    </article>
  );
});

function isActiveTranscriptTurn(status: string) {
  return ["inProgress", "running", "active"].includes(status);
}

function includePersistedInstructions(
  turns: SubagentTranscriptTurn[],
  instructions: SubagentInstruction[],
  recordTask: string | null,
) {
  const initialPrompt =
    instructions.find((instruction) => instruction.kind === "spawn")?.text ??
    recordTask;
  const normalizedInitial = initialPrompt
    ? normalizePrompt(initialPrompt)
    : null;
  const withoutInitial = turns.map((turn) => ({
    ...turn,
    items: turn.items.filter(
      (item) =>
        item.kind !== "user" ||
        !normalizedInitial ||
        normalizePrompt(item.text) !== normalizedInitial,
    ),
  }));
  const projectedPromptCounts = new Map<string, number>();
  withoutInitial.forEach((turn) => {
    turn.items.forEach((item) => {
      if (item.kind !== "user") return;
      const normalized = normalizePrompt(item.text);
      projectedPromptCounts.set(
        normalized,
        (projectedPromptCounts.get(normalized) ?? 0) + 1,
      );
    });
  });
  const missingFollowups = instructions.filter((instruction) => {
    if (instruction.kind === "spawn") return false;
    const normalized = normalizePrompt(instruction.text);
    const projectedCount = projectedPromptCounts.get(normalized) ?? 0;
    if (projectedCount === 0) return true;
    projectedPromptCounts.set(normalized, projectedCount - 1);
    return false;
  });
  if (missingFollowups.length === 0) return withoutInitial;

  const syntheticTurns = missingFollowups.map((instruction) => ({
    id: `${instruction.id}:instruction`,
    status: "completed",
    startedAt: instruction.createdAt,
    completedAt: instruction.createdAt,
    items: [
      {
        id: instruction.id,
        kind: "user" as const,
        text: instruction.text,
      },
    ],
  }));
  return [...withoutInitial, ...syntheticTurns]
    .map((turn, index) => ({ turn, index }))
    .sort((left, right) => {
      const leftTime = Date.parse(left.turn.startedAt ?? "");
      const rightTime = Date.parse(right.turn.startedAt ?? "");
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return leftTime - rightTime || left.index - right.index;
      }
      return left.index - right.index;
    })
    .map(({ turn }) => turn)
    .filter((turn) => turn.items.length > 0);
}

function visibleRecordTask(record: SubagentRecord | null) {
  const prompt = record?.task.trim() ?? "";
  return prompt && prompt !== "Subagent task" && !prompt.startsWith("Subagent /")
    ? prompt
    : null;
}

function normalizePrompt(prompt: string) {
  return prompt.replace(/\s+/gu, " ").trim();
}

function renderSubagentStreamItem(item: SubagentTranscriptItem): ReactNode[] {
  if (item.kind === "assistant") {
    return [
      <div className="stream-message" key={item.id}>
        {item.text}
      </div>,
    ];
  }
  if (item.kind === "reasoning") {
    return item.summaries.map((summary, index) => (
      <div className="stream-event reasoning" key={`${item.id}:${index}`}>
        <BrainCircuit size={15} aria-hidden="true" />
        <span>{summary}</span>
      </div>
    ));
  }
  if (item.kind !== "activity") return [];
  const Icon =
    item.activityKind === "command"
      ? TerminalSquare
      : item.activityKind === "file"
        ? FileCode2
        : MessageSquareText;
  return [
    <div className={`stream-event ${item.activityKind}`} key={item.id}>
      <Icon size={15} aria-hidden="true" />
      <span>{item.label}</span>
      {item.status ? (
        <span className="subagent-transcript-activity-status">
          {item.status}
        </span>
      ) : null}
    </div>,
  ];
}

function transcriptCacheKey(record: SubagentRecord) {
  return `${record.profileKey}:${record.childThreadId}:${
    record.completedAt ?? "active"
  }`;
}

function InspectorIconButton({
  label,
  onClick,
  disabled = false,
  emphasis = false,
  destructive = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  emphasis?: boolean;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className={`native-plan-icon-action${
        emphasis ? " implement" : ""
      }${destructive ? " cancel" : ""}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-tooltip={label}
    >
      {children}
    </button>
  );
}
