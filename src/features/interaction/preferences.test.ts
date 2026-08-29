import { describe, expect, it } from "vitest";
import {
  INTERACTION_PREFERENCE_STORAGE_KEY,
  persistInteractionPreferences,
  readInteractionPreferences,
} from "./preferences";

describe("interaction preferences", () => {
  it("migrates the legacy browser Computer Use preference", () => {
    expect(
      readInteractionPreferences({
        getItem: (key) =>
          key === "orchestrator.computer-use.v3"
            ? JSON.stringify({ enabled: false })
            : null,
        setItem: () => undefined,
      }),
    ).toEqual({
      browserEnabled: false,
      desktopEnabled: false,
      diagnosticsEnabled: false,
      developerModeEnabled: false,
    });
  });

  it("persists only validated capability flags", () => {
    const values = new Map<string, string>();
    persistInteractionPreferences(
      {
        browserEnabled: true,
        desktopEnabled: true,
        diagnosticsEnabled: true,
        developerModeEnabled: false,
      },
      {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
    );
    expect(JSON.parse(values.get(INTERACTION_PREFERENCE_STORAGE_KEY)!)).toEqual({
      browserEnabled: true,
      desktopEnabled: true,
      diagnosticsEnabled: true,
      developerModeEnabled: false,
    });
  });
});
