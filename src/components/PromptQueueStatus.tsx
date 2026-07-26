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
  Pencil,
  Play,
  RotateCcw,
  Send,
  SkipForward,
  Trash2,
  X,
} from "lucide-react";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Virtuoso } from "react-virtuoso";
import {
  isPromptQueueItemMutable,
  queuePromptPreview,
} from "../lib/promptQueue";
import type {
  PromptQueueItem,
  PromptQueueStatus as PromptQueueItemStatus,
} from "../types";

type Props = {
  items: PromptQueueItem[];
  paused: boolean;
  actionPendingItemId?: string | null;
  onEdit: (item: PromptQueueItem) => void;
  onRemove: (item: PromptQueueItem) => void;
  onRetry: (item: PromptQueueItem) => void;
  onSkip: (item: PromptQueueItem) => void;
  onSendNow: (item: PromptQueueItem) => void;
  onResume: () => void;
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

export const PromptQueueStatus = memo(function PromptQueueStatus({
  items,
  paused,
  actionPendingItemId = null,
  onEdit,
  onRemove,
  onRetry,
  onSkip,
  onSendNow,
  onResume,
  onReorder,
}: Props) {
  const [open, setOpen] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
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
    items.find((item) =>
      ["queued", "scheduled-next", "failed", "stale"].includes(item.status),
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
      setExpandedItemId(null);
      return;
    }
    if (
      expandedItemId &&
      !items.some((item) => item.id === expandedItemId)
    ) {
      setExpandedItemId(null);
    }
  }, [expandedItemId, items]);

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
  const rowTitle = paused
    ? "Queue paused"
    : activeItem
      ? "Queue"
      : "Queued";
  const rowDetail = previewItem
    ? `${STATUS_LABELS[previewItem.status]} · ${queuePromptPreview(previewItem.prompt)}`
    : countLabel;

  return (
    <div className="prompt-queue-status-row">
      <button
        ref={toggleRef}
        className="prompt-queue-status-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="prompt-queue-popover"
        onClick={() => setOpen((current) => !current)}
      >
        <ListTodo size={15} aria-hidden="true" />
        <strong>{rowTitle}</strong>
        <span className="prompt-queue-count">{countLabel}</span>
        <span className="prompt-queue-status-preview">{rowDetail}</span>
        {open ? (
          <ChevronDown size={15} aria-hidden="true" />
        ) : (
          <ChevronUp size={15} aria-hidden="true" />
        )}
      </button>
      {paused ? (
        <QueueIconButton
          label="Resume queue"
          onClick={onResume}
          disabled={actionPendingItemId !== null}
        >
          <Play size={15} aria-hidden="true" />
        </QueueIconButton>
      ) : null}
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
          {paused ? (
            <div className="prompt-queue-paused-notice" role="status">
              <AlertCircle size={15} aria-hidden="true" />
              <span>Queue processing is paused.</span>
              <QueueIconButton
                label="Resume queue"
                onClick={onResume}
                disabled={actionPendingItemId !== null}
              >
                <Play size={15} aria-hidden="true" />
              </QueueIconButton>
            </div>
          ) : null}
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
              <Virtuoso
                className="prompt-queue-list"
                data={items}
                computeItemKey={(_, item) => item.id}
                increaseViewportBy={180}
                itemContent={(_, item) => (
                  <SortableQueueItem
                    item={item}
                    expanded={expandedItemId === item.id}
                    pending={actionPendingItemId === item.id}
                    onToggleExpanded={() =>
                      setExpandedItemId((current) =>
                        current === item.id ? null : item.id,
                      )
                    }
                    onEdit={() => onEdit(item)}
                    onRemove={() => onRemove(item)}
                    onRetry={() => onRetry(item)}
                    onSkip={() => onSkip(item)}
                    onSendNow={() => onSendNow(item)}
                  />
                )}
              />
            </SortableContext>
          </DndContext>
        </div>
      ) : null}
    </div>
  );
});

type SortableQueueItemProps = {
  item: PromptQueueItem;
  expanded: boolean;
  pending: boolean;
  onToggleExpanded: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onRetry: () => void;
  onSkip: () => void;
  onSendNow: () => void;
};

const SortableQueueItem = memo(function SortableQueueItem({
  item,
  expanded,
  pending,
  onToggleExpanded,
  onEdit,
  onRemove,
  onRetry,
  onSkip,
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
    settings.model ?? (settings.useOss ? settings.ossProvider : "Default model"),
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
  const canSkip = ["queued", "scheduled-next", "failed", "stale"].includes(
    item.status,
  );
  const canSendNow = ["queued", "scheduled-next", "failed", "stale"].includes(
    item.status,
  );

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
          title="Reorder prompt"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={15} aria-hidden="true" />
        </button>
        <button
          className="prompt-queue-item-disclosure"
          type="button"
          aria-expanded={expanded}
          onClick={onToggleExpanded}
        >
          <span className="prompt-queue-item-copy">
            <span>{queuePromptPreview(item.prompt, 110)}</span>
            <small>{settingsSummary}</small>
          </span>
          <span
            className="prompt-queue-item-status"
            data-status={item.status}
          >
            {pending ? (
              <LoaderCircle
                className="prompt-queue-spinner"
                size={13}
                aria-hidden="true"
              />
            ) : null}
            {STATUS_LABELS[item.status]}
          </span>
          {expanded ? (
            <ChevronUp size={15} aria-hidden="true" />
          ) : (
            <ChevronDown size={15} aria-hidden="true" />
          )}
        </button>
      </div>
      {expanded ? (
        <div className="prompt-queue-item-expanded">
          <p>{item.prompt}</p>
          {item.error ? (
            <div className="prompt-queue-item-error" role="alert">
              <AlertCircle size={14} aria-hidden="true" />
              <span>{item.error}</span>
            </div>
          ) : null}
          {item.staleReasons.length > 0 ? (
            <ul className="prompt-queue-stale-reasons">
              {item.staleReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          <div
            className="prompt-queue-item-actions"
            role="toolbar"
            aria-label="Queued prompt actions"
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
                onClick={onSendNow}
                disabled={pending}
                emphasis
              >
                <Send size={15} aria-hidden="true" />
              </QueueIconButton>
            ) : null}
            {canSkip ? (
              <QueueIconButton
                label="Skip queued prompt"
                onClick={onSkip}
                disabled={pending}
              >
                <SkipForward size={15} aria-hidden="true" />
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
      ) : null}
    </article>
  );
});

function QueueIconButton({
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
      className={`native-plan-icon-action prompt-queue-icon-action ${
        emphasis ? "implement" : ""
      } ${destructive ? "cancel" : ""}`}
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
