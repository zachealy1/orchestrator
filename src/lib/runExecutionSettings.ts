import type {
  CodexAccessMode,
  CodexProfileKey,
  ComposerContextFile,
  OssProvider,
  ResolvedRunExecutionSettings,
  RunExecutionSettings,
  SelectedComposerSkill,
} from "../types";

export const RUN_EXECUTION_SETTINGS_VERSION = 1;

type RunExecutionSettingsInput = Omit<RunExecutionSettings, "version">;

type LegacyRunSettingsRecord = {
  account_id: number | null;
  model: string | null;
  model_provider: string | null;
  sandbox: string;
  approval_policy: string;
  collaboration_mode: "plan" | "default" | null;
  run_intent: RunExecutionSettings["intent"];
};

export function createRunExecutionSettings(
  input: RunExecutionSettingsInput,
): RunExecutionSettings {
  return {
    version: RUN_EXECUTION_SETTINGS_VERSION,
    accountId: input.accountId,
    profileKey: input.profileKey,
    selectedBranch: input.selectedBranch,
    mode: input.mode,
    intent: input.intent,
    accessMode: input.accessMode,
    computerUseEnabled: input.computerUseEnabled,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    useOss: input.useOss,
    ossProvider: input.ossProvider,
    contextFiles: input.contextFiles.map((file) => ({ ...file })),
    selectedSkills: input.selectedSkills.map((skill) => ({ ...skill })),
    goalMode: input.goalMode,
  };
}

export function serializeRunExecutionSettings(settings: RunExecutionSettings) {
  return JSON.stringify(settings);
}

export function parseRunExecutionSettings(
  value: string | null | undefined,
): RunExecutionSettings | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    return readRunExecutionSettings(parsed);
  } catch {
    return null;
  }
}

export function resolveStoredRunExecutionSettings(
  value: string | null | undefined,
  legacy: LegacyRunSettingsRecord,
): ResolvedRunExecutionSettings {
  const captured = parseRunExecutionSettings(value);
  if (captured) {
    return {
      settings: captured,
      source: "captured",
    };
  }

  const accountId =
    typeof legacy.account_id === "number" && Number.isSafeInteger(legacy.account_id)
      ? legacy.account_id
      : 0;
  const useOss = legacy.model_provider === "oss";
  const intent = isRunIntent(legacy.run_intent) ? legacy.run_intent : "normal";

  return {
    settings: createRunExecutionSettings({
      accountId,
      profileKey: `account:${accountId}` as CodexProfileKey,
      selectedBranch: null,
      mode:
        legacy.collaboration_mode === "plan" ||
        intent === "plan" ||
        intent === "plan-revision"
          ? "plan"
          : "run",
      intent,
      accessMode:
        legacy.sandbox === "danger-full-access" ||
        legacy.approval_policy === "never"
          ? "full-access"
          : "ask-for-approval",
      computerUseEnabled: false,
      model: useOss ? null : normalizeOptionalString(legacy.model),
      reasoningEffort: null,
      useOss,
      ossProvider: "ollama",
      contextFiles: [],
      selectedSkills: [],
      goalMode: false,
    }),
    source: "legacy",
  };
}

function readRunExecutionSettings(value: unknown): RunExecutionSettings | null {
  if (!isRecord(value) || value.version !== RUN_EXECUTION_SETTINGS_VERSION) {
    return null;
  }
  if (
    !isSafeAccountId(value.accountId) ||
    !isProfileKeyForAccount(value.profileKey, value.accountId) ||
    !isOptionalString(value.selectedBranch) ||
    !isRunMode(value.mode) ||
    !isRunIntent(value.intent) ||
    !isAccessMode(value.accessMode) ||
    typeof value.computerUseEnabled !== "boolean" ||
    !isOptionalString(value.model) ||
    !isOptionalString(value.reasoningEffort) ||
    typeof value.useOss !== "boolean" ||
    !isOssProvider(value.ossProvider) ||
    !Array.isArray(value.contextFiles) ||
    !Array.isArray(value.selectedSkills) ||
    typeof value.goalMode !== "boolean"
  ) {
    return null;
  }

  const contextFiles = value.contextFiles
    .map(readContextFile)
    .filter((file): file is ComposerContextFile => file !== null);
  const selectedSkills = value.selectedSkills
    .map(readSelectedSkill)
    .filter((skill): skill is SelectedComposerSkill => skill !== null);
  if (
    contextFiles.length !== value.contextFiles.length ||
    selectedSkills.length !== value.selectedSkills.length
  ) {
    return null;
  }

  return createRunExecutionSettings({
    accountId: value.accountId,
    profileKey: value.profileKey,
    selectedBranch: normalizeOptionalString(value.selectedBranch),
    mode: value.mode,
    intent: value.intent,
    accessMode: value.accessMode,
    computerUseEnabled: value.computerUseEnabled,
    model: normalizeOptionalString(value.model),
    reasoningEffort: normalizeOptionalString(value.reasoningEffort),
    useOss: value.useOss,
    ossProvider: value.ossProvider,
    contextFiles,
    selectedSkills,
    goalMode: value.goalMode,
  });
}

function readContextFile(value: unknown): ComposerContextFile | null {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    value.path.trim().length === 0 ||
    typeof value.name !== "string" ||
    value.name.trim().length === 0 ||
    !isContextFileSource(value.source) ||
    !isOptionalString(value.relativePath) ||
    !isContextFileStatus(value.status) ||
    !isOptionalString(value.error)
  ) {
    return null;
  }

  return {
    path: value.path,
    name: value.name,
    source: value.source,
    ...(typeof value.relativePath === "string"
      ? { relativePath: value.relativePath }
      : {}),
    ...(value.status ? { status: value.status } : {}),
    ...(typeof value.error === "string" || value.error === null
      ? { error: value.error }
      : {}),
  };
}

function readSelectedSkill(value: unknown): SelectedComposerSkill | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id.trim().length === 0 ||
    typeof value.name !== "string" ||
    value.name.trim().length === 0 ||
    !(typeof value.description === "string" || value.description === null)
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    description: value.description,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeAccountId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isProfileKeyForAccount(
  value: unknown,
  accountId: number,
): value is CodexProfileKey {
  return value === "default"
    ? accountId === 0
    : value === `account:${accountId}`;
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || typeof value === "string";
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isRunMode(value: unknown): value is RunExecutionSettings["mode"] {
  return value === "plan" || value === "run";
}

function isRunIntent(value: unknown): value is RunExecutionSettings["intent"] {
  return (
    value === "normal" ||
    value === "plan" ||
    value === "plan-revision" ||
    value === "plan-implementation"
  );
}

function isAccessMode(value: unknown): value is CodexAccessMode {
  return value === "ask-for-approval" || value === "full-access";
}

function isOssProvider(value: unknown): value is OssProvider {
  return value === "ollama" || value === "lmstudio";
}

function isContextFileSource(
  value: unknown,
): value is ComposerContextFile["source"] {
  return value === "picker" || value === "search" || value === "explorer";
}

function isContextFileStatus(
  value: unknown,
): value is ComposerContextFile["status"] | undefined {
  return value === undefined || value === "ready" || value === "error";
}
