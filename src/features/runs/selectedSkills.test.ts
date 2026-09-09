import { describe, expect, it } from "vitest";
import { resolveSelectedSkills } from "./selectedSkills";
import { buildCodexTurnInput } from "../../lib/imageAttachments";

const skill = { id: "review", name: "review", description: "Review code", path: "/skills/review/SKILL.md" };

describe("native selected skills", () => {
  it("resolves legacy selections and sends skill identity separately from the question", () => {
    const selected = resolveSelectedSkills([{ id: "review", name: "review", description: null }], [skill]);
    const question = "Why is this error happening?\n\n```js\n  run();\n```";
    expect(buildCodexTurnInput(question, [], selected)).toEqual([
      { type: "text", text: question, text_elements: [] },
      { type: "skill", name: skill.name, path: skill.path },
    ]);
  });

  it("rejects stale paths, missing paths, and ambiguous legacy names", () => {
    expect(() => resolveSelectedSkills([skill], [{ ...skill, path: "/other/SKILL.md" }])).toThrow(/Select it again/);
    const legacy = { id: "review", name: "review", description: null };
    expect(() => resolveSelectedSkills([legacy], [legacy])).toThrow(/unavailable/);
    expect(() => resolveSelectedSkills([legacy], [skill, { ...skill, path: "/other/SKILL.md" }])).toThrow(/ambiguous/);
  });

  it("deduplicates the same selection without disturbing attachment inputs", () => {
    const skills = resolveSelectedSkills([skill, skill], [skill]);
    const input = buildCodexTurnInput("Explain this", [{ path: "/tmp/image.png", name: "image.png", source: "picker", mediaKind: "image" }], skills);
    expect(input.map((item) => item.type)).toEqual(["text", "localImage", "skill"]);
  });
});
