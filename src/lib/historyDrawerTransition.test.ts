import { describe, expect, it } from "vitest";
import {
  historyDrawerInputAnimating,
  historyDrawerInputContracted,
  historyDrawerIsVisible,
  historyDrawerReservesSpace,
  type HistoryDrawerPhase,
} from "./historyDrawerTransition";

describe("history drawer transition phases", () => {
  it("reserves transcript space only after the opening motion completes", () => {
    const openingPhases: HistoryDrawerPhase[] = [
      "preparing",
      "opening",
      "open",
    ];

    expect(openingPhases.map(historyDrawerReservesSpace)).toEqual([
      false,
      false,
      true,
    ]);
    expect(openingPhases.map(historyDrawerInputAnimating)).toEqual([
      true,
      true,
      false,
    ]);
    expect(openingPhases.map(historyDrawerInputContracted)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("holds equivalent input geometry while releasing transcript space", () => {
    const closingPhases: HistoryDrawerPhase[] = [
      "releasing",
      "closing-ready",
      "closing",
      "closed",
    ];

    expect(closingPhases.map(historyDrawerReservesSpace)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(closingPhases.map(historyDrawerInputContracted)).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(closingPhases.map(historyDrawerInputAnimating)).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  it("keeps the drawer mounted throughout both transition directions", () => {
    const phases: HistoryDrawerPhase[] = [
      "closed",
      "preparing",
      "opening",
      "open",
      "releasing",
      "closing-ready",
      "closing",
    ];

    expect(phases.map(historyDrawerIsVisible)).toEqual([
      false,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });
});
