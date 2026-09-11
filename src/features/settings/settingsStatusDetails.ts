import {
  Accessibility,
  ChevronRight,
  ExternalLink,
  GitPullRequest,
  LogIn,
  RefreshCw,
  ScreenShare,
} from "lucide-react";
import type { AgentNotificationPermissionStatus } from "../../lib/agentNotifications";
import type { BrowserReadiness } from "../browser/types";
import type { DesktopRuntimeStatus } from "../interaction/types";
import type { GithubConnectionStatus } from "../github/api";
import type {
  SettingsDetailStatus,
  SettingsStatusAction,
  SettingsStatusDetails,
} from "./SettingsStatusPopover";

export function browserStatusDetails(
  readiness: BrowserReadiness,
  checking: boolean,
  openPlugins: () => void,
  refresh: () => void,
): {
  status: SettingsDetailStatus;
  details: SettingsStatusDetails | null;
} {
  if (checking)
    return { status: { label: "Checking", tone: "pending" }, details: null };
  if (readiness.available)
    return { status: { label: "Available", tone: "positive" }, details: null };
  const pluginMissing = !readiness.pluginInstalled || !readiness.pluginEnabled;
  return {
    status: readiness.checkFailed
      ? { label: "Not checked", tone: "neutral" }
      : { label: "Unavailable", tone: "negative" },
    details: {
      title: readiness.checkFailed
        ? "Browser check failed"
        : "Browser unavailable",
      description:
        readiness.message ??
        (readiness.checkFailed
          ? "Could not check this account’s browser runtime. Check again to verify availability."
          : !readiness.pluginInstalled
            ? "Install the Browser plugin to continue."
            : !readiness.pluginEnabled
              ? "Enable the Browser plugin to continue."
              : "The browser runtime is unavailable."),
      actions: [
        pluginMissing
          ? {
              label: "Open Plugins",
              icon: ChevronRight,
              onActivate: openPlugins,
            }
          : { label: "Check again", icon: RefreshCw, onActivate: refresh },
      ],
    },
  };
}

export function computerUseStatusDetails(
  status: SettingsDetailStatus,
  pluginPresent: boolean,
  pluginReady: boolean,
  runtime: DesktopRuntimeStatus | null,
  actions: {
    openPlugins: () => void;
    openScreenRecordingSettings: () => void;
    openAccessibilitySettings: () => void;
    refreshComputerUseStatus: () => void;
  },
): SettingsStatusDetails | null {
  if (status.label !== "Unavailable" && status.label !== "Review access")
    return null;
  const missingScreen = runtime?.screenRecordingTrusted === false;
  const missingAccessibility = runtime?.accessibilityTrusted === false;
  const missingPermissions =
    pluginReady && (missingScreen || missingAccessibility);
  const needsReview =
    pluginReady &&
    runtime?.available === true &&
    runtime.serviceCompatible === true &&
    !missingPermissions &&
    (runtime.screenRecordingTrusted !== true ||
      runtime.accessibilityTrusted !== true);
  const recovery: SettingsStatusAction[] = [];
  if (!pluginReady) {
    recovery.push({
      label: "Open Plugins",
      icon: ChevronRight,
      onActivate: actions.openPlugins,
    });
  } else {
    if (
      missingScreen ||
      (needsReview && runtime?.screenRecordingTrusted !== true)
    ) {
      recovery.push({
        label: "Screen Recording",
        ariaLabel: "Open Screen Recording settings",
        icon: ScreenShare,
        permission: missingScreen ? "required" : "unverified",
        onActivate: actions.openScreenRecordingSettings,
      });
    }
    if (
      missingAccessibility ||
      (needsReview && runtime?.accessibilityTrusted !== true)
    ) {
      recovery.push({
        label: "Accessibility",
        ariaLabel: "Open Accessibility settings",
        icon: Accessibility,
        permission: missingAccessibility ? "required" : "unverified",
        onActivate: actions.openAccessibilitySettings,
      });
    }
    recovery.push({
      label: "Check again",
      icon: RefreshCw,
      onActivate: actions.refreshComputerUseStatus,
    });
  }
  return {
    title:
      status.label === "Unavailable"
        ? "Computer Use unavailable"
        : "Computer Use access not verified",
    description: !pluginReady
      ? pluginPresent
        ? "Enable the Computer Use plugin to continue."
        : "Install the Computer Use plugin to continue."
      : runtime?.message ||
        (missingPermissions
          ? missingScreen && missingAccessibility
            ? "Grant both permissions to continue."
            : "Grant the required permission to continue."
          : needsReview
            ? "Computer Use verifies access when it starts. Check any permissions that are not yet verified."
            : "Computer Use is not ready on this Mac."),
    actions: recovery,
  };
}

export function githubStatusDetails(
  connection: GithubConnectionStatus | null,
  pending: boolean,
  connect: () => void,
): {
  status: SettingsDetailStatus;
  details: SettingsStatusDetails | null;
} {
  if (pending)
    return { status: { label: "Connecting", tone: "pending" }, details: null };
  if (connection?.connected)
    return { status: { label: "Connected", tone: "positive" }, details: null };
  const unavailable = connection?.available === false;
  const reconnect = connection?.status === "reconnect_required";
  if (!unavailable && !reconnect)
    return {
      status: { label: "Disconnected", tone: "neutral" },
      details: null,
    };
  return {
    status: {
      label: unavailable ? "Unavailable" : "Reconnect",
      tone: "negative",
    },
    details: {
      title: unavailable
        ? "GitHub unavailable"
        : "GitHub reconnection required",
      description:
        connection?.message ??
        (unavailable
          ? "The bundled GitHub CLI runtime is unavailable."
          : "Reconnect GitHub to restore access."),
      actions: unavailable
        ? []
        : [
            {
              label: "Reconnect GitHub",
              icon: GitPullRequest,
              onActivate: connect,
            },
          ],
    },
  };
}

export function accountStatusDetails(
  label: string,
  error: string | null,
  retry?: { onActivate: () => void; disabled: boolean },
): SettingsStatusDetails | null {
  return error
    ? {
        title: `${label} error`,
        description: error,
        actions: retry ? [{ label: "Retry", icon: LogIn, ...retry }] : [],
      }
    : null;
}

export function notificationStatusDetails(
  permission: AgentNotificationPermissionStatus,
  openSettings: () => void,
): SettingsStatusDetails | null {
  if (permission === "denied")
    return {
      title: "Notifications denied",
      description:
        "Notification permission is denied. Allow Orchestrator notifications in macOS System Settings to receive agent alerts.",
      actions: [
        {
          label: "Open System Settings",
          icon: ExternalLink,
          onActivate: openSettings,
        },
      ],
    };
  if (permission === "unavailable")
    return {
      title: "Notifications unavailable",
      description:
        "System notifications are unavailable in this environment. Your alert preferences are saved and will apply when notifications are available.",
    };
  return null;
}
