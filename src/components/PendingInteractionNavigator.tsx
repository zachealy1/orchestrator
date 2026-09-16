import { memo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PendingInteractionNavigator = memo(function PendingInteractionNavigator({
  index,
  total,
  onPrevious,
  onNext,
  disabled = false,
}: {
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  disabled?: boolean;
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
        disabled={disabled || index === 0}
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
        disabled={disabled || index === total - 1}
        onClick={onNext}
      >
        <ChevronRight size={15} aria-hidden="true" />
      </button>
    </nav>
  );
});
