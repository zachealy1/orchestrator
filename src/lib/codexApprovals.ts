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
      content: { decision: "allow" } | null;
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
  | "unsupported";

export type BrowserApprovalRequest = {
  sessionToken: string;
  kind: "origin" | "sensitive-action";
  origin: string;
  action: string;
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
};

const COMMAND_METHOD = "item/commandExecution/requestApproval";
const FILE_CHANGE_METHOD = "item/fileChange/requestApproval";
const PERMISSIONS_METHOD = "item/permissions/requestApproval";

export function parseApprovalRequest({
  message,
  profileKey,
  requestToken,
  interactionMode,
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
      if (!browserRequest) {
        return {
          ...common,
          kind: "unsupported",
          choices: [],
          error:
            "This MCP elicitation was not a valid Orchestrator browser approval request.",
        };
      }
      return {
        ...common,
        kind: "browser",
        browserRequest,
        choices: browserApprovalChoices(),
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
