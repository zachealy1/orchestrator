import { describe, expect, it } from "vitest";
import {
  INTERACTION_PREFERENCE_STORAGE_KEY,
  persistInteractionPreferences,
  readInteractionPreferences,
} from "./preferences";

describe("interaction preferences", () => {
  it("does not widen the legacy browser preference to desktop access", () => {
    expect(
      readInteractionPreferences({
        getItem: (key) =>
          key === "orchestrator.computer-use.v3"
            ? JSON.stringify({ enabled: false })
            : null,
        setItem: () => undefined,
      }),
    ).toEqual({ computerUseEnabled: false });
  });

  it("migrates the former desktop preference", () => {
    expect(
      readInteractionPreferences({
        getItem: (key) =>
          key === "orchestrator.interaction.v1"
            ? JSON.stringify({ browserEnabled: false, desktopEnabled: true })
            : null,
        setItem: () => undefined,
      }),
    ).toEqual({ computerUseEnabled: true });
  });

  it("persists only validated capability flags", () => {
    const values = new Map<string, string>();
    persistInteractionPreferences(
      {
        computerUseEnabled: true,
      },
      {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
    );
    expect(JSON.parse(values.get(INTERACTION_PREFERENCE_STORAGE_KEY)!)).toEqual({
      computerUseEnabled: true,
    });
  });
});
