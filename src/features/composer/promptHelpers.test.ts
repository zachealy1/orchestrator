import { describe, expect, it } from "vitest";
import { parseSavedDefaultCollaborationMode } from "./promptHelpers";

describe("parseSavedDefaultCollaborationMode", () => {
  it.each([undefined, null, "Legacy image policy", "Legacy implementation instructions"])(
    "restores native defaults from saved instructions: %s", (developer_instructions) => {
      const parsed = parseSavedDefaultCollaborationMode(JSON.stringify({
        mode: "default", settings: { model: "gpt-5.5", reasoning_effort: "high", developer_instructions },
      }));
      expect(parsed).toEqual({ mode: "default", settings: {
        model: "gpt-5.5", reasoning_effort: "high", developer_instructions: null,
      } });
    },
  );
});
