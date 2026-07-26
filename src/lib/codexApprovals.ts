import type {
  CodexMessage,
  CodexProfileKey,
  RunInteractionMode,
} from "../types";

export type CommandApprovalDecision =
  | "accept"
  | "acceptForSession"
  | { acceptWithExecpolicyAmendment: { execpolicy_amendment: string[] } }
  | {
      applyNetworkPolicyAmendment: {
        network_policy_amendment: { host: string; action: "allow" | "deny" };
      };
    }
  | "decline"
  | "cancel";

export type FileChangeApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel";

export type LegacyApprovalDecision =
  | "approved"
  | "approved_for_session"
  | "denied"
  | "abort";

export type ApprovalResponse =
  | { decision: CommandApprovalDecision }
  | { decision: FileChangeApprovalDecision }
  | { decision: LegacyApprovalDecision }
  | {
      permissions: Record<string, unknown>;
      scope: "turn" | "session";
      strictAutoReview?: boolean;
    }
  | {
      action: "accept" | "decline" | "cancel";
      content: { decision: "allow" } | Record<string, never> | null;
      _meta: null;
    };

export type ApprovalChoice = {
  id: string;
  label: string;
  description: string;
  response: ApprovalResponse;
  tone: "approve" | "neutral" | "danger";
  broadScope: boolean;
};

export type ApprovalRequestKind =
  | "command"
  | "file-change"
  | "permissions"
  | "legacy-command"
  | "legacy-file-change"
  | "browser"
  | "browser-tool"
  | "unsupported";

export type BrowserApprovalRequest = {
  sessionToken: string;
  kind: "origin" | "sensitive-action";
  origin: string;
  action: string;
};

export type ActivePlaywrightToolCall = {
  itemId: string;
  threadId: string;
  turnId: string;
  tool: string;
  arguments: unknown;
};

export type BrowserToolApprovalParameter = {
  name: string;
  label: string;
  value: string;
};

export type BrowserToolApprovalRequest = {
  itemId: string;
  tool: string;
  displayName: string;
  description: string;
  parameters: BrowserToolApprovalParameter[];
};

export type ApprovalRequestStatus =
  | "pending"
  | "submitting"
  | "awaiting-resolution"
  | "error"
  | "stale";

export type CodexApprovalRequest = {
  key: string;
  requestToken: string;
  id: string | number;
  profileKey: CodexProfileKey;
  method: string;
  kind: ApprovalRequestKind;
  threadId: string | null;
  turnId: string | null;
  itemId: string | null;
  approvalId: string | null;
  interactionMode: RunInteractionMode;
  params: Record<string, unknown>;
  browserRequest?: BrowserApprovalRequest | null;
  browserToolRequest?: BrowserToolApprovalRequest | null;
  choices: ApprovalChoice[];
  status: ApprovalRequestStatus;
  selectedChoiceId: string | null;
  error: string | null;
  receivedAt: string;
};

export type ApprovalResolutionHandler = (
  request: CodexApprovalRequest,
  choice: ApprovalChoice,
) => void;

const SAFE_DENIAL_CHOICE_IDS = [
  "decline",
  "permissions-deny",
  "browser-deny",
  "browser-tool-deny",
  "denied",
  "cancel",
  "abort",
] as const;

export function findSafeApprovalDenialChoice(
  request: CodexApprovalRequest,
): ApprovalChoice | null {
  for (const choiceId of SAFE_DENIAL_CHOICE_IDS) {
    const choice = request.choices.find(
      (candidate) =>
        candidate.id === choiceId &&
        candidate.tone === "danger" &&
        !candidate.broadScope,
    );
    if (choice) return choice;
  }

  return (
    request.choices.find(
      (choice) => choice.tone === "danger" && !choice.broadScope,
    ) ?? null
  );
}

export type CodexFileSystemAccess = "read" | "write" | "deny";

export type CodexFileSystemPermissionEntry = {
  access: CodexFileSystemAccess;
  path: {
    type: "path";
    path: string;
  };
};

export type FileSystemPermissionValidation =
  | {
      status: "none";
      entries: [];
      permissions: null;
      error: null;
    }
  | {
      status: "valid";
      entries: CodexFileSystemPermissionEntry[];
      permissions: {
        fileSystem: {
          entries: CodexFileSystemPermissionEntry[];
        };
      };
      error: null;
    }
  | {
      status: "invalid";
      entries: [];
      permissions: null;
      error: string;
    };

type ParseApprovalInput = {
  message: CodexMessage;
  profileKey: CodexProfileKey;
  requestToken: string;
  interactionMode: RunInteractionMode;
  activePlaywrightToolCalls?: readonly ActivePlaywrightToolCall[];
};

const COMMAND_METHOD = "item/commandExecution/requestApproval";
const FILE_CHANGE_METHOD = "item/fileChange/requestApproval";
const PERMISSIONS_METHOD = "item/permissions/requestApproval";

export function parseApprovalRequest({
  message,
  profileKey,
  requestToken,
  interactionMode,
  activePlaywrightToolCalls = [],
}: ParseApprovalInput): CodexApprovalRequest | null {
  if (message.id === undefined || !message.method) {
    return null;
  }

  const params = readObject(message.params);
  const common = {
    key: approvalRequestKey(profileKey, requestToken),
    requestToken,
    id: message.id,
    profileKey,
    method: message.method,
    threadId:
      readString(params.threadId) ?? readString(params.conversationId),
    turnId: readString(params.turnId),
    itemId: readString(params.itemId) ?? readString(params.callId),
    approvalId: readString(params.approvalId),
    interactionMode,
    params,
    status: "pending" as const,
    selectedChoiceId: null,
    error: null,
    receivedAt: new Date().toISOString(),
  };

  switch (message.method) {
    case COMMAND_METHOD: {
      const fileSystemRequest = validateRequestedFileSystemPermissions(
        params.additionalPermissions,
      );
      return {
        ...common,
        kind: "command",
        choices: commandApprovalChoices(params, fileSystemRequest),
        error:
          fileSystemRequest.status === "invalid"
            ? fileSystemRequest.error
            : null,
      };
    }
    case FILE_CHANGE_METHOD:
      return {
        ...common,
        kind: "file-change",
        choices: fileChangeApprovalChoices(),
      };
    case PERMISSIONS_METHOD: {
      const fileSystemRequest = validateRequestedFileSystemPermissions(
        params.permissions,
      );
      return {
        ...common,
        kind: "permissions",
        choices: permissionsApprovalChoices(fileSystemRequest),
        error:
          fileSystemRequest.status === "invalid"
            ? fileSystemRequest.error
            : fileSystemRequest.status === "none"
              ? unsupportedPermissionRequestError()
              : null,
      };
    }
    case "execCommandApproval":
      return {
        ...common,
        kind: "legacy-command",
        choices: legacyApprovalChoices(true),
      };
    case "applyPatchApproval":
      return {
        ...common,
        kind: "legacy-file-change",
        choices: legacyApprovalChoices(true),
      };
    case "mcpServer/elicitation/request": {
      const browserRequest = parseBrowserApprovalRequest(params);
      if (browserRequest) {
        return {
          ...common,
          kind: "browser",
          browserRequest,
          choices: browserApprovalChoices(),
        };
      }
      const browserToolRequest = parseNativeBrowserToolApprovalRequest(
        params,
        activePlaywrightToolCalls,
      );
      if (browserToolRequest) {
        return {
          ...common,
          itemId: browserToolRequest.itemId,
          kind: "browser-tool",
          browserToolRequest,
          choices: browserToolApprovalChoices(),
        };
      }
      return {
        ...common,
        kind: "unsupported",
        choices: [],
        error:
          "This MCP elicitation did not match a validated active Playwright approval request.",
      };
    }
    default:
      return {
        ...common,
        kind: "unsupported",
        choices: [],
        error: `This Codex request type is not supported by this client: ${message.method}`,
      };
  }
}

function browserToolApprovalChoices(): ApprovalChoice[] {
  return [
    choice(
      "browser-tool-allow",
      "Allow once",
      "Allow this Playwright browser tool call once.",
      {
        action: "accept",
        content: {},
        _meta: null,
      },
      "approve",
      false,
    ),
    choice(
      "browser-tool-deny",
      "Deny",
      "Block this browser tool call and let Codex choose another action.",
      {
        action: "decline",
        content: null,
        _meta: null,
      },
      "danger",
      false,
    ),
  ];
}

function browserApprovalChoices(): ApprovalChoice[] {
  return [
    choice(
      "browser-allow",
      "Allow for this turn",
      "Allow this browser request for the current agent turn.",
      {
        action: "accept",
        content: { decision: "allow" },
        _meta: null,
      },
      "approve",
      false,
    ),
    choice(
      "browser-deny",
      "Deny",
      "Block this browser request and let Codex choose another action.",
      {
        action: "decline",
        content: null,
        _meta: null,
      },
      "danger",
      false,
    ),
  ];
}

function parseNativeBrowserToolApprovalRequest(
  params: Record<string, unknown>,
  activeToolCalls: readonly ActivePlaywrightToolCall[],
): BrowserToolApprovalRequest | null {
  if (params.serverName !== "playwright" || params.mode !== "form") {
    return null;
  }
  const meta = readObjectOrNull(params._meta);
  if (meta?.codex_approval_kind !== "mcp_tool_call") {
    return null;
  }
  if (!isEmptyObjectElicitationSchema(params.requestedSchema)) {
    return null;
  }
  if (!isSupportedApprovalPersistence(meta.persist)) {
    return null;
  }

  const threadId = readString(params.threadId);
  const turnId = readString(params.turnId);
  const toolParams = readObjectOrNull(meta.tool_params);
  if (!threadId || !turnId || !toolParams) {
    return null;
  }
  const canonicalParams = canonicalJson(toolParams);
  if (!canonicalParams) {
    return null;
  }

  const matchingCalls = activeToolCalls.filter(
    (call) =>
      call.threadId === threadId &&
      call.turnId === turnId &&
      canonicalJson(call.arguments) === canonicalParams,
  );
  if (matchingCalls.length !== 1) {
    return null;
  }
  const call = matchingCalls[0];
  if (
    !/^[a-zA-Z0-9_.:/-]{1,200}$/u.test(call.itemId) ||
    !/^[a-zA-Z0-9_.:/-]{1,160}$/u.test(call.tool)
  ) {
    return null;
  }

  const displayLabels = parseToolParameterDisplayLabels(
    meta.tool_params_display,
    toolParams,
  );
  if (displayLabels === null) {
    return null;
  }
  const description =
    readSafeDisplayText(meta.tool_description, 500) ??
    `Use the ${formatBrowserToolName(call.tool)} browser tool.`;

  return {
    itemId: call.itemId,
    tool: call.tool,
    displayName: formatBrowserToolName(call.tool),
    description,
    parameters: projectSafeBrowserToolParameters(toolParams, displayLabels),
  };
}

function parseBrowserApprovalRequest(
  params: Record<string, unknown>,
): BrowserApprovalRequest | null {
  if (
    params.serverName !== "playwright" ||
    params.mode !== "form"
  ) {
    return null;
  }
  const meta = readObjectOrNull(params._meta);
  const browser = readObjectOrNull(meta?.["orchestrator/browser-approval"]);
  if (
    browser?.version !== 1 ||
    (browser.kind !== "origin" && browser.kind !== "sensitive-action")
  ) {
    return null;
  }
  const sessionToken = readString(browser.sessionToken);
  const origin = readString(browser.origin);
  const action = readString(browser.action);
  if (
    !sessionToken ||
    !/^[a-f0-9]{32}$/u.test(sessionToken) ||
    !origin ||
    !action ||
    action.length > 160 ||
    /[\u0000-\u001f\u007f]/u.test(action)
  ) {
    return null;
  }
  try {
    const url = new URL(origin);
    if (
      !["http:", "https:", "ws:", "wss:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.origin !== origin
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return {
    sessionToken,
    kind: browser.kind,
    origin,
    action,
  };
}

function isEmptyObjectElicitationSchema(value: unknown) {
  const schema = readObjectOrNull(value);
  if (!schema || schema.type !== "object") return false;
  const properties = readObjectOrNull(schema.properties);
  if (!properties || Object.keys(properties).length > 0) return false;
  const required = schema.required;
  return (
    required === undefined ||
    (Array.isArray(required) && required.length === 0)
  );
}

function isSupportedApprovalPersistence(value: unknown) {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every((entry) => entry === "session" || entry === "always"))
  );
}

function canonicalJson(value: unknown): string | null {
  try {
    const normalized = normalizeJson(value, 0);
    if (normalized === INVALID_JSON) return null;
    const serialized = JSON.stringify(normalized);
    return serialized.length <= 32_768 ? serialized : null;
  } catch {
    return null;
  }
}

const INVALID_JSON = Symbol("invalid-json");

function normalizeJson(
  value: unknown,
  depth: number,
): unknown | typeof INVALID_JSON {
  if (depth > 20) return INVALID_JSON;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : INVALID_JSON;
  }
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => normalizeJson(entry, depth + 1));
    return normalized.includes(INVALID_JSON) ? INVALID_JSON : normalized;
  }
  const record = readObjectOrNull(value);
  if (!record) return INVALID_JSON;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const entry = normalizeJson(record[key], depth + 1);
    if (entry === INVALID_JSON) return INVALID_JSON;
    normalized[key] = entry;
  }
  return normalized;
}

function parseToolParameterDisplayLabels(
  value: unknown,
  toolParams: Record<string, unknown>,
): Map<string, string> | null {
  if (value === undefined) return new Map();
  if (!Array.isArray(value) || value.length > 24) return null;
  const labels = new Map<string, string>();
  for (const entry of value) {
    const record = readObjectOrNull(entry);
    const name = readSafeDisplayText(record?.name, 80);
    const label = readSafeDisplayText(record?.display_name, 120);
    if (
      !record ||
      !name ||
      !label ||
      !Object.prototype.hasOwnProperty.call(toolParams, name)
    ) {
      return null;
    }
    labels.set(name, label);
  }
  return labels;
}

const SAFE_BROWSER_TOOL_PARAMETERS = new Set([
  "action",
  "button",
  "index",
  "key",
  "modifiers",
  "origin",
  "tabId",
  "timeout",
  "url",
]);

function projectSafeBrowserToolParameters(
  toolParams: Record<string, unknown>,
  labels: Map<string, string>,
): BrowserToolApprovalParameter[] {
  const parameters: BrowserToolApprovalParameter[] = [];
  for (const [name, rawValue] of Object.entries(toolParams)) {
    if (!SAFE_BROWSER_TOOL_PARAMETERS.has(name)) continue;
    const value =
      name === "url" || name === "origin"
        ? sanitizeBrowserUrl(rawValue)
        : formatSafeBrowserParameterValue(rawValue);
    if (!value) continue;
    parameters.push({
      name,
      label: labels.get(name) ?? formatBrowserToolName(name),
      value,
    });
  }
  return parameters;
}

function sanitizeBrowserUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) {
      return null;
    }
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return readSafeDisplayText(url.toString(), 500);
  } catch {
    return null;
  }
}

function formatSafeBrowserParameterValue(value: unknown): string | null {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return readSafeDisplayText(String(value), 240);
  }
  if (
    Array.isArray(value) &&
    value.length <= 12 &&
    value.every(
      (entry) =>
        typeof entry === "string" ||
        typeof entry === "number" ||
        typeof entry === "boolean",
    )
  ) {
    return readSafeDisplayText(value.map(String).join(", "), 240);
  }
  return null;
}

function readSafeDisplayText(value: unknown, maxLength: number) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  ) {
    return null;
  }
  return value;
}

function formatBrowserToolName(value: string) {
  return value
    .replace(/^browser[_-]?/u, "Browser ")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase())
    .trim();
}

export function approvalRequestKey(
  profileKey: CodexProfileKey,
  requestToken: string,
) {
  return `${profileKey}:${requestToken}`;
}

function commandApprovalChoices(
  params: Record<string, unknown>,
  fileSystemRequest: FileSystemPermissionValidation,
) {
  const supplied = params.availableDecisions;
  let decisions: CommandApprovalDecision[];

  if (Array.isArray(supplied)) {
    decisions = supplied.filter(isCommandApprovalDecision);
  } else {
    decisions = fallbackCommandDecisions(params);
  }

  if (fileSystemRequest.status !== "none") {
    decisions =
      fileSystemRequest.status === "valid"
        ? decisions.filter(isTurnScopedCommandDecision)
        : decisions.filter(isCommandDenialDecision);
  }

  return decisions.map((decision) => commandDecisionChoice(decision, params));
}

function fallbackCommandDecisions(params: Record<string, unknown>) {
  const networkContext = readObjectOrNull(params.networkApprovalContext);
  const additionalPermissions = readObjectOrNull(params.additionalPermissions);
  const proposedExecpolicyAmendment = readStringArray(
    params.proposedExecpolicyAmendment,
  );
  const proposedNetworkAmendments = readArray(
    params.proposedNetworkPolicyAmendments,
  )
    .map(readNetworkAmendment)
    .filter((value): value is { host: string; action: "allow" | "deny" } =>
      Boolean(value),
    );

  if (networkContext) {
    const decisions: CommandApprovalDecision[] = ["accept", "acceptForSession"];
    const allowAmendment = proposedNetworkAmendments.find(
      (amendment) => amendment.action === "allow",
    );
    if (allowAmendment) {
      decisions.push({
        applyNetworkPolicyAmendment: {
          network_policy_amendment: allowAmendment,
        },
      });
    }
    decisions.push("cancel");
    return decisions;
  }

  if (additionalPermissions) {
    return ["accept", "cancel"] satisfies CommandApprovalDecision[];
  }

  const decisions: CommandApprovalDecision[] = ["accept"];
  if (proposedExecpolicyAmendment) {
    decisions.push({
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: proposedExecpolicyAmendment,
      },
    });
  }
  decisions.push("cancel");
  return decisions;
}

function commandDecisionChoice(
  decision: CommandApprovalDecision,
  params: Record<string, unknown>,
): ApprovalChoice {
  const networkContext = readObjectOrNull(params.networkApprovalContext);
  const additionalPermissions = readObjectOrNull(params.additionalPermissions);
  const command = readString(params.command);
  if (decision === "accept") {
    return choice(
      "accept",
      "Approve once",
      networkContext
        ? "Allow only this network request."
        : "Run only this requested command.",
      { decision },
      "approve",
      false,
    );
  }
  if (decision === "acceptForSession") {
    return choice(
      "acceptForSession",
      "Approve for session",
      networkContext
        ? `Allow ${readString(networkContext.host) ?? "this host"} for this Codex conversation.`
        : additionalPermissions
          ? "Allow the displayed permission scope for this Codex session."
          : command
            ? `Allow this command for the current Codex session: ${command}`
            : "Allow this native request for the current Codex session.",
      { decision },
      "approve",
      true,
    );
  }
  if (decision === "decline") {
    return choice(
      "decline",
      "Reject",
      "Continue the turn without running this command.",
      { decision },
      "danger",
      false,
    );
  }
  if (decision === "cancel") {
    return choice(
      "cancel",
      "Cancel operation",
      "Cancel this operation and let Codex choose a different action.",
      { decision },
      "danger",
      false,
    );
  }
  if ("acceptWithExecpolicyAmendment" in decision) {
    const prefix = decision.acceptWithExecpolicyAmendment.execpolicy_amendment.join(
      " ",
    );
    return choice(
      `execpolicy:${JSON.stringify(decision)}`,
      "Approve command rule",
      `Run this command and allow the proposed command prefix in the future: ${prefix}`,
      { decision },
      "approve",
      true,
    );
  }

  const amendment = decision.applyNetworkPolicyAmendment.network_policy_amendment;
  return choice(
    `network:${JSON.stringify(decision)}`,
    amendment.action === "allow" ? "Allow host in future" : "Block host in future",
    `${amendment.action === "allow" ? "Allow" : "Block"} ${amendment.host} through Codex's native network policy.`,
    { decision },
    amendment.action === "allow" ? "approve" : "danger",
    true,
  );
}

function fileChangeApprovalChoices(): ApprovalChoice[] {
  const decisions: FileChangeApprovalDecision[] = [
    "accept",
    "acceptForSession",
    "decline",
    "cancel",
  ];
  return decisions.map((decision) => {
    switch (decision) {
      case "accept":
        return choice(
          decision,
          "Approve once",
          "Apply only these proposed file changes.",
          { decision },
          "approve",
          false,
        );
      case "acceptForSession":
        return choice(
          decision,
          "Approve files for session",
          "Allow Codex's native session scope for these files.",
          { decision },
          "approve",
          true,
        );
      case "decline":
        return choice(
          decision,
          "Reject changes",
          "Continue without applying these changes.",
          { decision },
          "danger",
          false,
        );
      case "cancel":
        return choice(
          decision,
          "Cancel operation",
          "Cancel this edit operation.",
          { decision },
          "danger",
          false,
        );
    }
  });
}

function permissionsApprovalChoices(
  fileSystemRequest: FileSystemPermissionValidation,
) {
  const choices: ApprovalChoice[] = [];
  if (fileSystemRequest.status === "valid") {
    choices.push(
      choice(
        "permissions-turn",
        "Allow for this turn",
        "Allow only the displayed paths until this Codex turn ends.",
        { permissions: fileSystemRequest.permissions, scope: "turn" },
        "approve",
        false,
      ),
    );
  }
  choices.push(
    choice(
      "permissions-deny",
      "Deny access",
      "Continue without granting access outside the workspace.",
      { permissions: {}, scope: "turn" },
      "danger",
      false,
    ),
  );
  return choices;
}

function legacyApprovalChoices(includeSession: boolean) {
  const choices: ApprovalChoice[] = [
    choice(
      "approved",
      "Approve once",
      "Approve this legacy Codex request once.",
      { decision: "approved" },
      "approve",
      false,
    ),
  ];
  if (includeSession) {
    choices.push(
      choice(
        "approved_for_session",
        "Approve for session",
        "Approve using the native legacy session scope.",
        { decision: "approved_for_session" },
        "approve",
        true,
      ),
    );
  }
  choices.push(
    choice(
      "denied",
      "Reject",
      "Continue without approving this request.",
      { decision: "denied" },
      "danger",
      false,
    ),
    choice(
      "abort",
      "Cancel operation",
      "Abort this legacy operation.",
      { decision: "abort" },
      "danger",
      false,
    ),
  );
  return choices;
}

function choice(
  id: string,
  label: string,
  description: string,
  response: ApprovalResponse,
  tone: ApprovalChoice["tone"],
  broadScope: boolean,
): ApprovalChoice {
  return { id, label, description, response, tone, broadScope };
}

function isCommandApprovalDecision(value: unknown): value is CommandApprovalDecision {
  if (
    value === "accept" ||
    value === "acceptForSession" ||
    value === "decline" ||
    value === "cancel"
  ) {
    return true;
  }
  const object = readObjectOrNull(value);
  if (!object) return false;

  const exec = readObjectOrNull(object.acceptWithExecpolicyAmendment);
  if (exec && readStringArray(exec.execpolicy_amendment)) return true;

  const network = readObjectOrNull(object.applyNetworkPolicyAmendment);
  return Boolean(readNetworkAmendment(network?.network_policy_amendment));
}

function isTurnScopedCommandDecision(decision: CommandApprovalDecision) {
  return (
    decision === "accept" ||
    decision === "decline" ||
    decision === "cancel"
  );
}

function isCommandDenialDecision(decision: CommandApprovalDecision) {
  return decision === "decline" || decision === "cancel";
}

export function validateRequestedFileSystemPermissions(
  value: unknown,
): FileSystemPermissionValidation {
  const profile = readObjectOrNull(value);
  if (!profile || profile.fileSystem === null || profile.fileSystem === undefined) {
    return {
      status: "none",
      entries: [],
      permissions: null,
      error: null,
    };
  }

  const fileSystem = readObjectOrNull(profile.fileSystem);
  const rawEntries = fileSystem?.entries;
  if (!fileSystem || !Array.isArray(rawEntries) || rawEntries.length === 0) {
    return invalidFileSystemPermissionRequest(
      "Codex requested filesystem access in an unsupported format. Update Codex before granting access outside the workspace.",
    );
  }

  const entries: CodexFileSystemPermissionEntry[] = [];
  const seen = new Set<string>();
  for (const rawEntry of rawEntries) {
    const entry = readObjectOrNull(rawEntry);
    const access = entry?.access;
    const path = readObjectOrNull(entry?.path);
    const rawPath = readString(path?.path);
    if (
      (access !== "read" && access !== "write" && access !== "deny") ||
      path?.type !== "path" ||
      !rawPath ||
      !isSafeExactAbsolutePath(rawPath)
    ) {
      return invalidFileSystemPermissionRequest(
        "Codex requested a broad or malformed filesystem permission. Orchestrator only allows exact, absolute, non-root paths for the current turn.",
      );
    }

    const key = `${access}:${rawPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      access,
      path: {
        type: "path",
        path: rawPath,
      },
    });
  }

  if (!entries.some((entry) => entry.access === "read" || entry.access === "write")) {
    return invalidFileSystemPermissionRequest(
      "Codex did not request any grantable filesystem access.",
    );
  }

  return {
    status: "valid",
    entries,
    permissions: {
      fileSystem: {
        entries,
      },
    },
    error: null,
  };
}

function invalidFileSystemPermissionRequest(
  error: string,
): FileSystemPermissionValidation {
  return {
    status: "invalid",
    entries: [],
    permissions: null,
    error,
  };
}

function unsupportedPermissionRequestError() {
  return "Codex requested permissions that Orchestrator cannot safely grant. Update Codex for turn-scoped filesystem permission support.";
}

function isSafeExactAbsolutePath(value: string) {
  if (value.includes("\0") || hasParentTraversal(value)) return false;

  if (value.startsWith("/")) {
    return value.replace(/\/+$/u, "") !== "";
  }

  if (/^[A-Za-z]:[\\/]/u.test(value)) {
    return !/^[A-Za-z]:[\\/]*$/u.test(value);
  }

  if (value.startsWith("\\\\")) {
    const parts = value.split(/[\\/]+/u).filter(Boolean);
    return parts.length > 2;
  }

  return false;
}

function hasParentTraversal(value: string) {
  return value.split(/[\\/]+/u).some((part) => part === "..");
}

function readNetworkAmendment(value: unknown) {
  const amendment = readObjectOrNull(value);
  if (!amendment) return null;
  const host = readString(amendment.host);
  const action = amendment.action;
  if (!host || (action !== "allow" && action !== "deny")) return null;
  return { host, action };
}

function readObject(value: unknown): Record<string, unknown> {
  return readObjectOrNull(value) ?? {};
}

function readObjectOrNull(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return null;
  }
  return value as string[];
}
