import type { SelectedComposerSkill } from "../composer/types";

export type ResolvedSkill = SelectedComposerSkill & { path: string };

/** Resolve against the current profile so queued selections cannot use stale paths. */
export function resolveSelectedSkills(
  selected: SelectedComposerSkill[],
  available: SelectedComposerSkill[],
): ResolvedSkill[] {
  const resolved: ResolvedSkill[] = [];
  for (const selection of selected) {
    const matches = available.filter((skill) =>
      selection.path
        ? skill.path === selection.path
        : skill.id === selection.id || skill.name === selection.name,
    );
    if (matches.length !== 1 || !matches[0].path) {
      throw new Error(`Selected skill “${selection.name}” is unavailable or ambiguous. Select it again before sending.`);
    }
    const skill = matches[0] as ResolvedSkill;
    if (!resolved.some((item) => item.path === skill.path)) resolved.push(skill);
  }
  return resolved;
}
