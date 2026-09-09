import type { CodexAccessMode, CodexProfileKey } from "../features/codex/types";
import type { ComposerContextFile, SelectedComposerSkill } from "../features/composer/types";
import type { ResolvedRunExecutionSettings, RunExecutionSettings } from "../features/runs/types";

export const RUN_EXECUTION_SETTINGS_VERSION = 6;

const LEGACY_BROWSER_SKILL: SelectedComposerSkill = {
  id: "browser:control-in-app-browser",
  name: "browser:control-in-app-browser",
  description:
    "Control the isolated in-app Browser through the installed OpenAI Browser plugin.",
};

type RunExecutionSettingsInput = Omit<
  RunExecutionSettings,
  "version" | "selectedRepositoryPath"
> & {
  selectedRepositoryPath?: string | null;
};

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
    selectedRepositoryPath: input.selectedRepositoryPath ?? null,
    selectedBranch: input.selectedBranch,
    mode: input.mode,
    intent: input.intent,
    accessMode: input.accessMode,
    computerUseEnabled: input.computerUseEnabled,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
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

export function parseRunExecutionSettingsValue(
  value: unknown,
): RunExecutionSettings | null {
  return readRunExecutionSettings(value);
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
  const intent = isRunIntent(legacy.run_intent) ? legacy.run_intent : "normal";

  return {
    settings: createRunExecutionSettings({
      accountId,
      profileKey: `account:${accountId}` as CodexProfileKey,
      selectedRepositoryPath: null,
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
      model:
        legacy.model_provider === "oss"
          ? null
          : normalizeOptionalString(legacy.model),
      reasoningEffort: null,
      contextFiles: [],
      selectedSkills: [],
      goalMode: false,
    }),
    source: "legacy",
  };
}

function readRunExecutionSettings(value: unknown): RunExecutionSettings | null {
  if (
    !isRecord(value) ||
    (value.version !== 1 &&
      value.version !== 2 &&
      value.version !== 3 &&
      value.version !== 4 &&
      value.version !== 5 &&
      value.version !== 6)
  ) {
    return null;
  }
  if (
    !isSafeAccountId(value.accountId) ||
    !isProfileKeyForAccount(value.profileKey, value.accountId) ||
    (value.version >= 2 && !isOptionalString(value.selectedRepositoryPath)) ||
    !isOptionalString(value.selectedBranch) ||
    !isRunMode(value.mode) ||
    !isRunIntent(value.intent) ||
    !isAccessMode(value.accessMode) ||
    typeof value.computerUseEnabled !== "boolean" ||
    (value.version === 3 &&
      value.browserExecutionTarget !== "default-browser" &&
      value.browserExecutionTarget !== "isolated") ||
    !isOptionalString(value.model) ||
    !isOptionalString(value.reasoningEffort) ||
    !Array.isArray(value.contextFiles) ||
    !Array.isArray(value.selectedSkills) ||
    typeof value.goalMode !== "boolean"
  ) {
    return null;
  }

  const contextFiles = value.contextFiles
    .map(readContextFile)
    .filter((file): file is ComposerContextFile => file !== null);
  let selectedSkills = value.selectedSkills
    .map(readSelectedSkill)
    .filter((skill): skill is SelectedComposerSkill => skill !== null);
  if (
    contextFiles.length !== value.contextFiles.length ||
    selectedSkills.length !== value.selectedSkills.length
  ) {
    return null;
  }

  const legacyBrowserRequested =
    value.version <= 4 && value.computerUseEnabled === true;
  if (
    legacyBrowserRequested &&
    !selectedSkills.some((skill) =>
      `${skill.id} ${skill.name}`.toLocaleLowerCase().includes("control-in-app-browser"),
    )
  ) {
    selectedSkills = [...selectedSkills, LEGACY_BROWSER_SKILL];
  }

  return createRunExecutionSettings({
    accountId: value.accountId,
    profileKey: value.profileKey,
    selectedRepositoryPath:
      value.version >= 2
        ? normalizeOptionalString(value.selectedRepositoryPath)
        : null,
    selectedBranch: normalizeOptionalString(value.selectedBranch),
    mode: value.mode,
    intent: value.intent,
    accessMode: value.accessMode,
    computerUseEnabled:
      value.version >= 5 ? value.computerUseEnabled : false,
    model: normalizeOptionalString(value.model),
    reasoningEffort: normalizeOptionalString(value.reasoningEffort),
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
    !isOptionalString(value.canonicalPath) ||
    !isOptionalString(value.relativePath) ||
    !isContextFileMediaKind(value.mediaKind) ||
    !isOptionalString(value.mimeType) ||
    !isOptionalPositiveInteger(value.width) ||
    !isOptionalPositiveInteger(value.height) ||
    !isContextFileStatus(value.status) ||
    !isOptionalString(value.error)
  ) {
    return null;
  }

  return {
    path: value.path,
    name: value.name,
    source: value.source,
    ...(typeof value.canonicalPath === "string"
      ? { canonicalPath: value.canonicalPath }
      : {}),
    ...(typeof value.relativePath === "string"
      ? { relativePath: value.relativePath }
      : {}),
    ...(value.mediaKind === "file" || value.mediaKind === "image"
      ? { mediaKind: value.mediaKind }
      : {}),
    ...(typeof value.mimeType === "string" ? { mimeType: value.mimeType } : {}),
    ...(typeof value.width === "number" ? { width: value.width } : {}),
    ...(typeof value.height === "number" ? { height: value.height } : {}),
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
    ...(typeof value.path === "string" && value.path.trim() ? { path: value.path } : {}),
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

function isContextFileSource(
  value: unknown,
): value is ComposerContextFile["source"] {
  return value === "picker" || value === "search" || value === "explorer";
}

function isContextFileStatus(
  value: unknown,
): value is ComposerContextFile["status"] | undefined {
  return (
    value === undefined ||
    value === "loading" ||
    value === "ready" ||
    value === "error"
  );
}

function isContextFileMediaKind(
  value: unknown,
): value is ComposerContextFile["mediaKind"] | undefined {
  return value === undefined || value === "file" || value === "image";
}

function isOptionalPositiveInteger(value: unknown) {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
  );
}
