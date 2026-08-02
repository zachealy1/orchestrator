import type { RunViewState } from "../../lib/codexEventReducer";
import { normalizeContextFileMedia } from "../../lib/imageAttachments";
import type { CollaborationMode } from "../../lib/nativePlanMode";
import { formatGitSummaryForStatus, type WorkspaceGitSummary } from "../workspaces/gitModel";
import type { Workspace } from "../workspaces/types";
import type { CodexAccountProfile } from "../accounts/types";
import type { CodexModel } from "../codex/types";
import type {
  CodexSkillSummary,
  ComposerContextFile,
  SelectedComposerSkill,
  SlashCommandItem,
} from "./types";
import { basename } from "../../shared/paths";
import { readObject } from "../../shared/valueReaders";

export const BUILTIN_SLASH_COMMANDS: SlashCommandItem[] = [
  { kind: "builtin", command: "plan", title: "Plan mode", description: "Turn on plan-first routing for this task" },
  { kind: "builtin", command: "goal", title: "Goal", description: "Keep Codex working toward a persistent objective" },
  { kind: "builtin", command: "reasoning", title: "Reasoning", description: "Choose the reasoning effort for the selected agent" },
  { kind: "builtin", command: "compact", title: "Compact", description: "Summarize the current thread context when available" },
  { kind: "builtin", command: "status", title: "Status", description: "Show workspace, account, model, token, and run metadata" },
  { kind: "builtin", command: "review", title: "Code review", description: "Prepare a review prompt for current git changes" },
  { kind: "builtin", command: "mcp", title: "MCP", description: "Show connected tools and server status when available" },
  { kind: "builtin", command: "init", title: "Init", description: "Prepare a prompt to create or update AGENTS.md" },
];

export function parseSavedDefaultCollaborationMode(
  value: string | null | undefined,
) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CollaborationMode>;
    const settings = readObject(parsed.settings);
    if (
      parsed.mode === "default" &&
      typeof settings.model === "string" &&
      (typeof settings.reasoning_effort === "string" ||
        settings.reasoning_effort === null) &&
      settings.developer_instructions === null
    ) {
      return parsed as CollaborationMode;
    }
  } catch {
    // Corrupt settings are rebuilt from the current model defaults.
  }
  return null;
}

export function buildSlashCommandResults(
  query: string,
  skills: CodexSkillSummary[],
): SlashCommandItem[] {
  const skillItems = skills.map((skill): SlashCommandItem => ({
    kind: "skill",
    skill,
    title: skill.name,
    description: skill.description ?? "Use this Codex skill for the next run",
  }));
  const normalizedQuery = query.trim().toLowerCase();
  return [...BUILTIN_SLASH_COMMANDS, ...skillItems]
    .filter((item) => {
      if (!normalizedQuery) return true;
      return `${item.title} ${item.description}`
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .slice(0, 24);
}

export function applyPromptDraft(current: string, draft: string) {
  const trimmed = current.trim();
  return trimmed ? `${trimmed}\n\n${draft}` : draft;
}

export function buildCodeReviewDraft(
  workspace: Workspace | null,
  branch: string | null,
  gitSummary: WorkspaceGitSummary,
) {
  const target = workspace?.label ?? "the selected repository";
  const branchLine = branch
    ? `Current branch: ${branch}.`
    : "Current branch: unknown.";
  const changeLine =
    gitSummary.total > 0
      ? `Review the ${gitSummary.total} current git change${gitSummary.total === 1 ? "" : "s"}.`
      : "Review the current working tree and confirm whether it is clean.";
  return [
    `Review ${target}.`,
    branchLine,
    changeLine,
    "",
    "Focus on bugs, behavioral regressions, security issues, and missing tests.",
    "Return prioritized findings first, with file and line references when available.",
    "Do not edit files unless I explicitly ask for fixes.",
  ].join("\n");
}

export function buildInitInstructionsDraft(workspace: Workspace | null) {
  const target = workspace?.label ?? "the selected repository";
  return [
    `Create or update AGENTS.md for ${target}.`,
    "",
    "Inspect the repository structure, scripts, tests, conventions, and existing documentation first.",
    "Write concise instructions that future Codex runs can follow for building, testing, linting, and reviewing this repo.",
    "Keep the file specific to this codebase and avoid generic filler.",
  ].join("\n");
}

export function formatReasoningEffort(effort: string) {
  return effort
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildComposerStatusMessage({
  workspace,
  branch,
  account,
  model,
  reasoningEffort,
  tokenEstimate,
  contextFiles,
  selectedSkills,
  gitSummary,
  runView,
}: {
  workspace: Workspace | null;
  branch: string | null;
  account: CodexAccountProfile | null;
  model: CodexModel | null;
  reasoningEffort: string | null;
  tokenEstimate: number;
  contextFiles: ComposerContextFile[];
  selectedSkills: SelectedComposerSkill[];
  gitSummary: WorkspaceGitSummary;
  runView: RunViewState;
}) {
  const parts = [
    workspace ? `Workspace ${workspace.label}` : "No workspace selected",
    branch ? `branch ${branch}` : "no branch",
    formatGitSummaryForStatus(gitSummary),
    account ? `account ${account.label}` : "no account",
    model ? `agent ${model.displayName || model.model}` : "no agent",
    reasoningEffort
      ? `reasoning ${formatReasoningEffort(reasoningEffort)}`
      : "default reasoning",
    `${tokenEstimate.toLocaleString()} tokens`,
    `${contextFiles.length} file${contextFiles.length === 1 ? "" : "s"}`,
    `${selectedSkills.length} skill${selectedSkills.length === 1 ? "" : "s"}`,
  ];
  if (runView.threadId) parts.push(`thread ${runView.threadId}`);
  if (runView.turnId) parts.push(`turn ${runView.turnId}`);
  return parts.join(" | ");
}

export function addPlanImplementationProgressInstructions(prompt: string) {
  return [
    prompt.trimEnd(),
    "",
    "Track this implementation with Codex's structured plan tool:",
    "- Before changing files, call `update_plan` with a concise checklist derived from the approved plan.",
    "- Keep exactly one step in progress while work is underway and update the checklist whenever execution advances.",
    "- Mark every completed step before sending the final response.",
    "- If the implementation genuinely has only one step, keep a single step rather than inventing extra work.",
  ].join("\n");
}

export function applySelectedSkillsToPrompt(
  prompt: string,
  selectedSkills: SelectedComposerSkill[],
) {
  if (selectedSkills.length === 0) return prompt;
  return [
    "Use these Codex skills if they are relevant to the task:",
    ...selectedSkills.map((skill) =>
      skill.description
        ? `- ${skill.name}: ${skill.description}`
        : `- ${skill.name}`,
    ),
    "",
    prompt,
  ].join("\n");
}

export function normalizeDialogSelection(selection: unknown) {
  if (Array.isArray(selection)) {
    return selection.filter((item): item is string => typeof item === "string");
  }
  return typeof selection === "string" ? [selection] : [];
}

export function contextFileFromPath(path: string): ComposerContextFile {
  return normalizeContextFileMedia({
    path,
    name: basename(path),
    source: "picker",
    status: "ready",
  });
}

export function mergeContextFiles(
  current: ComposerContextFile[],
  additions: ComposerContextFile[],
) {
  const existing = new Set(
    current.flatMap((file) =>
      file.canonicalPath ? [file.path, file.canonicalPath] : [file.path],
    ),
  );
  const merged = [...current];
  for (const file of additions) {
    if (
      !existing.has(file.path) &&
      (!file.canonicalPath || !existing.has(file.canonicalPath))
    ) {
      existing.add(file.path);
      if (file.canonicalPath) existing.add(file.canonicalPath);
      merged.push(
        normalizeContextFileMedia({ ...file, status: file.status ?? "ready" }),
      );
    }
  }
  return merged;
}

export function pruneMissingInlineContextFiles(
  files: ComposerContextFile[],
  prompt: string,
) {
  return files.filter(
    (file) => file.source !== "search" || prompt.includes(file.name),
  );
}
