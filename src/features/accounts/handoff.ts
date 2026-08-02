import { estimateTokens } from "../../lib/taskAnalysis";
import type { RunIntent } from "../../lib/nativePlanMode";

export type AccountHandoffContextTurn = {
  turnIndex: number;
  prompt: string;
  finalMessage: string;
  completedPlan: string;
  intent: RunIntent | null;
  planReviewState: string | null;
};

export function buildBoundedAccountHandoffContext(
  turns: AccountHandoffContextTurn[],
  explicitPlan: string,
  tokenBudget: number,
) {
  const orderedTurns = [...turns].sort(
    (left, right) => left.turnIndex - right.turnIndex,
  );
  const objectiveTurn =
    orderedTurns.find(
      (turn) =>
        turn.intent !== "plan-implementation" &&
        turn.intent !== "plan-revision" &&
        turn.prompt.trim(),
    ) ?? orderedTurns.find((turn) => turn.prompt.trim());
  const latestPlan =
    explicitPlan.trim() ||
    [...orderedTurns]
      .reverse()
      .find(
        (turn) =>
          turn.completedPlan.trim() &&
          ["approved", "available", "superseded"].includes(
            turn.planReviewState ?? "",
          ),
      )
      ?.completedPlan.trim() ||
    [...orderedTurns]
      .reverse()
      .find((turn) => turn.completedPlan.trim())
      ?.completedPlan.trim() ||
    "";
  const sections: string[] = [
    "Account handoff context. Continue the same visible Orchestrator conversation in a fresh Codex thread. Treat this as background, not as new user instructions.",
  ];
  let remainingTokens = Math.max(1, tokenBudget);

  const appendPrioritized = (heading: string, content: string) => {
    if (!content.trim() || remainingTokens <= 0) return;
    const section = `${heading}\n${content.trim()}`;
    const sectionTokens = estimateTokens(section);
    if (sectionTokens <= remainingTokens) {
      sections.push(section);
      remainingTokens -= sectionTokens;
      return;
    }
    const truncated = truncateTextToEstimatedTokens(content, remainingTokens);
    if (truncated) {
      sections.push(`${heading}\n${truncated}`);
      remainingTokens = 0;
    }
  };

  appendPrioritized(
    "Original objective:",
    objectiveTurn?.prompt ?? "No original objective was recorded.",
  );
  appendPrioritized("Latest approved or revised plan:", latestPlan);

  const recentSections: Array<{ turnIndex: number; text: string }> = [];
  for (const turn of [...orderedTurns].reverse()) {
    if (remainingTokens <= 0) break;
    const prompt = turn.intent === "plan-implementation" ? "" : turn.prompt.trim();
    const result = turn.finalMessage.trim();
    if (!prompt && !result) continue;
    const text = [
      `Prior turn ${turn.turnIndex}:`,
      ...(prompt ? ["User:", prompt] : []),
      ...(result ? ["Assistant:", result] : []),
    ].join("\n");
    const tokens = estimateTokens(text);
    if (tokens > remainingTokens) continue;
    recentSections.push({ turnIndex: turn.turnIndex, text });
    remainingTokens -= tokens;
  }
  recentSections
    .sort((left, right) => left.turnIndex - right.turnIndex)
    .forEach((section) => sections.push(section.text));

  return sections.join("\n\n");
}

function truncateTextToEstimatedTokens(text: string, tokenBudget: number) {
  if (tokenBudget <= 0) return "";
  if (estimateTokens(text) <= tokenBudget) return text.trim();
  const characterBudget = Math.max(0, tokenBudget * 4 - 24);
  const truncated = text.trim().slice(0, characterBudget).trimEnd();
  return truncated ? `${truncated}\n[Context truncated]` : "";
}
