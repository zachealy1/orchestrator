import { BarChart3, Files, Flag, GitBranch, MessagesSquare, Puzzle, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { applicationCommandAriaShortcut, formatApplicationCommandShortcut, type ApplicationCommandId } from "../shortcuts/applicationShortcuts";

export type ActivityDestination = "chats" | "files" | "priority" | "source-control" | "analytics" | "plugins" | "settings";
export type NavigationPage = "task" | "analytics" | "plugins" | "settings" | "source-control";

const destinations = [
  { id: "chats", label: "Chats", Icon: MessagesSquare, command: "sidebar-chats" },
  { id: "files", label: "Files", Icon: Files, command: "sidebar-files" },
  { id: "priority", label: "Priority", Icon: Flag, command: "sidebar-priority" },
  { id: "source-control", label: "Source control", Icon: GitBranch, command: "open-source-control" },
  { id: "analytics", label: "Analytics", Icon: BarChart3, command: "open-analytics" },
  { id: "plugins", label: "Plugins", Icon: Puzzle, command: "open-plugins" },
  { id: "settings", label: "Settings", Icon: Settings, command: "open-settings" },
] satisfies { id: ActivityDestination; label: string; Icon: typeof Files; command: ApplicationCommandId }[];

export function ActivityRail({ selected, panelOpen, priorityCount, onSelect, account }: {
  selected: ActivityDestination;
  panelOpen: boolean;
  priorityCount: number;
  onSelect: (destination: ActivityDestination) => void;
  account: ReactNode;
}) {
  function button(item: typeof destinations[number]) {
    const { id, label, Icon, command } = item;
    const isPanel = id === "chats" || id === "files" || id === "priority";
    const shortcut = formatApplicationCommandShortcut(command);
    return <button key={id} type="button" className={`activity-rail-button${selected === id ? " active" : ""}`}
      aria-label={label} aria-pressed={selected === id}
      aria-expanded={isPanel ? selected === id && panelOpen : undefined}
      aria-controls={isPanel ? "workspace-sidebar" : undefined}
      aria-keyshortcuts={applicationCommandAriaShortcut(command) ?? undefined}
      data-tooltip={`${label}${shortcut ? ` (${shortcut})` : ""}`}
      data-tooltip-placement="right" onClick={() => onSelect(id)}>
      <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
      {id === "priority" && priorityCount > 0 ? <span className="activity-rail-badge"
        aria-label={`${priorityCount} unread recently finished chats`}>{priorityCount > 99 ? "99+" : priorityCount}</span> : null}
    </button>;
  }
  return <aside className="activity-rail" aria-label="Activity bar" data-tauri-drag-region="false">
    <nav aria-label="Workspace navigation">{destinations.slice(0, 4).map(button)}</nav>
    <div className="activity-rail-divider" />
    <nav aria-label="Insights and integrations">{destinations.slice(4, 6).map(button)}</nav>
    <div className="activity-rail-bottom">{account}{button(destinations[6])}</div>
  </aside>;
}
