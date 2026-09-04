import { describe, expect, it } from "vitest";
import { GENERATED_IMAGE_HANDLING_POLICY } from "../../lib/nativePlanMode";
import { parseSavedDefaultCollaborationMode } from "./promptHelpers";

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
