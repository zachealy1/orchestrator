import { describe, expect, it } from "vitest";
import { GENERATED_IMAGE_HANDLING_POLICY } from "../../lib/nativePlanMode";
import { addPlanImplementationProgressInstructions, parseSavedDefaultCollaborationMode } from "./promptHelpers";

describe("plan implementation progress", () => {
  it("uses structured progress when available without making it a prerequisite", () => {
    const prompt = "Implement the approved plan.\n\nCreate QA_PLAN.txt.";
    const result = addPlanImplementationProgressInstructions(prompt);
    expect(result.startsWith(prompt)).toBe(true);
    expect(result).toContain("If `update_plan` is available in this session");
    expect(result).toContain("If that tool is unavailable, continue implementing");
    expect(result).toContain("must not block implementation");
    expect(result).not.toContain("Before changing files, call");
  });
});

describe("parseSavedDefaultCollaborationMode", () => {
  it("upgrades legacy modes with the generated-image policy", () => {
    const parsed = parseSavedDefaultCollaborationMode(
      JSON.stringify({
        mode: "default",
        settings: {
          model: "gpt-5.5",
          reasoning_effort: "high",
          developer_instructions: null,
        },
      }),
    );

    expect(parsed?.settings.developer_instructions).toBe(
      GENERATED_IMAGE_HANDLING_POLICY,
    );
  });

  it("preserves upstream developer instructions while avoiding duplicates", () => {
    const upstream = "Keep changes focused.";
    const parsed = parseSavedDefaultCollaborationMode(
      JSON.stringify({
        mode: "default",
        settings: {
          model: "gpt-5.5",
          reasoning_effort: null,
          developer_instructions: `${upstream}\n\n${GENERATED_IMAGE_HANDLING_POLICY}`,
        },
      }),
    );

    expect(parsed?.settings.developer_instructions).toBe(
      `${upstream}\n\n${GENERATED_IMAGE_HANDLING_POLICY}`,
    );
  });
});
