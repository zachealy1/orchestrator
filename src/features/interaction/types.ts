export type InteractionSurfaceKind = "browser" | "desktop";
export type InteractionGroundingKind =
  | "accessibility"
  | "dom"
  | "protocol"
  | "visual";

export type InteractionSessionState =
  | "provisioning"
  | "observing"
  | "awaiting-model"
  | "awaiting-confirmation"
  | "acting"
  | "verifying"
  | "recovering"
  | "paused"
  | "takeover"
  | "completed"
  | "failed"
  | "stopping"
  | "stopped";

export type InteractionConsequence =
  | "read-only"
  | "reversible"
  | "external-side-effect"
  | "sensitive"
  | "blocked";

export type InteractionPermissionDecision =
  | "allow-once"
  | "allow-always"
  | "deny";

export type InteractionActionResultStatus =
  | "applied"
  | "no_effect"
  | "uncertain"
  | "blocked"
  | "stale"
  | "failed";

export type InteractionProviderCapabilities = {
  semanticElements: boolean;
  screenshots: boolean;
  coordinateActions: boolean;
  tabs: boolean;
  windows: boolean;
  dialogs: boolean;
  downloads: boolean;
  uploads: boolean;
  clipboard: boolean;
  arbitraryCode: boolean;
};

export type InteractionSurface = {
  id: string;
  kind: InteractionSurfaceKind;
  provider: string;
  providerVersion: string | null;
  title: string;
  origin: string | null;
  bundleId: string | null;
  generation: number;
  capabilities: InteractionProviderCapabilities;
};

export type InteractionObservation = {
  id: string;
  sessionId: string;
  surfaceId: string;
  generation: number;
  observedAt: string;
  url: string | null;
  title: string | null;
  focusedElement: string | null;
  screenshotId: string | null;
  viewport: {
    width: number;
    height: number;
    scale: number;
  } | null;
  dialogKinds: string[];
  downloadCount: number;
  stateHash: string;
};

export type InteractionSemanticTarget = {
  kind: "semantic";
  grounding: Exclude<InteractionGroundingKind, "visual">;
  elementRef: string;
  role?: string | null;
  name?: string | null;
};

export type InteractionVisualTarget = {
  kind: "visual";
  grounding: "visual";
  screenshotId: string;
  x: number;
  y: number;
  viewport: {
    width: number;
    height: number;
    scale: number;
  };
};

export type InteractionSurfaceTarget = {
  kind: "surface";
  grounding: "protocol";
  surfaceId: string;
};

export type InteractionActionTarget =
  | InteractionSemanticTarget
  | InteractionVisualTarget
  | InteractionSurfaceTarget;

export type InteractionAction = {
  id: string;
  sessionId: string;
  observationId: string;
  surfaceId: string;
  generation: number;
  kind: string;
  argumentHash: string;
  target: InteractionActionTarget;
  expectedEffect: string;
  consequence: InteractionConsequence;
  idempotent: boolean;
  grounding: InteractionGroundingKind;
  retryCount: number;
};

export type InteractionActionEvidence = {
  kind:
    | "navigation"
    | "element-state"
    | "field-value"
    | "scroll-position"
    | "surface-focus"
    | "download"
    | "dialog"
    | "state-change";
  summary: string;
};

export type InteractionActionResult = {
  actionId: string;
  status: InteractionActionResultStatus;
  observationAfter: InteractionObservation | null;
  evidence: InteractionActionEvidence[];
  retryable: boolean;
  durationMs: number;
  errorCode: string | null;
};

export type InteractionStep = {
  sequence: number;
  action: InteractionAction;
  result: InteractionActionResult | null;
  fingerprint: string;
  startedAt: string;
  completedAt: string | null;
};

export type InteractionSession = {
  id: string;
  runId: number | null;
  threadId: string | null;
  turnId: string | null;
  state: InteractionSessionState;
  stateBeforePause: InteractionSessionState | null;
  currentSurfaceId: string | null;
  inputLease: InteractionSurfaceKind | null;
  providerVersions: Partial<Record<InteractionSurfaceKind, string>>;
  surfaces: Record<string, InteractionSurface>;
  observations: Record<string, InteractionObservation>;
  latestObservationId: string | null;
  steps: InteractionStep[];
  noProgressCount: number;
  recoveryCount: number;
  maxSteps: number;
  maxRetries: number;
  deadlineAt: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  errorCode: string | null;
  attentionReason: string | null;
};

export type InteractionPolicyDecision = {
  outcome: "allow" | "confirm" | "takeover" | "block";
  reason: string;
  confirmationKey: string | null;
};

export type InteractionPreferences = {
  computerUseEnabled: boolean;
};

export type DesktopRuntimeStatus = {
  available: boolean;
  message: string | null;
  version: string | null;
  serviceCompatible: boolean;
  accessibilityTrusted: boolean | null;
  screenRecordingTrusted: boolean | null;
};

export type ComputerUsePermissions = {
  accessibility: "granted" | "required" | "unavailable";
  screenRecording: "granted" | "required" | "unavailable";
};

export type ComputerUseConnectedControl = {
  id: string;
  name: string;
  description: string;
  connected: boolean;
  pluginId: string | null;
};

export type AlwaysAllowedApplication = {
  id: string;
  name: string;
  bundleId: string;
  approvedAt: string;
};
