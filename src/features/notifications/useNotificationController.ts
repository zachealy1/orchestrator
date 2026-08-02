import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type {
  AgentNotificationPermissionStatus,
  AgentNotificationPreferences,
  AgentNotificationTarget,
} from "../../lib/agentNotifications";
import type {
  AgentNotificationNavigationState,
  EditedPromptNotice,
  NotificationTranscriptFocusRequest,
  PendingAgentNotificationFocus,
  PendingApprovalAttention,
} from "./types";
import {
  readAgentNotificationPermissionStatus,
} from "../../codexClient";
import { persistAgentNotificationPreferences } from "../../lib/agentNotifications";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type NotificationController = {
  agentNotificationPreferences: AgentNotificationPreferences;
  setAgentNotificationPreferences: StateSetter<AgentNotificationPreferences>;
  agentNotificationPreferencesRef: MutableRefObject<AgentNotificationPreferences>;
  agentNotificationPermission: AgentNotificationPermissionStatus;
  setAgentNotificationPermission: StateSetter<AgentNotificationPermissionStatus>;
  agentNotificationPermissionRef: MutableRefObject<AgentNotificationPermissionStatus>;
  appFocusedRef: MutableRefObject<boolean>;
  appVisibleRef: MutableRefObject<boolean>;
  transcriptNotificationFocusRequest: NotificationTranscriptFocusRequest | null;
  setTranscriptNotificationFocusRequest: StateSetter<
    NotificationTranscriptFocusRequest | null
  >;
  setAgentNotificationNavigation: StateSetter<
    AgentNotificationNavigationState | null
  >;
  unroutedApprovals: PendingApprovalAttention[];
  setUnroutedApprovals: StateSetter<PendingApprovalAttention[]>;
  unroutedApprovalsRef: MutableRefObject<PendingApprovalAttention[]>;
  approvalSafetyWarning: string | null;
  setApprovalSafetyWarning: StateSetter<string | null>;
  editedPromptNotice: EditedPromptNotice | null;
  setEditedPromptNotice: StateSetter<EditedPromptNotice | null>;
  handledNotificationActivationKeysRef: MutableRefObject<Set<string>>;
  notificationActivationsInFlightRef: MutableRefObject<Set<string>>;
  pendingNotificationDeliveryKeysRef: MutableRefObject<Set<string>>;
  bootstrapCompleteRef: MutableRefObject<boolean>;
  pendingNotificationActivationRef: MutableRefObject<AgentNotificationTarget | null>;
  notificationFocusSequenceRef: MutableRefObject<number>;
  notificationNavigationSequenceRef: MutableRefObject<number>;
  pendingAgentNotificationFocusRef: MutableRefObject<PendingAgentNotificationFocus | null>;
  orphanApprovalResolutionLocksRef: MutableRefObject<Set<string>>;
  resolvedOrphanApprovalKeysRef: MutableRefObject<Set<string>>;
  userInputAutoResolutionTimersRef: MutableRefObject<Map<string, number>>;
  requestActionLocksRef: MutableRefObject<Set<string>>;
};

export function useNotificationController(
  initialPreferences: AgentNotificationPreferences,
): NotificationController {
  const [agentNotificationPreferences, setAgentNotificationPreferences] =
    useState(initialPreferences);
  const [agentNotificationPermission, setAgentNotificationPermission] =
    useState<AgentNotificationPermissionStatus>("unavailable");
  const [transcriptNotificationFocusRequest, setTranscriptNotificationFocusRequest] =
    useState<NotificationTranscriptFocusRequest | null>(null);
  const [, setAgentNotificationNavigation] =
    useState<AgentNotificationNavigationState | null>(null);
  const [unroutedApprovals, setUnroutedApprovals] = useState<
    PendingApprovalAttention[]
  >([]);
  const [approvalSafetyWarning, setApprovalSafetyWarning] =
    useState<string | null>(null);
  const [editedPromptNotice, setEditedPromptNotice] =
    useState<EditedPromptNotice | null>(null);

  const agentNotificationPreferencesRef = useRef(agentNotificationPreferences);
  const agentNotificationPermissionRef = useRef(agentNotificationPermission);
  const appFocusedRef = useRef(
    typeof document === "undefined" ? true : document.hasFocus(),
  );
  const appVisibleRef = useRef(
    typeof document === "undefined"
      ? true
      : document.visibilityState !== "hidden",
  );
  const unroutedApprovalsRef = useRef(unroutedApprovals);
  const handledNotificationActivationKeysRef = useRef(new Set<string>());
  const notificationActivationsInFlightRef = useRef(new Set<string>());
  const pendingNotificationDeliveryKeysRef = useRef(new Set<string>());
  const bootstrapCompleteRef = useRef(false);
  const pendingNotificationActivationRef =
    useRef<AgentNotificationTarget | null>(null);
  const notificationFocusSequenceRef = useRef(0);
  const notificationNavigationSequenceRef = useRef(0);
  const pendingAgentNotificationFocusRef =
    useRef<PendingAgentNotificationFocus | null>(null);
  const orphanApprovalResolutionLocksRef = useRef(new Set<string>());
  const resolvedOrphanApprovalKeysRef = useRef(new Set<string>());
  const userInputAutoResolutionTimersRef = useRef(new Map<string, number>());
  const requestActionLocksRef = useRef(new Set<string>());

  agentNotificationPreferencesRef.current = agentNotificationPreferences;
  agentNotificationPermissionRef.current = agentNotificationPermission;
  unroutedApprovalsRef.current = unroutedApprovals;

  useEffect(() => {
    persistAgentNotificationPreferences(agentNotificationPreferences);
  }, [agentNotificationPreferences]);

  useEffect(() => {
    let disposed = false;

    const refreshPermission = async () => {
      try {
        const permission = await readAgentNotificationPermissionStatus();
        if (!disposed) {
          agentNotificationPermissionRef.current = permission;
          setAgentNotificationPermission(permission);
        }
      } catch {
        if (!disposed) {
          agentNotificationPermissionRef.current = "unavailable";
          setAgentNotificationPermission("unavailable");
        }
      }
    };
    const handleFocus = () => {
      appFocusedRef.current = true;
      void refreshPermission();
    };
    const handleBlur = () => {
      appFocusedRef.current = false;
    };
    const handleVisibilityChange = () => {
      appVisibleRef.current = document.visibilityState !== "hidden";
      if (appVisibleRef.current) void refreshPermission();
    };

    appFocusedRef.current = document.hasFocus();
    appVisibleRef.current = document.visibilityState !== "hidden";
    void refreshPermission();
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposed = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(
    () => () => {
      userInputAutoResolutionTimersRef.current.forEach((timer) =>
        window.clearTimeout(timer),
      );
      userInputAutoResolutionTimersRef.current.clear();
    },
    [],
  );

  return {
    agentNotificationPreferences,
    setAgentNotificationPreferences,
    agentNotificationPreferencesRef,
    agentNotificationPermission,
    setAgentNotificationPermission,
    agentNotificationPermissionRef,
    appFocusedRef,
    appVisibleRef,
    transcriptNotificationFocusRequest,
    setTranscriptNotificationFocusRequest,
    setAgentNotificationNavigation,
    unroutedApprovals,
    setUnroutedApprovals,
    unroutedApprovalsRef,
    approvalSafetyWarning,
    setApprovalSafetyWarning,
    editedPromptNotice,
    setEditedPromptNotice,
    handledNotificationActivationKeysRef,
    notificationActivationsInFlightRef,
    pendingNotificationDeliveryKeysRef,
    bootstrapCompleteRef,
    pendingNotificationActivationRef,
    notificationFocusSequenceRef,
    notificationNavigationSequenceRef,
    pendingAgentNotificationFocusRef,
    orphanApprovalResolutionLocksRef,
    resolvedOrphanApprovalKeysRef,
    userInputAutoResolutionTimersRef,
    requestActionLocksRef,
  };
}
