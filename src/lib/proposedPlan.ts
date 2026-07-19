export type ProposedPlanEnvelope = {
  markdown: string;
};

const PROPOSED_PLAN_ENVELOPE =
  /^(?:[\t ]*\r?\n)*[\t ]*<proposed_plan>[\t ]*\r?\n([\s\S]*?)\r?\n[\t ]*<\/proposed_plan>[\t ]*(?:\r?\n[\t ]*)*$/u;

export function parseProposedPlanEnvelope(
  value: string,
): ProposedPlanEnvelope | null {
  const match = PROPOSED_PLAN_ENVELOPE.exec(value);
  const markdown = match?.[1];
  if (!markdown?.trim()) {
    return null;
  }

  return { markdown };
}
