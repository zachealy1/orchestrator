import type { RouteRecommendation } from "../features/runs/types";

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
