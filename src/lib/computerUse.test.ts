import { describe, expect, it } from "vitest";
import {
  COMPUTER_USE_STORAGE_KEY,
  persistComputerUsePreference,
  readComputerUsePreference,
  validateComputerUsePreference,
} from "./computerUse";

describe("computer-use preferences", () => {
  it("defaults missing and malformed preferences to enabled", () => {
    expect(validateComputerUsePreference(null)).toEqual({ enabled: true });
    expect(validateComputerUsePreference({ enabled: "yes" })).toEqual({
      enabled: true,
    });
    expect(
      readComputerUsePreference({
        getItem: () => "{not-json",
        setItem: () => undefined,
      }),
    ).toEqual({ enabled: true });
  });

  it("preserves an explicit disabled preference", () => {
    expect(validateComputerUsePreference({ enabled: false })).toEqual({
      enabled: false,
    });
    expect(
      readComputerUsePreference({
        getItem: (key) =>
          key === COMPUTER_USE_STORAGE_KEY
            ? JSON.stringify({ enabled: false })
            : null,
        setItem: () => undefined,
      }),
    ).toEqual({ enabled: false });
  });

  it("persists only the validated preference", () => {
    const values = new Map<string, string>();
    persistComputerUsePreference(
      { enabled: false },
      {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
    );

    expect(JSON.parse(values.get(COMPUTER_USE_STORAGE_KEY)!)).toEqual({
      enabled: false,
    });
  });
});
