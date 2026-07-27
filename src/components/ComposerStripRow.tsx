import {
  memo,
  type AriaRole,
  type FocusEventHandler,
  type MouseEventHandler,
  type ReactNode,
  type Ref,
} from "react";

export type ComposerStripTone =
  | "neutral"
  | "active"
  | "muted"
  | "attention"
  | "danger"
  | "success";

type InteractiveContent = {
  buttonRef?: Ref<HTMLButtonElement>;
  label?: string;
  expanded?: boolean;
  controls?: string;
  onClick: () => void;
};

type Props = {
  className?: string;
  state?: string;
  tone?: ComposerStripTone;
  tooltipVisible?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  tabIndex?: number;
  onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: MouseEventHandler<HTMLDivElement>;
  onFocus?: FocusEventHandler<HTMLDivElement>;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  contentRole?: AriaRole;
  contentAriaLive?: "off" | "assertive" | "polite";
  contentAriaAtomic?: boolean;
  icon: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  descriptionTitle?: string;
  descriptionAriaLabel?: string;
  status?: ReactNode;
  statusTitle?: string;
  statusAriaLive?: "off" | "assertive" | "polite";
  trailing?: ReactNode;
  interactive?: InteractiveContent;
  children?: ReactNode;
};

export const ComposerStripRow = memo(function ComposerStripRow({
  className,
  state,
  tone = "neutral",
  tooltipVisible,
  ariaLabel,
  ariaDescribedBy,
  tabIndex,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  contentRole,
  contentAriaLive,
  contentAriaAtomic,
  icon,
  title,
  meta,
  description,
  descriptionTitle,
  descriptionAriaLabel,
  status,
  statusTitle,
  statusAriaLive,
  trailing,
  interactive,
  children,
}: Props) {
  const content = (
    <>
      <span className="composer-strip-icon">{icon}</span>
      <strong className="composer-strip-title">{title}</strong>
      {meta !== undefined && meta !== null ? (
        <span className="composer-strip-meta">{meta}</span>
      ) : null}
      {description !== undefined && description !== null ? (
        <span
          className="composer-strip-description"
          title={descriptionTitle}
          aria-label={descriptionAriaLabel}
        >
          {description}
        </span>
      ) : null}
      {status !== undefined && status !== null ? (
        <span
          className="composer-strip-state"
          title={statusTitle}
          aria-live={statusAriaLive}
        >
          {status}
        </span>
      ) : null}
      {trailing !== undefined && trailing !== null ? (
        <span className="composer-strip-trailing">{trailing}</span>
      ) : null}
    </>
  );

  return (
    <div
      className={`composer-strip-row${className ? ` ${className}` : ""}`}
      data-state={state}
      data-tone={tone}
      data-tooltip-visible={
        tooltipVisible === undefined
          ? undefined
          : tooltipVisible
            ? "true"
            : "false"
      }
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      tabIndex={tabIndex}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {interactive ? (
        <button
          ref={interactive.buttonRef}
          className="composer-strip-content composer-strip-content-button"
          type="button"
          aria-label={interactive.label}
          aria-expanded={interactive.expanded}
          aria-controls={interactive.controls}
          onClick={interactive.onClick}
        >
          {content}
        </button>
      ) : (
        <div
          className="composer-strip-content"
          role={contentRole}
          aria-live={contentAriaLive}
          aria-atomic={contentAriaAtomic}
        >
          {content}
        </div>
      )}
      {children}
    </div>
  );
});
