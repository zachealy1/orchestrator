import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ListTodo,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  isPromptQueueItemMutable,
  isPromptQueueItemAutoDispatchEligible,
  queuePromptPreview,
} from "../lib/promptQueue";
import type { PromptQueueItem, PromptQueueStatus as PromptQueueItemStatus } from "../features/queue/types";
import {
  ComposerStripRow,
  type ComposerStripTone,
} from "./ComposerStripRow";

type Props = {
  items: PromptQueueItem[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  actionPendingItemId?: string | null;
  onEdit: (item: PromptQueueItem) => void;
  onRemove: (item: PromptQueueItem) => void;
  onRetry: (item: PromptQueueItem) => void;
  onAutoSendChange: (
    item: PromptQueueItem,
    enabled: boolean,
  ) => void;
  onSendNow: (item: PromptQueueItem) => void;
  onReorder: (orderedItemIds: string[]) => void;
};

const STATUS_LABELS: Record<PromptQueueItemStatus, string> = {
  queued: "Queued",
  "scheduled-next": "Next",
  starting: "Starting",
  steering: "Sending",
  active: "Running",
  failed: "Failed",
  stale: "Review needed",
  skipped: "Skipped",
  completed: "Completed",
};

function queueItemStatusLabel(item: PromptQueueItem) {
  return !item.autoSendEnabled && item.sendNowPriority === null
    ? "Held"
    : STATUS_LABELS[item.status];
}

export const PromptQueueStatus = memo(function PromptQueueStatus({
  items,
  open: controlledOpen,
  onOpenChange,
  actionPendingItemId = null,
  onEdit,
  onRemove,
  onRetry,
  onAutoSendChange,
  onSendNow,
  onReorder,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      const resolved =
        typeof next === "function" ? next(open) : next;
      if (controlledOpen === undefined) setInternalOpen(resolved);
      onOpenChange?.(resolved);
    },
    [controlledOpen, onOpenChange, open],
  );
  const popoverRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const activeItem =
    items.find((item) =>
      ["starting", "steering", "active"].includes(item.status),
    ) ?? null;
  const nextItem =
    items.find(
      (item) =>
        ["queued", "scheduled-next", "failed", "stale"].includes(
          item.status,
        ) && isPromptQueueItemAutoDispatchEligible(item),
    ) ?? null;
  const previewItem = activeItem ?? nextItem ?? items[0] ?? null;

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        popoverRef.current?.contains(target) ||
        toggleRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      toggleRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (items.length === 0) {
      setOpen(false);
    }
  }, [items.length]);

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;

    const activeIndex = itemIds.indexOf(activeId);
    const overIndex = itemIds.indexOf(overId);
    if (activeIndex < 0 || overIndex < 0) return;
    const activeQueueItem = items[activeIndex];
    const overQueueItem = items[overIndex];
    if (
      !activeQueueItem ||
      !overQueueItem ||
      !isPromptQueueItemMutable(activeQueueItem) ||
      !isPromptQueueItemMutable(overQueueItem)
    ) {
      return;
    }
    onReorder(arrayMove(itemIds, activeIndex, overIndex));
  }

  if (items.length === 0) return null;

  const countLabel = `${items.length} prompt${items.length === 1 ? "" : "s"}`;
  const rowTitle = activeItem ? "Queue" : "Queued";
  const rowStatus = previewItem ? queueItemStatusLabel(previewItem) : "Queued";
  const rowDetail = previewItem
    ? queuePromptPreview(previewItem.prompt)
    : null;
  const visibleRowStatus = rowStatus === rowTitle ? null : rowStatus;

  return (
    <ComposerStripRow
      className="prompt-queue-status-row"
      state={previewItem?.status}
      tone={promptQueueTone(previewItem)}
      icon={<ListTodo size={15} aria-hidden="true" />}
      title={rowTitle}
      description={rowDetail}
      descriptionTitle={previewItem?.prompt}
      status={visibleRowStatus}
      statusTitle={rowStatus}
      trailing={
        open ? (
          <ChevronDown size={15} aria-hidden="true" />
        ) : (
          <ChevronUp size={15} aria-hidden="true" />
        )
      }
      interactive={{
        buttonRef: toggleRef,
        label: `${rowTitle}, ${countLabel}, ${rowStatus}. ${
          open ? "Close" : "Open"
        } prompt queue`,
        expanded: open,
        controls: "prompt-queue-popover",
        onClick: () => setOpen((current) => !current),
      }}
    >
      {open ? (
        <div
          ref={popoverRef}
          id="prompt-queue-popover"
          className="prompt-queue-popover"
          role="region"
          aria-label="Prompt queue"
        >
          <header className="prompt-queue-popover-header">
            <div>
              <strong>Prompt queue</strong>
              <span>{countLabel}</span>
            </div>
            <QueueIconButton label="Close queue" onClick={() => setOpen(false)}>
              <X size={15} aria-hidden="true" />
            </QueueIconButton>
          </header>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            accessibility={{
              screenReaderInstructions: {
                draggable:
                  "Press Space to lift a queued prompt. Use the arrow keys to move it, then press Space to drop or Escape to cancel.",
              },
            }}
          >
            <SortableContext
              items={itemIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="prompt-queue-list">
                {items.map((item) => (
                  <SortableQueueItem
                    key={item.id}
                    item={item}
                    pending={actionPendingItemId === item.id}
                    onEdit={() => {
                      onEdit(item);
                      setOpen(false);
                    }}
                    onRemove={() => onRemove(item)}
                    onRetry={() => onRetry(item)}
                    onAutoSendChange={(enabled) =>
                      onAutoSendChange(item, enabled)
                    }
                    onSendNow={() => onSendNow(item)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      ) : null}
    </ComposerStripRow>
  );
});

function promptQueueTone(
  item: PromptQueueItem | null,
): ComposerStripTone {
  if (!item) return "neutral";
  if (!item.autoSendEnabled && item.sendNowPriority === null) {
    return "muted";
  }
  switch (item.status) {
    case "starting":
    case "steering":
    case "active":
      return "active";
    case "failed":
      return "danger";
    case "stale":
      return "attention";
    case "skipped":
      return "muted";
    case "completed":
      return "success";
    case "queued":
    case "scheduled-next":
      return "neutral";
  }
}

type SortableQueueItemProps = {
  item: PromptQueueItem;
  pending: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onRetry: () => void;
  onAutoSendChange: (enabled: boolean) => void;
  onSendNow: () => void;
};

const SortableQueueItem = memo(function SortableQueueItem({
  item,
  pending,
  onEdit,
  onRemove,
  onRetry,
  onAutoSendChange,
  onSendNow,
}: SortableQueueItemProps) {
  const mutable = isPromptQueueItemMutable(item);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: !mutable || pending,
  });
  const settings = item.snapshot.executionSettings;
  const mode = settings.goalMode
    ? "Goal"
    : settings.mode === "plan"
      ? "Plan"
      : "Chat";
  const settingsSummary = [
    mode,
    settings.model ?? "Default model",
    settings.reasoningEffort,
    settings.contextFiles.length > 0
      ? `${settings.contextFiles.length} attachment${
          settings.contextFiles.length === 1 ? "" : "s"
        }`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const canRemove = mutable && item.linkedRunId === null;
  const canRetry = item.status === "failed" || item.status === "stale";
  const canChangeAutoSend = [
    "queued",
    "scheduled-next",
    "failed",
    "stale",
  ].includes(item.status);
  const canSendNow = ["queued", "scheduled-next", "failed", "stale"].includes(
    item.status,
  );
  const held = !item.autoSendEnabled && item.sendNowPriority === null;
  const statusLabel = queueItemStatusLabel(item);
  const staleSummary =
    item.staleReasons.length > 0 ? item.staleReasons.join(" ") : null;

  return (
    <article
      ref={setNodeRef}
      className={`prompt-queue-item ${isDragging ? "dragging" : ""}`}
      data-status={item.status}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div className="prompt-queue-item-main">
        <button
          className="prompt-queue-drag-handle"
          type="button"
          disabled={!mutable || pending}
          aria-label={`Reorder queued prompt: ${queuePromptPreview(item.prompt, 50)}`}
          data-tooltip="Reorder prompt"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={15} aria-hidden="true" />
        </button>
        <div className="prompt-queue-item-copy">
          <span className="prompt-queue-item-prompt">
            {queuePromptPreview(item.prompt, 110)}
          </span>
          <small>{settingsSummary}</small>
          {item.error ? (
            <span
              className="prompt-queue-item-error"
              role="alert"
              aria-label={item.error}
            >
              <AlertCircle size={13} aria-hidden="true" />
              <span>{queuePromptPreview(item.error, 100)}</span>
            </span>
          ) : staleSummary ? (
            <span
              className="prompt-queue-item-error"
              role="status"
              aria-label={staleSummary}
            >
              <AlertCircle size={13} aria-hidden="true" />
              <span>{queuePromptPreview(staleSummary, 100)}</span>
            </span>
          ) : null}
        </div>
        <span
          className="prompt-queue-item-status"
          data-status={held ? "held" : item.status}
        >
          {pending ? (
            <LoaderCircle
              className="prompt-queue-spinner"
              size={13}
              aria-hidden="true"
            />
          ) : null}
          {statusLabel}
        </span>
        <div
          className="prompt-queue-item-actions"
          role="toolbar"
          aria-label={`Actions for queued prompt: ${queuePromptPreview(
            item.prompt,
            50,
          )}`}
        >
          <QueueIconButton
            label="Edit queued prompt"
            onClick={onEdit}
            disabled={!mutable || pending}
          >
            <Pencil size={15} aria-hidden="true" />
          </QueueIconButton>
          {canRetry ? (
            <QueueIconButton
              label="Retry queued prompt"
              onClick={onRetry}
              disabled={pending}
            >
              <RotateCcw size={15} aria-hidden="true" />
            </QueueIconButton>
          ) : null}
          {canSendNow ? (
            <QueueIconButton
              label="Send queued prompt now"
              tooltip="Send now; steer the active agent when one is running"
              onClick={onSendNow}
              disabled={pending}
              emphasis
            >
              <Send size={15} aria-hidden="true" />
            </QueueIconButton>
          ) : null}
          {canChangeAutoSend ? (
            <QueueIconButton
              label={
                held
                  ? "Restore automatic sending"
                  : "Skip automatic sending"
              }
              onClick={() => onAutoSendChange(held)}
              disabled={pending}
            >
              {held ? (
                <Play size={15} aria-hidden="true" />
              ) : (
                <Pause size={15} aria-hidden="true" />
              )}
            </QueueIconButton>
          ) : null}
          {canRemove ? (
            <QueueIconButton
              label="Remove queued prompt"
              onClick={onRemove}
              disabled={pending}
              destructive
            >
              <Trash2 size={15} aria-hidden="true" />
            </QueueIconButton>
          ) : null}
        </div>
      </div>
    </article>
  );
});

function QueueIconButton({
  label,
  tooltip = label,
  onClick,
  disabled = false,
  emphasis = false,
  destructive = false,
  children,
}: {
  label: string;
  tooltip?: string;
  onClick: () => void;
  disabled?: boolean;
  emphasis?: boolean;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className={`native-plan-icon-action prompt-queue-icon-action ${
        emphasis ? "implement" : ""
      } ${destructive ? "cancel" : ""}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-tooltip={tooltip}
    >
      {children}
    </button>
  );
}
