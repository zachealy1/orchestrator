import { describe, expect, it } from "vitest";
import {
  historyDrawerIsVisible,
  historyDrawerReservesSpace,
  historyDrawerTargetsOpen,
  type HistoryDrawerPhase,
} from "./historyDrawerTransition";

describe("history drawer transition phases", () => {
  it("drives drawer and transcript geometry from the same opening target", () => {
    const openingPhases: HistoryDrawerPhase[] = ["closed", "opening", "open"];

    expect(openingPhases.map(historyDrawerReservesSpace)).toEqual([
      false,
      true,
      true,
    ]);
    expect(openingPhases.map(historyDrawerTargetsOpen)).toEqual([
      false,
      true,
      true,
    ]);
  });

  it("releases drawer space in the same closing state that moves the drawer", () => {
    const closingPhases: HistoryDrawerPhase[] = ["open", "closing", "closed"];

    expect(closingPhases.map(historyDrawerReservesSpace)).toEqual([
      true,
      false,
      false,
    ]);
    expect(closingPhases.map(historyDrawerTargetsOpen)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("keeps the drawer mounted throughout both transition directions", () => {
    const phases: HistoryDrawerPhase[] = [
      "closed",
      "opening",
      "open",
      "closing",
    ];

    expect(phases.map(historyDrawerIsVisible)).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });
});
