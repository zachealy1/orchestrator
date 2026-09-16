import type { LucideIcon } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { SettingsStatusBadge, type SettingsDetailStatus } from "./SettingsStatusPopover";

export function SettingsIconAction({
  icon: Icon,
  ariaLabel,
  tooltip,
  buttonRef,
  type = "button",
  danger = false,
  disabled = false,
  onActivate,
}: {
  icon: LucideIcon;
  ariaLabel: string;
  tooltip: string;
  buttonRef?: Ref<HTMLButtonElement>;
  type?: "button" | "submit";
  danger?: boolean;
  disabled?: boolean;
  onActivate?: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      className={`settings-icon-action${danger ? " danger" : ""}`}
      type={type}
      aria-label={ariaLabel}
      data-tooltip={tooltip}
      disabled={disabled}
      onClick={onActivate}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

export function SettingsDetailHeader({
  icon: Icon,
  title,
  status,
  statusContent,
}: {
  icon: LucideIcon;
  title: string;
  status?: SettingsDetailStatus;
  statusContent?: ReactNode;
}) {
  return (
    <div className="surface-header settings-detail-header">
      <div className="settings-detail-heading">
        <span className="settings-detail-header-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <div className="settings-detail-header-copy">
          <h2>{title}</h2>
        </div>
      </div>
      {statusContent ?? (status ? <SettingsStatusBadge {...status} /> : null)}
    </div>
  );
}
