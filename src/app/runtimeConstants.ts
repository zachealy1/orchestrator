import type { WorkspaceGitFileStatus } from "../features/workspaces/types";
import type { CodexProfileKey } from "../features/codex/types";

export const DEFAULT_CONTEXT_WINDOW = 258_400;
export const GIT_STATUS_AUTO_REFRESH_INTERVAL_MS = 3000;
export const BACKGROUND_REFRESH_RETRY_MS = 500;
export const BACKGROUND_INTERACTION_GRACE_MS = 700;
export const HISTORY_CHAT_PAGE_SIZE = 20;
export const SHARED_TRANSCRIPT_SYNC_TIMEOUT_MS = 30_000;
export const HISTORY_CHAT_CACHE_LIMIT = 5;
export const HISTORY_CHAT_CACHE_SOURCE_CHARACTER_BUDGET = 2_000_000;
export const HISTORY_ACTIVITY_PAGE_SIZE = 50;
export const HISTORY_ACTIVITY_CACHE_LIMIT = 200;
export const HISTORY_VIRTUOSO_BASE_INDEX = 1_000_000;
export const AGENT_NOTIFICATION_FOCUS_TIMEOUT_MS = 5_000;
export const CODEX_LOGIN_TIMEOUT_MS = 10 * 60 * 1_000;
export const WEB_PREVIEW_PROBE_RETRY_DELAYS_MS = [
  0,
  250,
  750,
  1_500,
  2_500,
] as const;
export const RUN_NOTIFICATION_BINDING_TTL_MS = 30_000;
export const RUN_NOTIFICATION_BINDING_BUFFER_LIMIT = 100;
export const COMMIT_MESSAGE_GENERATION_ERROR =
  "Could not generate a commit message. Enter a message manually or try again.";
export const BUFFERABLE_RUN_NOTIFICATION_METHODS = new Set([
  "item/completed",
  "item/started",
  "thread/started",
  "thread/status/changed",
  "thread/tokenUsage/updated",
  "turn/completed",
  "turn/diff/updated",
  "turn/plan/updated",
  "turn/started",
]);
export const EMPTY_GIT_STATUS_BY_PATH = new Map<
  string,
  WorkspaceGitFileStatus
>();
export const DEFAULT_CODEX_PROFILE_KEY: CodexProfileKey = "default";
export const EXTERNAL_CODEX_SOURCE_KINDS = [
  "vscode",
  "appServer",
  "cli",
  "orchestrator",
];

export const TASK_QUOTES = [
  "You prompting me?",
  "You scoping this, or am I?",
  "Are you talking to the agent?",
  "You had me at clear requirements.",
  "To production and beyond.",
  "To plan mode and beyond.",
  "To clean context and beyond.",
  "To the repo and beyond.",
  "I am your planner.",
  "I am your context.",
  "No, I am your workflow.",
  "Search your feelings. You know it needs tests.",
  "The prompt is strong with this one.",
  "May the context be with you.",
  "Use the plan, Luke.",
  "This is the prompt you're looking for.",
  "The agents are standing by.",
  "Houston, we have a scope problem.",
  "We're gonna need a better prompt.",
  "I'll be back... with a clearer plan.",
  "Say hello to my little task.",
  "Here's looking at you, codebase.",
  "Keep your prompts close and your acceptance criteria closer.",
  "One does not simply run an agent without scope.",
  "There's no place like prod... but let's test first.",
  "The first rule of Orchestrator: clarify the task.",
  "With great automation comes great approval gates.",
  "Life finds a way. Agents find edge cases.",
  "The code must flow.",
  "Open the pod bay doors? Not without approval.",
  "I feel the need... the need for clean context.",
  "You can't handle the full repo scan.",
  "Show me the failing test.",
  "Nobody puts context in the corner.",
  "Roads? Where we're going, we need tests.",
  "The plan will go on.",
  "A prompt. A plan. A clean execution.",
  "Assemble the workflow.",
  "Cue the agents.",
  "Roll initiative: prompt analysis.",
  "Let's make this run count.",
  "Give me the chaos. I'll make it structured.",
  "What's the mission?",
  "Ready to conduct some code?",
  "Let's orchestrate something useful.",
  "Before we run, we plan.",
  "Your move, developer.",
  "The agents have entered the chat.",
  "This task needs a bigger plan.",
  "Less waffle. More workflow.",
  "Great prompt, kid. Don't get cocky.",
  "I find your lack of scope disturbing.",
  "That's not a prompt. That's a plot twist.",
  "This is where the plan begins.",
  "Every great build starts with a better brief.",
  "Clarify first. Execute second.",
  "Tell me the goal. I'll tune the agents.",
  "The repo awakens.",
  "A new prompt rises.",
  "Return of the context.",
  "Attack of the vague requirements.",
  "The last prompt was only the beginning.",
];
