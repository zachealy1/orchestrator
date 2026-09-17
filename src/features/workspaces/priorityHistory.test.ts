import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PriorityChatListItem } from "../conversations/types";
import { groupPriorityChats, nextLocalMidnight } from "./priorityHistory";

function chat(id: number, date: Date) {
  return { id, latest_finished_at: date.toISOString() } as PriorityChatListItem;
}

beforeEach(() => vi.stubEnv("TZ", "America/New_York"));
afterEach(() => vi.unstubAllEnvs());

describe("Priority calendar groups", () => {
  it.each([
    [2027, 0, 1], // Year boundary
    [2026, 8, 1], // Month boundary
    [2026, 2, 9], // Yesterday was a 23-hour day
    [2026, 10, 2], // Yesterday was a 25-hour day
  ])("groups local days across %i/%i/%i, newest first with an ID tie-break", (year, month, day) => {
    const now = new Date(year, month, day, 12).getTime();
    const groups = groupPriorityChats([
      chat(1, new Date(year, month, day, 0)),
      chat(2, new Date(year, month, day - 1, 0)),
      chat(3, new Date(year, month, day - 2, 23, 59, 59)),
      chat(4, new Date(year, month, day, 0)),
      chat(5, new Date(year, month, day, 11)),
      chat(6, new Date(year, month, day - 1, 23, 59, 59)),
    ], now);
    expect(groups.map(group => [group.label, group.chats.map(row => row.id)])).toEqual([
      ["Today", [5, 4, 1]], ["Yesterday", [6, 2]], ["Previous 7 days", [3]],
    ]);
  });

  it("omits empty headings and moves yesterday's chats into the older group at midnight", () => {
    const yesterday = chat(1, new Date(2026, 8, 16, 12));
    const beforeMidnight = new Date(2026, 8, 17, 23, 59, 59).getTime();
    expect(groupPriorityChats([], beforeMidnight)).toEqual([]);
    expect(groupPriorityChats([yesterday], beforeMidnight)[0].label).toBe("Yesterday");
    expect(groupPriorityChats([yesterday], nextLocalMidnight(beforeMidnight))[0].label).toBe("Previous 7 days");
  });

  it.each([[2, 8, 23], [10, 1, 25]])("schedules local midnight over a DST transition (%i/%i)", (month, day, hours) => {
    const now = new Date(2026, month, day).getTime();
    expect(nextLocalMidnight(now)).toBe(new Date(2026, month, day + 1).getTime());
    expect(nextLocalMidnight(now) - now).toBe(hours * 60 * 60 * 1000);
  });
});
