import {
  Bot,
  Check,
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
  getConversationSubagents,
  isActiveSubagentStatus,
  subscribeConversationSubagents,
  type SubagentRecord,
  type SubagentTranscript,
  type SubagentTranscriptItem,
} from "../lib/subagents";
import type {
  NativeUserInputRequest,
  UserInputResponse,
} from "../lib/nativePlanMode";
import { requestKey } from "../lib/nativePlanMode";
import {
  RunApprovalRequests,
  type TaskChatEntry,
} from "./TaskChatTranscript";
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

type InspectorRow = {
  id: string;
  turnId: string;
  turnStatus: string;
  item: SubagentTranscriptItem;
};

const transcriptCache = new Map<string, SubagentTranscript>();
const TRANSCRIPT_CACHE_LIMIT = 5;

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
  const [records, setRecords] = useState(() =>
    getConversationSubagents(conversationKey),
  );
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
  const loadGenerationRef = useRef(0);
  const steeringLockRef = useRef(false);

  useEffect(
    () =>
      subscribeConversationSubagents(conversationKey, () => {
        setRecords(getConversationSubagents(conversationKey));
      }),
    [conversationKey],
  );

  useEffect(() => {
    if (!record) return;
    const generation = ++loadGenerationRef.current;
    const cacheKey = transcriptCacheKey(record);
    const cached = transcriptCache.get(cacheKey) ?? null;
    setTranscriptState({
      status: cached ? "loaded" : "loading",
      transcript: cached,
      error: null,
    } as TranscriptState);
    const timer = window.setTimeout(() => {
      void onLoadTranscript(record)
        .then((transcript) => {
          if (loadGenerationRef.current !== generation) return;
          rememberTranscript(cacheKey, transcript);
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
        });
    }, cached ? 240 : 0);
    return () => window.clearTimeout(timer);
  }, [
    onLoadTranscript,
    record?.childTurnId,
    record?.completedAt,
    record?.id,
  ]);

  const interactionRunView = useMemo(
    () =>
      record && parentRunView
        ? filterSubagentInteractions(parentRunView, record.childThreadId)
        : null,
    [parentRunView, record],
  );
  const interactionEntry = useMemo(
    () =>
      parentEntry && interactionRunView
        ? { ...parentEntry, runView: interactionRunView }
        : null,
    [interactionRunView, parentEntry],
  );
  const transcriptRows = useMemo(
    () => flattenTranscript(transcriptState.transcript),
    [transcriptState.transcript],
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
      className="subagent-inspector"
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
              transcriptCache.delete(transcriptCacheKey(record));
              setTranscriptState({
                status: "loading",
                transcript: transcriptState.transcript,
                error: null,
              });
              void onLoadTranscript(record)
                .then((transcript) => {
                  if (loadGenerationRef.current !== generation) return;
                  rememberTranscript(transcriptCacheKey(record), transcript);
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

      <section className="subagent-inspector-task" aria-label="Subagent task">
        <Bot size={15} aria-hidden="true" />
        <p>{record.task || "Subagent task details are unavailable."}</p>
      </section>

      <div
        className={`subagent-inspector-interactions${
          interactionEntry && interactionRunView ? "" : " is-empty"
        }`}
      >
        {interactionEntry && interactionRunView ? (
          <RunApprovalRequests
            entry={interactionEntry}
            runView={interactionRunView}
            onResolveRequest={onResolveRequest}
            onAnswerUserInput={onAnswerUserInput}
          />
        ) : null}
      </div>

      <div className="subagent-inspector-transcript">
        {transcriptState.status === "loading" &&
        !transcriptState.transcript ? (
          <div className="subagent-inspector-loading">
            <LoaderCircle className="spin" size={16} aria-hidden="true" />
            <span>Loading subagent transcript</span>
          </div>
        ) : transcriptRows.length > 0 ? (
          <Virtuoso
            className="subagent-transcript-list"
            data={transcriptRows}
            computeItemKey={(_, row) => row.id}
            increaseViewportBy={{ top: 500, bottom: 800 }}
            followOutput={canStop ? "auto" : false}
            itemContent={(_, row) => <SubagentTranscriptRow row={row} />}
          />
        ) : (
          <div className="subagent-inspector-empty">
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

function flattenTranscript(
  transcript: SubagentTranscript | null,
): InspectorRow[] {
  if (!transcript) return [];
  return transcript.turns.flatMap((turn) =>
    turn.items.map((item) => ({
      id: `${turn.id}:${item.id}`,
      turnId: turn.id,
      turnStatus: turn.status,
      item,
    })),
  );
}

const SubagentTranscriptRow = memo(function SubagentTranscriptRow({
  row,
}: {
  row: InspectorRow;
}) {
  if (row.item.kind === "activity") {
    const Icon =
      row.item.activityKind === "command"
        ? TerminalSquare
        : row.item.activityKind === "file"
          ? FileCode2
          : MessageSquareText;
    return (
      <article className="subagent-transcript-activity">
        <Icon size={14} aria-hidden="true" />
        <span>{row.item.label}</span>
        {row.item.status ? <small>{row.item.status}</small> : null}
      </article>
    );
  }
  if (row.item.kind === "reasoning") {
    return (
      <article className="subagent-transcript-reasoning">
        {row.item.summaries.map((summary, index) => (
          <p key={`${row.item.id}:${index}`}>{summary}</p>
        ))}
      </article>
    );
  }
  const text = row.item.text;
  return (
    <article
      className={`subagent-transcript-message subagent-transcript-${row.item.kind}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {text}
      </ReactMarkdown>
    </article>
  );
});

function transcriptCacheKey(record: SubagentRecord) {
  return `${record.profileKey}:${record.childThreadId}:${
    record.completedAt ?? "active"
  }`;
}

function rememberTranscript(key: string, transcript: SubagentTranscript) {
  transcriptCache.delete(key);
  transcriptCache.set(key, transcript);
  while (transcriptCache.size > TRANSCRIPT_CACHE_LIMIT) {
    const oldest = transcriptCache.keys().next().value;
    if (typeof oldest !== "string") break;
    transcriptCache.delete(oldest);
  }
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
      title={label}
      data-tooltip={label}
    >
      {children}
    </button>
  );
}
