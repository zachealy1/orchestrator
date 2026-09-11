import {
  Activity,
  Ban,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  ExternalLink,
  FileDiff,
  FileText,
  GitPullRequest,
  Globe2,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Pencil,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Users,
  Wrench,
  X,
} from "lucide-react";
import {
  memo,
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  ClipboardEvent as ReactClipboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  RunCommandActivity,
  RunEditedFile,
  RunToolActivity,
  RunViewState,
  StreamActivityEvent,
  StreamSteerEvent,
} from "../lib/codexEventReducer";
import {
  validateRequestedFileSystemPermissions,
  type ApprovalChoice,
  type ApprovalResolutionHandler,
  type CodexApprovalRequest,
} from "../lib/codexApprovals";
import {
  isNativeUserInputRequest,
  requestKey,
  type NativeUserInputRequest,
  type UserInputQuestion,
  type UserInputResponse,
} from "../lib/nativePlanMode";
import {
  contextFileExtensionLabel,
  contextFileInlineReferenceTokens,
  contextFileLineReference,
} from "../lib/contextFiles";
import {
  isImageContextFile,
  loadImageAttachmentPreview,
} from "../lib/imageAttachments";
import type { RunWebPreview } from "../lib/webPreview";
import { useAppServices } from "../runtime/AppServices";
import {
  isPreviewableSummaryLink,
  normalizePreviewableMarkdownLinks,
} from "../lib/summaryLinks";
import {
  findSubmittedPromptWebLinks,
  normalizeExternalTranscriptUrl,
} from "../lib/transcriptLinks";
import { prepareStreamingMarkdown } from "../lib/streamingMarkdown";
import { ORCHESTRATOR_PROMPT_CONTEXT_MIME } from "../features/composer/types";
import type { ComposerContextFile } from "../features/composer/types";
import type { CodexMessage } from "../features/codex/types";
import type {
  PreparedHistoricalSummary,
  TaskChatEntry,
} from "../features/conversations/types";
import { GeneratedImagePreviews } from "./GeneratedImagePreviews";
import {
  transcriptMarkdownUrlTransform,
  TranscriptMarkdownImage,
} from "./TranscriptMarkdownImage";
export type { TaskChatEntry } from "../features/conversations/types";
import {
  buildNativePlanPreview,
  editedFilesDisclosureKey,
  nativePlanDisclosureKey,
  type NativePlanDisclosureChangeHandler,
} from "../features/plans/nativePlanPreview";
export {
  buildNativePlanPreview,
  editedFilesDisclosureKey,
  nativePlanDisclosureKey,
} from "../features/plans/nativePlanPreview";
export type {
  NativePlanDisclosureChange,
  NativePlanDisclosureChangeHandler,
  NativePlanPreview,
} from "../features/plans/nativePlanPreview";

import { buildTimelineItems, splitTimelineAtSteers, type TimelineItem } from "../lib/runTimeline";

const EMPTY_CONTEXT_FILES: ComposerContextFile[] = [];
const PLAN_MARKDOWN_PLUGINS = [remarkGfm];

export type PendingInteractionPageChange = {
  anchorElement: HTMLElement;
  anchorTop: number;
};

export type PendingInteractionPageChangeHandler = (
  change: PendingInteractionPageChange,
) => void;


export type TranscriptTurnModel = {
  entry: TaskChatEntry;
  editable: boolean;
  editing: boolean;
  editingPrompt: string;
  fileUndoDisabled?: boolean;
  planExpanded?: boolean;
  editedFilesExpanded?: boolean;
};

export type TranscriptTurnActions = {
  onEditingPromptChange: (prompt: string) => void;
  onSubmitEdit: (entry: TaskChatEntry, prompt: string) => void;
  onCancelEdit: () => void;
  onStartEdit: (entry: TaskChatEntry) => void;
  onResolveRequest: ApprovalResolutionHandler;
  onAnswerUserInput?: (
    entry: TaskChatEntry,
    request: NativeUserInputRequest,
    response: UserInputResponse,
  ) => void;
  onImplementPlan?: (entry: TaskChatEntry) => void;
  onRevisePlan?: (
    entry: TaskChatEntry,
    revision: string,
  ) => boolean | void | Promise<boolean | void>;
  onCancelPlan?: (entry: TaskChatEntry) => void;
  onOpenWebPreview?: (
    entry: TaskChatEntry,
    preview: RunWebPreview,
  ) => Promise<void> | void;
  onReviewEditedFile?: (
    entry: TaskChatEntry,
    file: RunEditedFile,
  ) => Promise<void> | void;
  onUndoEditedFiles?: (entry: TaskChatEntry) => Promise<void> | void;
  onOpenTranscriptLink?: (href: string) => boolean;
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
  onPlanDisclosureChange?: NativePlanDisclosureChangeHandler;
  onPendingInteractionPageChange?: PendingInteractionPageChangeHandler;
};

export const TaskChatTurn = memo(function TaskChatTurn({
  model,
  actions,
}: {
  model: TranscriptTurnModel;
  actions: TranscriptTurnActions;
}) {
  const {
  entry,
  editable,
  editing,
  editingPrompt,
  fileUndoDisabled = false,
  planExpanded,
  editedFilesExpanded,
  } = model;
  const {
  onEditingPromptChange,
  onSubmitEdit,
  onCancelEdit,
  onStartEdit,
  onResolveRequest,
  onAnswerUserInput,
  onImplementPlan,
  onRevisePlan,
  onCancelPlan,
  onOpenTranscriptLink,
  onOpenWebPreview,
  onReviewEditedFile,
  onUndoEditedFiles,
  onLoadHistoricalActivity,
  onPlanDisclosureChange,
  onPendingInteractionPageChange,
  } = actions;
  return (
    <div className="task-chat-run">
      <div
        className={`submitted-prompt-stack ${editable ? "editable" : ""} ${
          editing ? "editing" : ""
        }`}
      >
        {editing ? (
          <form
            className="submitted-prompt-edit-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitEdit(entry, editingPrompt.trim());
            }}
          >
            <article className="submitted-prompt editing" aria-label="Submitted prompt">
              <textarea spellCheck={true}
                aria-label="Edit submitted prompt"
                value={editingPrompt}
                onChange={(event) => onEditingPromptChange(event.target.value)}
                autoFocus
              />
            </article>
            <div className="submitted-prompt-edit-actions">
              <button
                type="submit"
                aria-label="Run edited prompt"
                data-tooltip="Run edited prompt"
                disabled={!editingPrompt.trim()}
              >
                <Check size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Cancel prompt edit"
                data-tooltip="Cancel prompt edit"
                onClick={onCancelEdit}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          </form>
        ) : (
          <>
            <SubmittedImageAttachments
              files={entry.contextFiles ?? EMPTY_CONTEXT_FILES}
              delivery={entry.imageAttachmentDelivery}
            />
            <article
              className="submitted-prompt"
              aria-label="Submitted prompt"
              tabIndex={-1}
              data-agent-notification-target="prompt"
              onCopy={(event) => {
                writeSubmittedPromptClipboard(
                  event,
                  entry.prompt,
                  entry.contextFiles ?? [],
                );
              }}
            >
              <SubmittedPrompt
                prompt={entry.prompt}
                contextFiles={entry.contextFiles ?? EMPTY_CONTEXT_FILES}
                onOpenTranscriptLink={onOpenTranscriptLink}
              />
            </article>
            {editable ? (
              <button
                className="submitted-prompt-edit-button"
                type="button"
                aria-label="Edit prompt"
                data-tooltip="Edit prompt"
                onClick={() => onStartEdit(entry)}
              >
                <Pencil size={15} aria-hidden="true" />
              </button>
            ) : null}
          </>
        )}
      </div>
      <article
        className={`chat-message assistant-message status-${entry.status}`}
        data-agent-notification-target="response"
        tabIndex={-1}
      >
        <AssistantRunOutput
          entry={entry}
          runView={entry.runView}
          onResolveRequest={onResolveRequest}
          onAnswerUserInput={onAnswerUserInput}
          onImplementPlan={onImplementPlan}
          onRevisePlan={onRevisePlan}
          onCancelPlan={onCancelPlan}
          onOpenTranscriptLink={onOpenTranscriptLink}
          onOpenWebPreview={onOpenWebPreview}
          onReviewEditedFile={onReviewEditedFile}
          onUndoEditedFiles={onUndoEditedFiles}
          fileUndoDisabled={fileUndoDisabled}
          onLoadHistoricalActivity={onLoadHistoricalActivity}
          planExpanded={planExpanded}
          editedFilesExpanded={editedFilesExpanded}
          onPlanDisclosureChange={onPlanDisclosureChange}
          onPendingInteractionPageChange={onPendingInteractionPageChange}
        />
      </article>
    </div>
  );
});

function isRunActiveStatus(status: RunViewState["status"]) {
  return status === "connecting" || status === "running";
}

const SubmittedImageAttachments = memo(function SubmittedImageAttachments({
  files,
  delivery,
}: {
  files: ComposerContextFile[];
  delivery: TaskChatEntry["imageAttachmentDelivery"];
}) {
  const imageFiles = files.filter(isImageContextFile);
  if (imageFiles.length === 0) return null;

  return (
    <div
      className="submitted-image-attachments"
      aria-label={`Submitted image${imageFiles.length === 1 ? "" : "s"}`}
    >
      {imageFiles.map((file) => (
        <SubmittedImageAttachment
          key={file.path}
          file={file}
          delivery={delivery}
        />
      ))}
    </div>
  );
});

const SubmittedImageAttachment = memo(function SubmittedImageAttachment({
  file,
  delivery,
}: {
  file: ComposerContextFile;
  delivery: TaskChatEntry["imageAttachmentDelivery"];
}) {
  const { imageAttachments } = useAppServices();
  const [preview, setPreview] = useState<{
    status: "loading" | "ready" | "unavailable";
    dataUrl: string | null;
  }>({ status: "loading", dataUrl: null });

  useEffect(() => {
    let active = true;
    setPreview({ status: "loading", dataUrl: null });
    void loadImageAttachmentPreview(
      file.canonicalPath ?? file.path,
      imageAttachments,
    )
      .then((result) => {
        if (!active) return;
        setPreview(
          result
            ? { status: "ready", dataUrl: result.thumbnailDataUrl }
            : { status: "unavailable", dataUrl: null },
        );
      })
      .catch(() => {
        if (active) {
          setPreview({ status: "unavailable", dataUrl: null });
        }
      });
    return () => {
      active = false;
    };
  }, [file.canonicalPath, file.path, imageAttachments]);

  const state =
    delivery?.status === "failed"
      ? "failed"
      : delivery?.status === "preparing" || preview.status === "loading"
        ? "preparing"
        : preview.status;
  const statusText =
    state === "failed"
      ? "Image not sent"
      : state === "unavailable"
        ? "Image unavailable"
        : null;
  return (
    <figure
      className={`submitted-image-attachment state-${state}`}
      aria-busy={state === "preparing"}
      title={
        delivery?.status === "failed" && delivery.error
          ? `${file.name}: ${delivery.error}`
          : file.path
      }
    >
      {preview.dataUrl ? (
        <img src={preview.dataUrl} alt={file.name} draggable={false} />
      ) : (
        <ImageIcon size={24} aria-hidden="true" />
      )}
      {statusText ? (
        <figcaption>
          <span>{statusText}</span>
        </figcaption>
      ) : null}
    </figure>
  );
});

const SubmittedPrompt = memo(function SubmittedPrompt({
  prompt,
  contextFiles,
  onOpenTranscriptLink,
}: {
  prompt: string;
  contextFiles: ComposerContextFile[];
  onOpenTranscriptLink?: (href: string) => boolean;
}) {
  const segments = useMemo(
    () =>
      buildSubmittedPromptSegments(
        prompt,
        contextFiles.filter((file) => file.source === "search"),
      ),
    [contextFiles, prompt],
  );

  if (!segments.some((segment) => segment.kind !== "text")) {
    return <>{prompt}</>;
  }

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.kind === "text") {
          return <span key={`text-${index}`}>{segment.text}</span>;
        }

        if (segment.kind === "web") {
          return (
            <a
              className="submitted-web-link"
              href={segment.href}
              key={`${segment.href}-${index}`}
              onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
                if (onOpenTranscriptLink?.(segment.href)) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
            >
              {segment.text}
            </a>
          );
        }

        return (
          <a
            className="submitted-inline-file"
            href={segment.href}
            key={`${segment.href}-${index}`}
            title={`Preview ${segment.href}`}
            onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
              if (onOpenTranscriptLink?.(segment.href)) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
          >
            <span className="submitted-inline-file-type" aria-hidden="true">
              {contextFileExtensionLabel(segment.file.name)}
            </span>{" "}
            <span className="submitted-inline-file-name">{segment.file.name}</span>
          </a>
        );
      })}
    </>
  );
});

const AssistantRunOutput = memo(function AssistantRunOutput({
  entry,
  runView,
  onResolveRequest,
  onAnswerUserInput,
  onImplementPlan,
  onRevisePlan,
  onCancelPlan,
  onOpenTranscriptLink,
  onOpenWebPreview,
  onReviewEditedFile,
  onUndoEditedFiles,
  fileUndoDisabled = false,
  onLoadHistoricalActivity,
  planExpanded,
  editedFilesExpanded,
  onPlanDisclosureChange,
  onPendingInteractionPageChange,
}: {
  entry: TaskChatEntry;
  runView: RunViewState;
  onResolveRequest: ApprovalResolutionHandler;
  onAnswerUserInput?: TranscriptTurnActions["onAnswerUserInput"];
  onImplementPlan?: TranscriptTurnActions["onImplementPlan"];
  onRevisePlan?: TranscriptTurnActions["onRevisePlan"];
  onCancelPlan?: TranscriptTurnActions["onCancelPlan"];
  onOpenTranscriptLink?: (href: string) => boolean;
  onOpenWebPreview?: TranscriptTurnActions["onOpenWebPreview"];
  onReviewEditedFile?: TranscriptTurnActions["onReviewEditedFile"];
  onUndoEditedFiles?: TranscriptTurnActions["onUndoEditedFiles"];
  fileUndoDisabled?: boolean;
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
  planExpanded?: boolean;
  editedFilesExpanded?: boolean;
  onPlanDisclosureChange?: NativePlanDisclosureChangeHandler;
  onPendingInteractionPageChange?: PendingInteractionPageChangeHandler;
}) {
  const completed =
    runView.status === "completed" ||
    runView.status === "failed" ||
    runView.status === "interrupted";
  const timelineItems = buildTimelineItems(runView);
  const hasSteers = timelineItems.some((item) => item.kind === "steer");
  const hasTimeline = timelineItems.length > 0;
  const finalAnswer = selectAssistantFinalAnswer(runView, completed);
  const hasTrace = hasTimeline || entry.historicalActivity !== undefined;
  const hasPlanPreview = Boolean(
    runView.nativePlan.completedText || runView.nativePlan.previewText,
  );
  const showSummary = completed
    ? Boolean(
        finalAnswer.trim() ||
          runView.status === "failed" ||
          runView.status === "interrupted" ||
          !runView.nativePlan.completedText,
      )
    : Boolean(finalAnswer.trim());

  return (
    <div
      className={`run-output-surface ${completed ? "completed" : "running"}`}
      aria-label={completed ? undefined : "Live run output"}
    >
      {completed ? (
        hasSteers ? (
          <>
            <RunMetrics runView={runView} />
            {splitTimelineAtSteers(timelineItems).map((section, index) => (
              <Fragment key={section.id}>
                {section.items.length > 0 ? (
                  <RunTraceDropdown
                    entry={entry}
                    runView={runView}
                    items={section.items}
                    label={`Activity ${index + 1}`}
                    onOpenTranscriptLink={onOpenTranscriptLink}
                  />
                ) : null}
                {section.steer ? (
                  <SteerPrompt event={section.steer} onOpenTranscriptLink={onOpenTranscriptLink} />
                ) : null}
              </Fragment>
            ))}
          </>
        ) : hasTrace ? (
          <RunTraceDropdown
            entry={entry}
            runView={runView}
            onLoadHistoricalActivity={onLoadHistoricalActivity}
            onOpenTranscriptLink={onOpenTranscriptLink}
          />
        ) : (
          <RunMetrics runView={runView} />
        )
      ) : (
        <>
          <RunMetrics runView={runView} />
          {hasTimeline ? (
            <RunTimeline
              items={timelineItems}
              onOpenTranscriptLink={onOpenTranscriptLink}
            />
          ) : hasPlanPreview || finalAnswer.trim() ? null : runView.status ===
            "connecting" ? (
            <PreparingRunStatus />
          ) : (
            <p className="stream-placeholder">
              <Clock size={15} aria-hidden="true" />
              Waiting for app-server output...
            </p>
          )}
        </>
      )}
      <NativePlanCard
        entry={entry}
        onImplementPlan={onImplementPlan}
        onRevisePlan={onRevisePlan}
        onCancelPlan={onCancelPlan}
        onOpenTranscriptLink={onOpenTranscriptLink}
        expanded={planExpanded}
        onDisclosureChange={onPlanDisclosureChange}
      />
      <GeneratedImagePreviews runView={runView} />
      {showSummary ? (
        <RunSummary
          key="assistant-final-response"
          runView={runView}
          text={finalAnswer}
          streaming={!completed}
          preparedSummary={completed ? entry.preparedSummary : undefined}
          onOpenTranscriptLink={onOpenTranscriptLink}
        />
      ) : null}
      {completed &&
      runView.nativePlan.intent !== "plan" &&
      runView.nativePlan.intent !== "plan-revision" ? (
        <WebPreviewCard
          entry={entry}
          preview={runView.webPreview}
          onOpen={onOpenWebPreview}
        />
      ) : null}
      {completed ? (
        <EditedFilesSummary
          entry={entry}
          expanded={editedFilesExpanded}
          undoDisabled={fileUndoDisabled}
          onDisclosureChange={onPlanDisclosureChange}
          onReviewFile={onReviewEditedFile}
          onUndo={onUndoEditedFiles}
        />
      ) : null}
      <RunApprovalRequests
        entry={entry}
        runView={runView}
        onResolveRequest={onResolveRequest}
        onAnswerUserInput={onAnswerUserInput}
        onPendingInteractionPageChange={onPendingInteractionPageChange}
      />
    </div>
  );
});

const WebPreviewCard = memo(function WebPreviewCard({
  entry,
  preview,
  onOpen,
}: {
  entry: TaskChatEntry;
  preview: RunWebPreview | null;
  onOpen?: TranscriptTurnActions["onOpenWebPreview"];
}) {
  const [opening, setOpening] = useState(false);
  const [unavailable, setUnavailable] = useState(
    preview?.availability === "unavailable",
  );

  useEffect(() => {
    setUnavailable(preview?.availability === "unavailable");
  }, [preview?.availability, preview?.url]);

  if (!preview) return null;

  const handleOpen = async () => {
    if (opening || !onOpen) return;
    setOpening(true);
    setUnavailable(false);
    try {
      await onOpen(entry, preview);
    } catch {
      setUnavailable(true);
    } finally {
      setOpening(false);
    }
  };

  return (
    <button
      className="web-preview-card"
      type="button"
      disabled={opening || !onOpen}
      aria-label="Open web preview in browser"
      aria-busy={opening}
      onClick={() => void handleOpen()}
    >
      <span className="web-preview-icon" aria-hidden="true">
        <Globe2 size={20} />
      </span>
      <span className="web-preview-copy">
        <strong>Web preview</strong>
        <span>
          {opening
            ? "Checking..."
            : unavailable
              ? "Preview unavailable"
              : "Website"}
        </span>
      </span>
      <span
        className="transcript-summary-action-slot web-preview-action-icon"
        aria-hidden="true"
      >
        <ExternalLink size={16} />
      </span>
    </button>
  );
});

function PreparingRunStatus() {
  return (
    <p className="stream-placeholder stream-preparing" aria-label="Preparing run">
      <span className="stream-loading-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      Preparing run...
    </p>
  );
}

const EDITED_FILES_COLLAPSED_LIMIT = 3;

type EditedFilesActionState = "idle" | "confirming" | "loading" | "success";

const EditedFilesSummary = memo(function EditedFilesSummary({
  entry,
  expanded,
  undoDisabled,
  onDisclosureChange,
  onReviewFile,
  onUndo,
}: {
  entry: TaskChatEntry;
  expanded?: boolean;
  undoDisabled: boolean;
  onDisclosureChange?: NativePlanDisclosureChangeHandler;
  onReviewFile?: TranscriptTurnActions["onReviewEditedFile"];
  onUndo?: TranscriptTurnActions["onUndoEditedFiles"];
}) {
  const files = entry.runView.editedFiles;
  const listId = useId();
  const cardRef = useRef<HTMLElement | null>(null);
  const undoButtonRef = useRef<HTMLButtonElement | null>(null);
  const [localExpanded, setLocalExpanded] = useState(false);
  const [undoState, setUndoState] = useState<EditedFilesActionState>(
    entry.runView.fileChangesReverted ? "success" : "idle",
  );
  const [reviewing, setReviewing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isExpanded = expanded ?? localExpanded;
  const totals = useMemo(
    () =>
      files.reduce(
        (current, file) => ({
          additions: current.additions + file.additions,
          deletions: current.deletions + file.deletions,
        }),
        { additions: 0, deletions: 0 },
      ),
    [files],
  );

  useEffect(() => {
    if (entry.runView.fileChangesReverted) {
      setUndoState("success");
      setActionError(null);
    }
  }, [entry.runView.fileChangesReverted]);

  if (files.length === 0) {
    return null;
  }

  const visibleFiles = isExpanded
    ? files
    : files.slice(0, EDITED_FILES_COLLAPSED_LIMIT);
  const hiddenFileCount = files.length - visibleFiles.length;
  const runActive = isRunActiveStatus(entry.status);
  const changesReverted =
    entry.runView.fileChangesReverted || undoState === "success";
  const exactUndoUnavailable = !entry.runView.latestDiff.trim();
  const undoUnavailable =
    undoDisabled ||
    runActive ||
    exactUndoUnavailable ||
    changesReverted ||
    !onUndo;
  const actionsBusy = undoState === "loading" || reviewing;

  const setExpanded = (nextExpanded: boolean) => {
    const card = cardRef.current;
    if (card && onDisclosureChange) {
      onDisclosureChange({
        anchorElement: card,
        anchorTop: card.getBoundingClientRect().top,
        expanded: nextExpanded,
        planKey: editedFilesDisclosureKey(entry),
      });
      return;
    }
    setLocalExpanded(nextExpanded);
  };

  const reviewFile = async (file: RunEditedFile) => {
    if (!onReviewFile || actionsBusy || changesReverted) {
      return;
    }
    setReviewing(true);
    setActionError(null);
    try {
      await onReviewFile(entry, file);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setReviewing(false);
    }
  };

  const confirmUndo = async () => {
    if (undoUnavailable || actionsBusy || !onUndo) {
      return;
    }
    setUndoState("loading");
    setActionError(null);
    try {
      await onUndo(entry);
      setUndoState("success");
    } catch (error) {
      setUndoState("idle");
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const undoTitle = changesReverted
    ? "These changes have been undone"
    : runActive || undoDisabled
      ? "Wait for the active agent to finish before undoing changes"
      : exactUndoUnavailable
        ? "The exact turn diff is unavailable for this chat"
        : "Undo these file changes";

  return (
    <section
      className={`edited-files-summary ${
        changesReverted
          ? "is-undone"
          : ""
      }`}
      aria-label={`Edited ${files.length} ${files.length === 1 ? "file" : "files"}`}
      aria-busy={actionsBusy}
      ref={cardRef}
    >
      <header className="edited-files-summary-header">
        <span className="edited-files-summary-icon" aria-hidden="true">
          <FileDiff size={20} />
        </span>
        <span className="edited-files-summary-heading">
          <span className="edited-files-summary-title">
            Edited {files.length} {files.length === 1 ? "file" : "files"}
          </span>
          <span className="edited-files-summary-totals">
            <span className="activity-additions">+{totals.additions}</span>
            <span className="activity-deletions">-{totals.deletions}</span>
          </span>
        </span>
        <span className="edited-files-summary-actions">
          <button
            className="native-plan-icon-action transcript-summary-action-slot edited-files-action"
            ref={undoButtonRef}
            type="button"
            aria-label={
              undoState === "success" ? "File changes undone" : "Undo file changes"
            }
            data-tooltip={undoTitle}
            disabled={undoUnavailable || actionsBusy}
            onClick={() => {
              setActionError(null);
              setUndoState("confirming");
            }}
          >
            {undoState === "loading" ? (
              <Loader2 className="spin" size={15} aria-hidden="true" />
            ) : (
              <RotateCcw size={15} aria-hidden="true" />
            )}
          </button>
        </span>
      </header>

      {undoState === "confirming" || undoState === "loading" ? (
        <UndoEditedFilesDialog
          busy={undoState === "loading"}
          onCancel={() => {
            setUndoState("idle");
            requestAnimationFrame(() => undoButtonRef.current?.focus());
          }}
          onConfirm={() => void confirmUndo()}
        />
      ) : null}

      <div className="edited-files-summary-list" id={listId}>
        {visibleFiles.map((file) => (
          <div className="edited-files-summary-row" key={file.path}>
            <button
              className="edited-files-path"
              type="button"
              title={file.path}
              aria-label={`Review ${file.path}`}
              disabled={reviewing || changesReverted || !onReviewFile}
              onClick={() => void reviewFile(file)}
            >
              {file.path}
            </button>
            <span className="edited-files-row-stats" aria-label={`${file.additions} additions, ${file.deletions} deletions`}>
              <span className="activity-additions">+{file.additions}</span>
              <span className="activity-deletions">-{file.deletions}</span>
            </span>
          </div>
        ))}
      </div>

      {files.length > EDITED_FILES_COLLAPSED_LIMIT ? (
        <button
          className="edited-files-disclosure"
          type="button"
          aria-controls={listId}
          aria-expanded={isExpanded}
          onClick={() => setExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <>
              Show fewer files <ChevronUp size={15} aria-hidden="true" />
            </>
          ) : (
            <>
              Show {hiddenFileCount} more {hiddenFileCount === 1 ? "file" : "files"}{" "}
              <ChevronDown size={15} aria-hidden="true" />
            </>
          )}
        </button>
      ) : null}

      {actionError ? (
        <p className="edited-files-action-status error" role="alert">
          {actionError}
        </p>
      ) : null}
    </section>
  );
});

function UndoEditedFilesDialog({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  useEffect(() => {
    cancelButtonRef.current?.focus({ preventScroll: true });
  }, []);

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onCancel();
        }
      }}
    >
      <section
        className="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
      >
        <div>
          <h2 id={titleId}>Undo changes?</h2>
          <p id={descriptionId}>
            Undo the changes represented by this summary?
          </p>
        </div>
        <div className="confirmation-actions">
          <button
            className="native-plan-icon-action"
            ref={cancelButtonRef}
            type="button"
            aria-label="Keep changes"
            data-tooltip="Keep changes"
            disabled={busy}
            onClick={onCancel}
          >
            <X size={15} aria-hidden="true" />
          </button>
          <button
            className="native-plan-icon-action cancel"
            type="button"
            aria-label={busy ? "Undoing changes" : "Undo changes"}
            data-tooltip={busy ? "Undoing changes" : "Undo changes"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? (
              <Loader2 className="spin" size={15} aria-hidden="true" />
            ) : (
              <RotateCcw size={15} aria-hidden="true" />
            )}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

const RunTraceDropdown = memo(function RunTraceDropdown({
  entry,
  runView,
  items,
  label,
  onLoadHistoricalActivity,
  onOpenTranscriptLink,
}: {
  entry: TaskChatEntry;
  runView: RunViewState;
  items?: TimelineItem[];
  label?: string;
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
  onOpenTranscriptLink?: (href: string) => boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <details
      className="stream-trace"
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        if (
          nextOpen &&
          entry.historicalActivity?.status === "available"
        ) {
          onLoadHistoricalActivity?.(entry);
        }
      }}
    >
      <summary className="run-live-metrics" aria-label={label ?? "Run trace"}>
        {label ? <span>{label}</span> : (
          <>
            <span>
              <Clock size={15} aria-hidden="true" />
              {formatDuration(runView.elapsedMs)}
            </span>
            <span>{formatTokenCount(runView)}</span>
          </>
        )}
        <ChevronRight className="run-trace-chevron" size={15} aria-hidden="true" />
      </summary>
      {open ? (
        <>
          {entry.historicalActivity?.status === "loading" ? (
            <p className="historical-activity-status">Loading activity...</p>
          ) : null}
          {entry.historicalActivity?.status === "error" ? (
            <div className="historical-activity-status error">
              <span>
                {entry.historicalActivity.error ?? "Activity could not be loaded."}
              </span>
              <button
                type="button"
                onClick={() => onLoadHistoricalActivity?.(entry)}
              >
                Retry
              </button>
            </div>
          ) : null}
          <RunTimeline
            items={items ?? buildTimelineItems(runView)}
            onOpenTranscriptLink={onOpenTranscriptLink}
          />
        </>
      ) : null}
    </details>
  );
});

const RunMetrics = memo(function RunMetrics({
  runView,
}: {
  runView: RunViewState;
}) {
  return (
    <div className="run-live-metrics" aria-label="Run metrics">
      <span>
        <Clock size={15} aria-hidden="true" />
        {formatDuration(runView.elapsedMs)}
      </span>
      <span>{formatTokenCount(runView)}</span>
    </div>
  );
});

function usePreviewableMarkdownComponents(
  onOpenTranscriptLink?: (href: string) => boolean,
) {
  return useMemo<Components>(
    () => ({
      a: ({ href, children, node: _node, ...props }) => {
        const previewable = Boolean(
          href && onOpenTranscriptLink && isPreviewableSummaryLink(href),
        );
        const external = Boolean(
          href && normalizeExternalTranscriptUrl(href),
        );
        const className = [
          props.className,
          previewable ? "markdown-preview-link" : null,
          external ? "markdown-external-link" : null,
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <a
            {...props}
            className={className || undefined}
            href={href}
            title={previewable ? "Click to preview file" : props.title}
            onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
              if (href && onOpenTranscriptLink?.(href)) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
          >
            {children}
          </a>
        );
      },
      img: ({ node: _node, ...props }) => (
        <TranscriptMarkdownImage {...props} />
      ),
    }),
    [onOpenTranscriptLink],
  );
}

const RunSummary = memo(function RunSummary({
  runView,
  text,
  streaming,
  preparedSummary,
  onOpenTranscriptLink,
}: {
  runView: RunViewState;
  text: string;
  streaming: boolean;
  preparedSummary?: PreparedHistoricalSummary;
  onOpenTranscriptLink?: (href: string) => boolean;
}) {
  if (runView.status === "failed" && runView.error) {
    return (
      <div className="run-summary error" aria-label="Run error">
        {runView.error}
      </div>
    );
  }

  if (runView.status === "interrupted") {
    return (
      <div className="run-summary muted" aria-label="Run summary">
        {runView.error ?? "Stopped by user."}
      </div>
    );
  }

  if (!text.trim()) {
    if (streaming) return null;
    return (
      <div className="run-summary muted" aria-label="Run summary">
        Completed without a final message.
      </div>
    );
  }

  if (preparedSummary?.kind === "plain") {
    return (
      <div
        className="run-summary markdown-summary historical-summary-plain"
        aria-label="Run summary"
      >
        {preparedSummary.text}
      </div>
    );
  }

  if (
    preparedSummary?.kind === "html" &&
    !/<img(?:\s|>)/iu.test(preparedSummary.html)
  ) {
    return (
      <div
        className="run-summary markdown-summary historical-summary-html"
        aria-label="Run summary"
        dangerouslySetInnerHTML={{ __html: preparedSummary.html }}
        onClick={(event) => {
          const target = event.target;
          const anchor =
            target instanceof Element ? target.closest("a[href]") : null;
          const href = anchor?.getAttribute("href");
          if (href && onOpenTranscriptLink?.(href)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      />
    );
  }

  return (
    <AssistantMarkdownMessage
      text={text}
      streaming={streaming}
      onOpenTranscriptLink={onOpenTranscriptLink}
    />
  );
});

const AssistantMarkdownMessage = memo(function AssistantMarkdownMessage({
  text,
  streaming,
  onOpenTranscriptLink,
}: {
  text: string;
  streaming: boolean;
  onOpenTranscriptLink?: (href: string) => boolean;
}) {
  const markdownComponents = usePreviewableMarkdownComponents(onOpenTranscriptLink);
  const markdown = useMemo(
    () =>
      normalizePreviewableMarkdownLinks(
        streaming ? prepareStreamingMarkdown(text) : text,
      ),
    [streaming, text],
  );

  return (
    <div
      className="run-summary markdown-summary assistant-markdown-message"
      aria-label="Run summary"
      aria-live={streaming ? "polite" : undefined}
    >
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={PLAN_MARKDOWN_PLUGINS}
        urlTransform={transcriptMarkdownUrlTransform}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
});

function selectAssistantFinalAnswer(runView: RunViewState, completed: boolean) {
  if (completed) return runView.finalMessage;

  const streamingMessages = Object.values(runView.agentMessagesById)
    .filter((message) => message.phase === "final_answer" && message.text.trim())
    .map((message) => message.text);
  return streamingMessages.length > 0
    ? streamingMessages.join("\n\n")
    : runView.finalMessage;
}

function buildSubmittedPromptSegments(
  prompt: string,
  files: ComposerContextFile[],
) {
  const candidates = buildSubmittedPromptTokenCandidates(prompt, files);
  const segments: Array<
    | { kind: "text"; text: string }
    | { kind: "file"; file: ComposerContextFile; href: string }
    | { kind: "web"; text: string; href: string }
  > = [];
  let cursor = 0;

  while (cursor < prompt.length) {
    const match = candidates.find((candidate) =>
      matchesInlineFileToken(prompt, cursor, candidate.token),
    );

    if (!match) {
      const nextMatchIndex = findNextInlineFileIndex(prompt, cursor + 1, candidates);
      const end = nextMatchIndex === -1 ? prompt.length : nextMatchIndex;
      segments.push(
        ...buildSubmittedPromptTextSegments(prompt.slice(cursor, end)),
      );
      cursor = end;
      continue;
    }

    segments.push({ kind: "file", file: match.file, href: match.href });
    cursor += match.token.length;
  }

  return segments;
}

function buildSubmittedPromptTextSegments(text: string) {
  const links = findSubmittedPromptWebLinks(text);
  const segments: Array<
    | { kind: "text"; text: string }
    | { kind: "web"; text: string; href: string }
  > = [];
  let cursor = 0;

  for (const link of links) {
    if (link.start < cursor) continue;
    if (link.start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, link.start) });
    }
    segments.push({ kind: "web", text: link.label, href: link.href });
    cursor = link.end;
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments;
}

function buildSubmittedPromptTokenCandidates(
  prompt: string,
  files: ComposerContextFile[],
) {
  const candidates = buildInlineFileTokenCandidates(files).map((candidate) => ({
    ...candidate,
    href: contextFileLineReference(candidate.file),
  }));
  const knownTokens = new Set(candidates.map((candidate) => candidate.token));
  const markdownLinkPattern = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;

  for (const match of prompt.matchAll(markdownLinkPattern)) {
    const token = match[0];
    const name = match[1]?.replace(/\\([\\\[\]])/g, "$1").trim();
    const href = match[2]?.trim();
    if (
      !name ||
      !href ||
      knownTokens.has(token) ||
      !isPreviewableSummaryLink(href)
    ) {
      continue;
    }

    knownTokens.add(token);
    candidates.push({
      token,
      href,
      file: {
        path: href,
        name,
        source: "search",
        status: "ready",
      },
    });
  }

  return candidates.sort((left, right) => right.token.length - left.token.length);
}

function buildInlineFileTokenCandidates(files: ComposerContextFile[]) {
  return files
    .filter((file) => file.name.trim().length > 0)
    .flatMap((file) =>
      contextFileInlineReferenceTokens(file).map((token) => ({ file, token })),
    )
    .sort((left, right) => right.token.length - left.token.length);
}

function writeSubmittedPromptClipboard(
  event: ReactClipboardEvent<HTMLElement>,
  prompt: string,
  contextFiles: ComposerContextFile[],
) {
  const inlineFiles = contextFiles.filter((file) => file.source === "search");
  if (inlineFiles.length === 0) {
    return;
  }

  const selectedText = window.getSelection()?.toString() ?? "";
  const copiedPrompt = selectedText.trim().length > 0 ? selectedText : prompt;
  const copiedFiles = findInlineFilesReferencedByText(copiedPrompt, inlineFiles);
  if (copiedFiles.length === 0) {
    return;
  }

  event.preventDefault();
  event.clipboardData.setData("text/plain", copiedPrompt);
  event.clipboardData.setData(
    ORCHESTRATOR_PROMPT_CONTEXT_MIME,
    JSON.stringify({
      version: 1,
      prompt: copiedPrompt,
      files: copiedFiles,
    }),
  );
}

function findInlineFilesReferencedByText(
  text: string,
  files: ComposerContextFile[],
) {
  const seen = new Set<string>();
  const referencedFiles: ComposerContextFile[] = [];

  for (const { file, token } of buildInlineFileTokenCandidates(files)) {
    if (!text.includes(token) || seen.has(file.path)) {
      continue;
    }

    seen.add(file.path);
    referencedFiles.push(file);
  }

  return referencedFiles;
}

function findNextInlineFileIndex(
  prompt: string,
  start: number,
  candidates: Array<{ file: ComposerContextFile; token: string }>,
) {
  for (let index = start; index < prompt.length; index += 1) {
    if (
      candidates.some((candidate) =>
        matchesInlineFileToken(prompt, index, candidate.token),
      )
    ) {
      return index;
    }
  }

  return -1;
}

function matchesInlineFileToken(prompt: string, index: number, token: string) {
  if (!prompt.startsWith(token, index)) {
    return false;
  }

  const before = index === 0 ? "" : prompt[index - 1];
  const after = prompt[index + token.length] ?? "";
  return !isFileNameBoundaryCharacter(before) && !isFileNameBoundaryCharacter(after);
}

function isFileNameBoundaryCharacter(value: string) {
  return /[A-Za-z0-9_.-]/.test(value);
}

const RunTimeline = memo(function RunTimeline({
  items,
  onOpenTranscriptLink,
}: {
  items: TimelineItem[];
  onOpenTranscriptLink?: (href: string) => boolean;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="stream-event-list" aria-label="App-server stream">
      {items.map((item) => {
        if (item.kind === "steer") {
          return <SteerPrompt key={item.event.id} event={item.event} onOpenTranscriptLink={onOpenTranscriptLink} />;
        }
        if (item.kind === "commands") {
          return (
            <RunActivityGroups key={item.id}>
              <CommandsGroup commands={item.commands} />
            </RunActivityGroups>
          );
        }

        if (item.kind === "tools") {
          return (
            <RunActivityGroups key={item.id}>
              <ToolActivitiesGroup activities={item.activities} />
            </RunActivityGroups>
          );
        }

        return (
          <StreamEventRow
            event={item.event}
            key={item.event.id}
            onOpenTranscriptLink={onOpenTranscriptLink}
          />
        );
      })}
    </div>
  );
});

const SteerPrompt = memo(function SteerPrompt({
  event,
  onOpenTranscriptLink,
}: {
  event: StreamSteerEvent;
  onOpenTranscriptLink?: (href: string) => boolean;
}) {
  const pending = event.delivery === "pending";
  return (
    <div className="submitted-prompt-stack">
      <SubmittedImageAttachments
        files={event.contextFiles}
        delivery={{ status: pending ? "preparing" : "sent", error: null }}
      />
      <article
        className="submitted-prompt submitted-steered-prompt"
        aria-label="Additional submitted prompt"
        aria-busy={pending}
        onCopy={(copyEvent) => writeSubmittedPromptClipboard(copyEvent, event.text, event.contextFiles)}
      >
        <SubmittedPrompt prompt={event.text} contextFiles={event.contextFiles} onOpenTranscriptLink={onOpenTranscriptLink} />
      </article>
      {pending ? <span className="steer-delivery-status" role="status">Sending…</span> : null}
    </div>
  );
});

function RunActivityGroups({ children }: { children: ReactNode }) {
  return (
    <div className="run-activity-groups" aria-label="Run activity groups">
      {children}
    </div>
  );
}

const CommandsGroup = memo(function CommandsGroup({
  commands,
}: {
  commands: RunCommandActivity[];
}) {
  return (
    <details className="run-activity-group command-runs">
      <summary>
        <span className="run-activity-title">
          <Terminal size={15} aria-hidden="true" />
          Ran {commands.length} {commands.length === 1 ? "command" : "commands"}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="run-activity-items">
        {commands.map((command) => (
          <div className="run-activity-item command-row" key={command.id}>
            <span>{commandActionLabel(command.status)}</span>
            <span className="activity-command-text">{command.command}</span>
            {command.durationMs !== null ? (
              <span>for {formatDuration(command.durationMs)}</span>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
});

const ToolActivitiesGroup = memo(function ToolActivitiesGroup({
  activities,
}: {
  activities: RunToolActivity[];
}) {
  const active = activities.filter(
    (activity) => activity.status === "pending" || activity.status === "running",
  );
  const failed = activities.filter(
    (activity) =>
      activity.status === "failed" ||
      activity.status === "declined" ||
      activity.status === "interrupted",
  );
  const completed = activities.filter((activity) => activity.status === "completed");
  const recovered = activities.filter((activity) => activity.status === "recovered");
  const resolved = activities.filter(
    (activity) =>
      activity.status === "completed" || activity.status === "recovered",
  );

  return (
    <div className="tool-activity-groups" aria-live="polite">
      {active.map((activity) => (
        <ToolActivityRow activity={activity} key={activity.id} />
      ))}
      {failed.map((activity) => (
        <ToolActivityRow activity={activity} key={activity.id} />
      ))}
      {resolved.length > 0 ? (
        <details className="run-activity-group tool-runs">
          <summary>
            <span className="run-activity-title">
              {toolCategoryIcon(summaryToolCategory(completed), 15)}
              {completedToolSummary(completed, recovered.length)}
            </span>
            <ChevronDown size={15} aria-hidden="true" />
          </summary>
          <div className="run-activity-items">
            {resolved.map((activity) => (
              <ToolActivityRow activity={activity} key={activity.id} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
});

const ToolActivityRow = memo(function ToolActivityRow({
  activity,
}: {
  activity: RunToolActivity;
}) {
  return (
    <div
      className={`run-activity-item tool-activity-row is-${activity.status}`}
      aria-label={`${activity.label}, ${toolActivityStatusLabel(activity.status)}`}
    >
      <span className="tool-activity-icon" aria-hidden="true">
        {toolCategoryIcon(activity.category, 15)}
      </span>
      <span className="tool-activity-label" title={activity.label}>
        {activity.label}
      </span>
      {activity.durationMs !== null ? (
        <span className="tool-activity-duration">
          {formatDuration(activity.durationMs)}
        </span>
      ) : null}
      {activity.safeDetails.length > 0 ? (
        <span className="tool-activity-details">
          {activity.safeDetails.map((detail) => (
            <span key={`${detail.label}:${detail.value}`}>
              <span className="sr-only">{detail.label}: </span>
              {detail.value}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
});

function toolCategoryIcon(category: RunToolActivity["category"], size: number) {
  switch (category) {
    case "browser":
      return <Globe2 size={size} aria-hidden="true" />;
    case "github":
      return <GitPullRequest size={size} aria-hidden="true" />;
    case "search":
      return <Search size={size} aria-hidden="true" />;
    case "collaboration":
      return <Users size={size} aria-hidden="true" />;
    default:
      return <Wrench size={size} aria-hidden="true" />;
  }
}

function summaryToolCategory(activities: RunToolActivity[]) {
  const category = activities[0]?.category ?? "integration";
  return activities.every((activity) => activity.category === category)
    ? category
    : "integration";
}

function completedToolSummary(
  activities: RunToolActivity[],
  recoveredCount = 0,
) {
  if (activities.length === 0) {
    return `${recoveredCount} ${
      recoveredCount === 1 ? "retry" : "retries"
    } recovered`;
  }
  const category = summaryToolCategory(activities);
  const categoryLabel =
    category === "integration"
      ? ""
      : category === "collaboration"
        ? " collaboration"
        : ` ${category}`;
  const completedSummary = `Used ${activities.length}${categoryLabel} ${
    activities.length === 1 ? "tool" : "tools"
  }`;
  return recoveredCount > 0
    ? `${completedSummary} · ${recoveredCount} ${
        recoveredCount === 1 ? "retry" : "retries"
      } recovered`
    : completedSummary;
}

function toolActivityStatusLabel(status: RunToolActivity["status"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "recovered":
      return "Recovered after retry";
    case "declined":
      return "Declined";
    case "interrupted":
      return "Interrupted";
    default:
      return "Failed";
  }
}

const StreamEventRow = memo(function StreamEventRow({
  event,
  onOpenTranscriptLink,
}: {
  event: StreamActivityEvent;
  onOpenTranscriptLink?: (href: string) => boolean;
}) {
  const markdownComponents = usePreviewableMarkdownComponents(onOpenTranscriptLink);
  if (event.kind === "message") {
    return (
      <div className="stream-message" key={event.id}>
        <ReactMarkdown
          components={markdownComponents}
          remarkPlugins={PLAN_MARKDOWN_PLUGINS}
          urlTransform={transcriptMarkdownUrlTransform}
        >
          {normalizePreviewableMarkdownLinks(event.text)}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div className={`stream-event ${event.kind}`} key={event.id}>
      {streamEventIcon(event.kind)}
      <span>{event.text}</span>
    </div>
  );
});

function streamEventIcon(kind: StreamActivityEvent["kind"]) {
  switch (kind) {
    case "command":
      return <Terminal size={15} aria-hidden="true" />;
    case "file":
      return <FileText size={15} aria-hidden="true" />;
    case "reasoning":
      return <BrainCircuit size={15} aria-hidden="true" />;
    case "message":
      return <MessageSquare size={15} aria-hidden="true" />;
    default:
      return <Activity size={15} aria-hidden="true" />;
  }
}

const NativePlanMarkdown = memo(function NativePlanMarkdown({
  text,
  onOpenTranscriptLink,
}: {
  text: string;
  onOpenTranscriptLink?: (href: string) => boolean;
}) {
  const markdownComponents = usePreviewableMarkdownComponents(
    onOpenTranscriptLink,
  );
  return (
    <ReactMarkdown
      components={markdownComponents}
      remarkPlugins={PLAN_MARKDOWN_PLUGINS}
      urlTransform={transcriptMarkdownUrlTransform}
    >
      {text}
    </ReactMarkdown>
  );
});

const NativePlanCard = memo(function NativePlanCard({
  entry,
  onImplementPlan,
  onRevisePlan,
  onCancelPlan,
  onOpenTranscriptLink,
  expanded,
  onDisclosureChange,
}: {
  entry: TaskChatEntry;
  onImplementPlan?: TranscriptTurnActions["onImplementPlan"];
  onRevisePlan?: TranscriptTurnActions["onRevisePlan"];
  onCancelPlan?: TranscriptTurnActions["onCancelPlan"];
  onOpenTranscriptLink?: TranscriptTurnActions["onOpenTranscriptLink"];
  expanded?: boolean;
  onDisclosureChange?: NativePlanDisclosureChangeHandler;
}) {
  const [revising, setRevising] = useState(false);
  const [revision, setRevision] = useState("");
  const [revisionSubmitting, setRevisionSubmitting] = useState(false);
  const revisionSubmissionLockRef = useRef(false);
  const [localDisclosure, setLocalDisclosure] = useState({
    expanded: false,
    planKey: "",
  });
  const cardRef = useRef<HTMLElement | null>(null);
  const contentId = useId();
  const plan = entry.runView.nativePlan;
  const text = plan.completedText || plan.previewText;
  const planKey = nativePlanDisclosureKey(entry);
  const preview = useMemo(() => buildNativePlanPreview(text), [text]);
  useEffect(() => {
    if (plan.reviewState !== "available") return;
    revisionSubmissionLockRef.current = false;
    setRevisionSubmitting(false);
  }, [plan.reviewState, planKey]);
  if (!text) {
    return null;
  }

  const locallyExpanded =
    localDisclosure.planKey === planKey && localDisclosure.expanded;
  const isExpanded = preview.isLong && (expanded ?? locallyExpanded);
  const renderedText = isExpanded ? text : preview.previewText;

  const canReview = plan.reviewState === "available";
  const busy = plan.reviewState === "submitting" || revisionSubmitting;
  const submitRevision = () => {
    const value = revision.trim();
    if (
      !value ||
      busy ||
      revisionSubmissionLockRef.current ||
      !onRevisePlan
    ) {
      return;
    }
    revisionSubmissionLockRef.current = true;
    const accepted = onRevisePlan(entry, value);
    if (accepted === false) {
      revisionSubmissionLockRef.current = false;
      return;
    }
    setRevisionSubmitting(true);
    if (accepted instanceof Promise) {
      void accepted
        .then((started) => {
          if (started === false) {
            revisionSubmissionLockRef.current = false;
            setRevisionSubmitting(false);
          }
        })
        .catch(() => {
          revisionSubmissionLockRef.current = false;
          setRevisionSubmitting(false);
        });
    }
  };
  const heading = canReview
    ? "Plan ready"
    : plan.reviewState === "approved"
      ? "Plan accepted"
      : plan.reviewState === "superseded"
        ? "Plan superseded"
        : plan.reviewState === "cancelled"
          ? "Plan rejected"
          : "Plan";
  const detail = canReview
    ? "Review before implementation"
    : plan.reviewState === "approved"
      ? "Decision accepted"
      : plan.reviewState === "superseded"
        ? "A revised plan follows"
        : plan.reviewState === "cancelled"
          ? "No implementation was started"
          : plan.phase === "completed"
            ? "Completed plan"
            : "Drafting";
  return (
    <section
      className="native-plan-card"
      aria-label="Codex plan"
      ref={cardRef}
      data-agent-notification-target="plan"
      data-agent-notification-id={plan.planItemId ?? ""}
      tabIndex={-1}
    >
      <header>
        <div>
          <strong>{heading}</strong>
          <span>{detail}</span>
        </div>
        {plan.mode ? <span className="native-plan-mode">{plan.mode}</span> : null}
      </header>
      <div
        className={`native-plan-markdown markdown-summary${
          preview.isLong && !isExpanded ? " collapsed" : ""
        }`}
        id={contentId}
      >
        <NativePlanMarkdown
          text={renderedText}
          onOpenTranscriptLink={onOpenTranscriptLink}
        />
      </div>
      {preview.isLong ? (
        <button
          type="button"
          className="small native-plan-disclosure"
          aria-controls={contentId}
          aria-expanded={isExpanded}
          onClick={() => {
            const nextExpanded = !isExpanded;
            const anchorElement = cardRef.current;
            if (anchorElement && onDisclosureChange) {
              onDisclosureChange({
                anchorElement,
                anchorTop: anchorElement.getBoundingClientRect().top,
                expanded: nextExpanded,
                planKey,
              });
              return;
            }
            setLocalDisclosure({
              expanded: nextExpanded,
              planKey,
            });
          }}
        >
          {isExpanded ? (
            <ChevronUp size={15} aria-hidden="true" />
          ) : (
            <ChevronDown size={15} aria-hidden="true" />
          )}
          {isExpanded ? "Hide full plan" : "Show full plan"}
        </button>
      ) : null}
      {canReview && !revising ? (
        <div className="native-plan-actions confirmation-actions">
          <button
            type="button"
            className="native-plan-icon-action implement"
            aria-label="Accept plan"
            data-tooltip="Accept plan"
            disabled={busy || !onImplementPlan}
            onClick={() => onImplementPlan?.(entry)}
          >
            <Check size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="native-plan-icon-action revise"
            aria-label="Update plan"
            data-tooltip="Update plan"
            disabled={busy || !onRevisePlan}
            onClick={() => setRevising(true)}
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="native-plan-icon-action cancel"
            aria-label="Reject plan"
            data-tooltip="Reject plan"
            disabled={busy || !onCancelPlan}
            onClick={() => onCancelPlan?.(entry)}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {canReview && revising ? (
        <form
          className="native-plan-revision"
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            submitRevision();
          }}
        >
          <label htmlFor={`plan-revision-${entry.clientId}`}>What should change?</label>
          <textarea spellCheck={true}
            id={`plan-revision-${entry.clientId}`}
            value={revision}
            onChange={(event) => setRevision(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.shiftKey ||
                event.nativeEvent.isComposing
              ) {
                return;
              }
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
            disabled={busy}
            autoFocus
          />
          <div className="native-plan-actions confirmation-actions">
            <button
              type="submit"
              className="native-plan-icon-action implement"
              aria-label="Send revision"
              data-tooltip="Send revision"
              disabled={!revision.trim() || busy}
            >
              <Check size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="native-plan-icon-action cancel"
              aria-label="Cancel revision"
              data-tooltip="Cancel revision"
              disabled={busy}
              onClick={() => setRevising(false)}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
});

type UserInputDraft = {
  values: Record<string, string>;
  otherValues: Record<string, string>;
};

type PendingInteractionPage =
  | {
      kind: "approval";
      key: string;
      request: CodexApprovalRequest;
    }
  | {
      kind: "user-input";
      key: string;
      request: NativeUserInputRequest;
      question: UserInputQuestion;
    }
  | {
      kind: "unsupported";
      key: string;
      request: CodexMessage;
    };

const EMPTY_USER_INPUT_DRAFT: UserInputDraft = {
  values: {},
  otherValues: {},
};

function buildPendingInteractionPages(runView: RunViewState) {
  const approvalByKey = new Map(
    runView.approvalRequests.map((request) => [request.key, request]),
  );
  const serverRequestByKey = new Map(
    runView.serverRequests.map((request) => [requestKey(request), request]),
  );
  const seenApprovals = new Set<string>();
  const seenServerRequests = new Set<string>();
  const pages: PendingInteractionPage[] = [];

  function appendApproval(request: CodexApprovalRequest) {
    if (seenApprovals.has(request.key)) return;
    seenApprovals.add(request.key);
    pages.push({
      kind: "approval",
      key: `approval:${request.key}`,
      request,
    });
  }

  function appendServerRequest(request: CodexMessage) {
    const key = requestKey(request);
    if (seenServerRequests.has(key)) return;
    seenServerRequests.add(key);
    if (isNativeUserInputRequest(request) && request.params.questions.length > 0) {
      request.params.questions.forEach((question, index) => {
        pages.push({
          kind: "user-input",
          key: `question:${key}:${question.id}:${index}`,
          request,
          question,
        });
      });
      return;
    }
    pages.push({
      kind: "unsupported",
      key: `server-request:${key}`,
      request,
    });
  }

  for (const interaction of runView.pendingInteractionOrder ?? []) {
    if (interaction.kind === "approval") {
      const request = approvalByKey.get(interaction.key);
      if (request) appendApproval(request);
      continue;
    }
    const request = serverRequestByKey.get(interaction.key);
    if (request) appendServerRequest(request);
  }
  runView.approvalRequests.forEach(appendApproval);
  runView.serverRequests.forEach(appendServerRequest);
  return pages;
}

function buildUserInputResponse(
  request: NativeUserInputRequest,
  draft: UserInputDraft,
) {
  const answers: UserInputResponse["answers"] = {};
  const unansweredQuestionIds: string[] = [];
  for (const question of request.params.questions) {
    const selected = draft.values[question.id] ?? "";
    const primary =
      selected === "__other__"
        ? draft.otherValues[question.id]?.trim() ?? ""
        : selected.trim();
    if (!primary) unansweredQuestionIds.push(question.id);
    answers[question.id] = { answers: [primary].filter(Boolean) };
  }
  return {
    complete: unansweredQuestionIds.length === 0,
    response: { answers },
    unansweredQuestionIds,
  };
}

const PendingInteractionNavigator = memo(function PendingInteractionNavigator({
  index,
  total,
  onPrevious,
  onNext,
}: {
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (total <= 1) return null;
  return (
    <nav
      className="pending-interaction-navigator"
      aria-label="Pending interactions"
    >
      <button
        type="button"
        className="pending-interaction-nav"
        aria-label="Previous pending interaction"
        data-tooltip="Previous"
        disabled={index === 0}
        onClick={onPrevious}
      >
        <ChevronLeft size={15} aria-hidden="true" />
      </button>
      <span
        className="pending-interaction-count"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {index + 1} of {total}
      </span>
      <button
        type="button"
        className="pending-interaction-nav"
        aria-label="Next pending interaction"
        data-tooltip="Next"
        disabled={index === total - 1}
        onClick={onNext}
      >
        <ChevronRight size={15} aria-hidden="true" />
      </button>
    </nav>
  );
});

const UserInputQuestionCard = memo(function UserInputQuestionCard({
  entry,
  request,
  question,
  draft,
  navigator,
  onDraftChange,
  onCommitAnswer,
}: {
  entry: TaskChatEntry;
  request: NativeUserInputRequest;
  question: UserInputQuestion;
  draft: UserInputDraft;
  navigator: ReactNode;
  onDraftChange: (draft: UserInputDraft) => void;
  onCommitAnswer: (draft: UserInputDraft) => void;
}) {
  const state = entry.runView.nativePlan.requestStates[requestKey(request)];
  const busy = state === "submitting";
  const selected = draft.values[question.id] ?? "";

  function updateAnswer(value: string, otherValue?: string) {
    const nextDraft = {
      values: { ...draft.values, [question.id]: value },
      otherValues:
        otherValue === undefined
          ? draft.otherValues
          : { ...draft.otherValues, [question.id]: otherValue },
    };
    onDraftChange(nextDraft);
    return nextDraft;
  }

  return (
    <form
      className={`approval native-user-input${navigator ? " has-navigator" : ""}`}
      data-agent-notification-target="user-input"
      data-agent-notification-id={requestKey(request)}
      tabIndex={-1}
      onSubmit={(event) => event.preventDefault()}
    >
      {navigator}
      <fieldset disabled={busy}>
        <legend>{question.question}</legend>
        {question.options ? (
          <div className="native-user-input-options">
            {question.options.map((option, optionIndex) => {
              const descriptionId = `${requestKey(request)}-${question.id}-${optionIndex}-description`;
              return (
                <label
                  className={`native-user-input-option${
                    selected === option.label ? " selected" : ""
                  }`}
                  data-tooltip={option.description}
                  key={option.label}
                >
                  <input
                    className="native-user-input-control"
                    type="radio"
                    name={`${request.id}-${question.id}`}
                    value={option.label}
                    checked={selected === option.label}
                    aria-label={option.label}
                    aria-describedby={descriptionId}
                    onChange={(event) => {
                      const nextDraft = updateAnswer(event.target.value);
                      onCommitAnswer(nextDraft);
                    }}
                  />
                  <span
                    className="native-user-input-radio"
                    aria-hidden="true"
                  />
                  <span className="native-user-input-option-label">
                    {option.label}
                  </span>
                  <div className="sr-only" id={descriptionId}>
                    {option.description}
                  </div>
                </label>
              );
            })}
            {question.isOther ? (
              <label
                className={`native-user-input-option native-user-input-other-option${
                  selected === "__other__" ? " selected" : ""
                }`}
              >
                <span
                  className="native-user-input-radio native-user-input-other-indicator"
                  aria-hidden="true"
                />
                {question.isSecret ? (
                  <input spellCheck={false}
                    className="native-user-input-other"
                    type="password"
                    aria-label={`None of the above: ${question.question}`}
                    placeholder="None of the above - type another answer"
                    value={draft.otherValues[question.id] ?? ""}
                    onFocus={() => updateAnswer("__other__")}
                    onChange={(event) =>
                      updateAnswer("__other__", event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      onCommitAnswer(
                        updateAnswer("__other__", event.currentTarget.value),
                      );
                    }}
                  />
                ) : (
                  <textarea spellCheck={true}
                    className="native-user-input-other"
                    aria-label={`None of the above: ${question.question}`}
                    placeholder="None of the above - type your instructions"
                    rows={1}
                    value={draft.otherValues[question.id] ?? ""}
                    onFocus={() => updateAnswer("__other__")}
                    onChange={(event) =>
                      updateAnswer("__other__", event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.shiftKey) return;
                      event.preventDefault();
                      onCommitAnswer(
                        updateAnswer("__other__", event.currentTarget.value),
                      );
                    }}
                  />
                )}
              </label>
            ) : null}
          </div>
        ) : (
          <input spellCheck={!question.isSecret}
            type={question.isSecret ? "password" : "text"}
            aria-label={question.question}
            value={selected}
            onChange={(event) => updateAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onCommitAnswer(updateAnswer(event.currentTarget.value));
            }}
          />
        )}
      </fieldset>
      {state === "failed" ? (
        <p className="native-user-input-error">
          Could not send that answer. Try again.
        </p>
      ) : null}
    </form>
  );
});

export const RunApprovalRequests = memo(function RunApprovalRequests({
  entry,
  runView,
  onResolveRequest,
  onAnswerUserInput,
  onPendingInteractionPageChange,
}: {
  entry: TaskChatEntry;
  runView: RunViewState;
  onResolveRequest: ApprovalResolutionHandler;
  onAnswerUserInput?: TranscriptTurnActions["onAnswerUserInput"];
  onPendingInteractionPageChange?: PendingInteractionPageChangeHandler;
}) {
  const pages = useMemo(
    () => buildPendingInteractionPages(runView),
    [
      runView.approvalRequests,
      runView.pendingInteractionOrder,
      runView.serverRequests,
    ],
  );
  const [activePageKey, setActivePageKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, UserInputDraft>>({});
  const lastPageIndexRef = useRef(0);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const keyedPageIndex = activePageKey
    ? pages.findIndex((page) => page.key === activePageKey)
    : -1;
  const activePageIndex =
    pages.length === 0
      ? -1
      : keyedPageIndex >= 0
        ? keyedPageIndex
        : Math.min(lastPageIndexRef.current, pages.length - 1);
  const activePage = activePageIndex >= 0 ? pages[activePageIndex] : null;

  useEffect(() => {
    if (!activePage) {
      if (activePageKey !== null) setActivePageKey(null);
      lastPageIndexRef.current = 0;
      return;
    }
    lastPageIndexRef.current = activePageIndex;
    if (activePage.key !== activePageKey) setActivePageKey(activePage.key);
  }, [activePage, activePageIndex, activePageKey]);

  useEffect(() => {
    const activeRequestKeys = new Set(
      runView.serverRequests.map((request) => requestKey(request)),
    );
    setDrafts((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) => activeRequestKeys.has(key)),
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [runView.serverRequests]);

  const selectPage = useCallback(
    (index: number) => {
      const nextIndex = Math.max(0, Math.min(index, pages.length - 1));
      const nextPage = pages[nextIndex];
      if (!nextPage || nextPage.key === activePage?.key) return;
      const anchorElement = stackRef.current;
      if (anchorElement && onPendingInteractionPageChange) {
        onPendingInteractionPageChange({
          anchorElement,
          anchorTop: anchorElement.getBoundingClientRect().top,
        });
      }
      lastPageIndexRef.current = nextIndex;
      setActivePageKey(nextPage.key);
    },
    [activePage?.key, onPendingInteractionPageChange, pages],
  );

  if (!activePage) return null;

  const navigator =
    pages.length > 1 ? (
      <PendingInteractionNavigator
        index={activePageIndex}
        total={pages.length}
        onPrevious={() => selectPage(activePageIndex - 1)}
        onNext={() => selectPage(activePageIndex + 1)}
      />
    ) : null;

  let content: ReactNode;
  if (activePage.kind === "approval") {
    const request = activePage.request;
    content = (
      <ApprovalCard
        key={activePage.key}
        request={request}
        itemResources={
          request.itemId
            ? (runView.approvalResourcesByItemId[request.itemId] ?? [])
            : []
        }
        navigator={navigator}
        onResolveRequest={(pendingRequest, choice) => {
          if (activePageIndex < pages.length - 1) {
            selectPage(activePageIndex + 1);
          }
          onResolveRequest(pendingRequest, choice);
        }}
      />
    );
  } else if (activePage.kind === "user-input") {
    const serverRequestKey = requestKey(activePage.request);
    const draft = drafts[serverRequestKey] ?? EMPTY_USER_INPUT_DRAFT;
    content = (
      <UserInputQuestionCard
        entry={entry}
        request={activePage.request}
        question={activePage.question}
        draft={draft}
        navigator={navigator}
        onDraftChange={(nextDraft) =>
          setDrafts((current) => ({
            ...current,
            [serverRequestKey]: nextDraft,
          }))
        }
        onCommitAnswer={(nextDraft) => {
          const result = buildUserInputResponse(activePage.request, nextDraft);
          if (result.complete && onAnswerUserInput) {
            if (activePageIndex < pages.length - 1) {
              selectPage(activePageIndex + 1);
            }
            onAnswerUserInput(entry, activePage.request, result.response);
            return;
          }
          if (
            result.unansweredQuestionIds.includes(activePage.question.id)
          ) {
            return;
          }
          let nextQuestionIndex = pages.findIndex(
            (page, index) =>
              index > activePageIndex &&
              page.kind === "user-input" &&
              requestKey(page.request) === serverRequestKey &&
              result.unansweredQuestionIds.includes(page.question.id),
          );
          if (nextQuestionIndex < 0) {
            nextQuestionIndex = pages.findIndex(
              (page) =>
                page.kind === "user-input" &&
                requestKey(page.request) === serverRequestKey &&
                result.unansweredQuestionIds.includes(page.question.id),
            );
          }
          if (nextQuestionIndex >= 0) selectPage(nextQuestionIndex);
        }}
      />
    );
  } else {
    content = (
      <article className="approval" key={activePage.key}>
        <header className="approval-header">
          <div>
            <strong>Unsupported native Codex request</strong>
          </div>
          {navigator}
        </header>
        <pre>{JSON.stringify(activePage.request.params ?? {}, null, 2)}</pre>
        <p>Stop the turn to cancel this request safely.</p>
      </article>
    );
  }

  return (
    <div
      className="approval-stack chat-approval-stack"
      aria-label="Pending Codex interactions"
      ref={stackRef}
    >
      {content}
    </div>
  );
});

const ApprovalCard = memo(function ApprovalCard({
  request,
  itemResources,
  navigator,
  onResolveRequest,
}: {
  request: CodexApprovalRequest;
  itemResources: string[];
  navigator?: ReactNode;
  onResolveRequest: ApprovalResolutionHandler;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const busy =
    request.status === "submitting" || request.status === "awaiting-resolution";
  const disabled = busy || request.status === "stale";
  const command = approvalCommand(request);
  const cwd = approvalString(request.params.cwd);
  const reason = approvalString(request.params.reason);
  const network = approvalRecord(request.params.networkApprovalContext);
  const permissionProfile =
    approvalRecord(request.params.additionalPermissions) ??
    approvalRecord(request.params.permissions);
  const fileSystemRequest =
    validateRequestedFileSystemPermissions(permissionProfile);
  const permissionPaths =
    fileSystemRequest.status === "valid"
      ? new Set(fileSystemRequest.entries.map((entry) => entry.path.path))
      : new Set<string>();
  const resources = approvalResources(request, itemResources).filter(
    (resource) => !permissionPaths.has(resource),
  );
  const hasContext = Boolean(
    cwd ||
      reason ||
      network ||
      resources.length > 0,
  );
  const statusLabel = approvalStatusLabel(request);

  useEffect(() => {
    if (request.status !== "pending") return;
    cardRef.current?.focus({ preventScroll: true });
  }, [request.key, request.status]);

  return (
    <article
      className={`approval native-approval approval-${request.status}`}
      ref={cardRef}
      tabIndex={-1}
      data-agent-notification-target="approval"
      data-agent-notification-id={request.key}
      aria-labelledby={`${request.key}-title`}
      aria-busy={busy}
    >
      <header className="approval-header">
        <ShieldAlert size={19} aria-hidden="true" />
        <div>
          <strong id={`${request.key}-title`}>
            {approvalTitle(request, fileSystemRequest)}
          </strong>
        </div>
        {navigator}
      </header>

      {command ? (
        <div className="approval-command">
          <span>Command</span>
          <pre className="approval-code-surface">{command}</pre>
        </div>
      ) : null}

      {fileSystemRequest.status === "valid" ? (
        <div className="approval-command approval-filesystem-permissions">
          <span>Requested filesystem access</span>
          <div className="approval-permission-list">
            {fileSystemRequest.entries.map((entry) => (
              <div
                className="approval-permission-entry"
                key={`${entry.access}:${entry.path.path}`}
              >
                <span className="approval-permission-access">
                  {approvalPermissionAccessLabel(entry.access)}
                </span>
                <pre className="approval-code-surface">{entry.path.path}</pre>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {request.error ? (
        <p className="approval-error" role="alert">
          {request.error}
        </p>
      ) : null}

      <div className="approval-decision-row">
        {hasContext ? (
          <dl className="approval-context">
            {cwd ? (
              <>
                <dt>Working directory</dt>
                <dd className="approval-context-code-row">
                  <pre className="approval-code-surface">{cwd}</pre>
                </dd>
              </>
            ) : null}
            {reason ? (
              <>
                <dt>Why approval is required</dt>
                <dd>{reason}</dd>
              </>
            ) : null}
            {network ? (
              <>
                <dt>Network access</dt>
                <dd>{approvalNetworkLabel(network)}</dd>
              </>
            ) : null}
            {resources.length > 0 ? (
              <>
                <dt>Affected resources</dt>
                <dd className="approval-context-code-row approval-resource-list">
                  {resources.map((resource) => (
                    <pre className="approval-code-surface" key={resource}>
                      {resource}
                    </pre>
                  ))}
                </dd>
              </>
            ) : null}
          </dl>
        ) : null}

        <div className="approval-actions" role="group" aria-label="Approval choices">
          {request.choices.map((choice, index) => {
            const descriptionId = `${request.key}-choice-${index}-description`;
            const description = `${choice.description}${
              choice.broadScope ? " This is broader than one operation." : ""
            }`;
            return (
              <button
                className={`approval-choice approval-choice-${choice.tone}`}
                type="button"
                key={choice.id}
                disabled={disabled}
                aria-label={choice.label}
                aria-describedby={descriptionId}
                data-tooltip={description}
                onClick={() => onResolveRequest(request, choice)}
              >
                <ApprovalChoiceIcon choice={choice} />
                <span className="sr-only" id={descriptionId}>
                  {description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {statusLabel ? (
        <p className="approval-status" aria-live="polite">
          {statusLabel}
        </p>
      ) : null}
    </article>
  );
});

function ApprovalChoiceIcon({ choice }: { choice: ApprovalChoice }) {
  if (choice.id === "cancel" || choice.id === "abort") {
    return <X size={17} aria-hidden="true" />;
  }
  if (choice.tone === "danger") {
    return <Ban size={17} aria-hidden="true" />;
  }
  if (choice.broadScope) {
    return <ShieldCheck size={17} aria-hidden="true" />;
  }
  return <Check size={17} aria-hidden="true" />;
}

function approvalTitle(
  request: CodexApprovalRequest,
  fileSystemRequest: ReturnType<
    typeof validateRequestedFileSystemPermissions
  >,
) {
  if (
    fileSystemRequest.status === "valid" &&
    fileSystemRequest.entries.some((entry) => entry.access === "write")
  ) {
    return "Codex needs approval to write outside the workspace";
  }
  if (fileSystemRequest.status === "valid") {
    return "Codex needs approval to access files outside the workspace";
  }
  switch (request.kind) {
    case "command":
    case "legacy-command":
      return "Codex needs approval to run a command";
    case "file-change":
    case "legacy-file-change":
      return "Codex needs approval to change files";
    case "permissions":
      return "Codex is requesting additional permissions";
    default:
      return "Unsupported native Codex request";
  }
}

function approvalStatusLabel(request: CodexApprovalRequest) {
  switch (request.status) {
    case "submitting":
      return "Submitting your decision to Codex…";
    case "awaiting-resolution":
      return "Decision submitted. Waiting for Codex to resolve the native request…";
    case "error":
      return "The decision was not submitted. Choose an available option to retry.";
    case "stale":
      return "This request is no longer connected to the native Codex operation.";
    default:
      return request.choices.length > 0
        ? null
        : "Codex remains blocked. Stop the turn to cancel this unsupported request safely.";
  }
}

function approvalCommand(request: CodexApprovalRequest) {
  const command = request.params.command;
  if (typeof command === "string") return command;
  if (Array.isArray(command) && command.every((item) => typeof item === "string")) {
    return command.join(" ");
  }
  return null;
}

function approvalResources(
  request: CodexApprovalRequest,
  itemResources: string[],
) {
  const resources: string[] = [...itemResources];
  const grantRoot = approvalString(request.params.grantRoot);
  if (grantRoot) resources.push(grantRoot);
  const fileChanges = approvalRecord(request.params.fileChanges);
  if (fileChanges) resources.push(...Object.keys(fileChanges));
  const changes = Array.isArray(request.params.changes) ? request.params.changes : [];
  for (const change of changes) {
    const record = approvalRecord(change);
    const path = approvalString(record?.path);
    if (path) resources.push(path);
  }
  const permissionProfile =
    approvalRecord(request.params.additionalPermissions) ??
    approvalRecord(request.params.permissions);
  const fileSystemRequest =
    validateRequestedFileSystemPermissions(permissionProfile);
  if (fileSystemRequest.status === "valid") {
    resources.push(
      ...fileSystemRequest.entries.map((entry) => entry.path.path),
    );
  }
  return Array.from(new Set(resources));
}

function approvalPermissionAccessLabel(
  access: "read" | "write" | "deny",
) {
  switch (access) {
    case "read":
      return "Read";
    case "write":
      return "Write";
    case "deny":
      return "Deny";
  }
}

function approvalNetworkLabel(network: Record<string, unknown>) {
  const host = approvalString(network.host) ?? "an external host";
  const protocol = approvalString(network.protocol);
  return protocol ? `${protocol}://${host}` : host;
}

function approvalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function approvalRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}hr ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatTokenCount(runView: RunViewState) {
  if (
    runView.tokenUsage?.turnTokens !== null &&
    runView.tokenUsage?.turnTokens !== undefined
  ) {
    return `${runView.tokenUsage.turnTokens.toLocaleString()} tokens`;
  }
  if (
    runView.tokenUsage === null &&
    (runView.status === "idle" ||
      runView.status === "connecting" ||
      runView.status === "running")
  ) {
    return "0 tokens";
  }
  return "Token usage unavailable";
}

function commandActionLabel(status: RunCommandActivity["status"]) {
  if (status === "failed") {
    return "Failed";
  }
  if (status === "declined") {
    return "Skipped";
  }
  if (status === "running") {
    return "Running";
  }
  if (status === "awaiting-approval") {
    return "Awaiting approval";
  }
  if (status === "pending") {
    return "Preparing";
  }
  return "Ran";
}
