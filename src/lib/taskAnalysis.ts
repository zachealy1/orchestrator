import type { RecommendationDraft, RouteRecommendation } from "../features/runs/types";

const PLAN_TRIGGERS = [
  "build",
  "implement",
  "refactor",
  "migrate",
  "redesign",
  "architecture",
  "database",
  "auth",
  "security",
];

export function estimateTokens(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  return Math.max(Math.ceil(trimmed.length / 4), trimmed.split(/\s+/).length);
}

export function recommendRoute(prompt: string): RouteRecommendation {
  const tokenEstimate = estimateTokens(prompt);
  const lower = prompt.toLowerCase();
  const needsPlan = PLAN_TRIGGERS.some((trigger) => lower.includes(trigger));

  return tokenEstimate > 180 || needsPlan ? "plan-first" : "direct-run";
}

export function improvePrompt(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return "";
  }

  return [
    "Objective:",
    trimmed,
    "",
    "Context:",
    "Inspect the selected repository before changing files. Follow existing conventions and avoid unrelated refactors.",
    "",
    "Constraints:",
    "Use workspace-write permissions only inside the selected repo. Surface uncertainty before risky changes.",
    "",
    "Acceptance criteria:",
    "- Implement the requested behavior completely.",
    "- Keep changes focused and easy to review.",
    "- Run the most relevant available checks.",
    "",
    "Verification:",
    "Report commands run, results, and any remaining risk.",
  ].join("\n");
}

export function buildRunPrompt(
  improvedPrompt: string,
  recommendations: RecommendationDraft[],
) {
  const subagentRecommendations = recommendations
    .filter((recommendation) => recommendation.kind === "subagent")
    .map((recommendation) => recommendation.body);

  if (subagentRecommendations.length === 0) {
    return improvedPrompt;
  }

  return [
    improvedPrompt,
    "",
    "Recommended delegation:",
    ...subagentRecommendations.map((body) => `- ${body}`),
  ].join("\n");
}
