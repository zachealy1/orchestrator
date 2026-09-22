export const PRIORITY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinPriorityWindow(finishedAt: number, now: number) {
  return finishedAt > now - PRIORITY_WINDOW_MS && finishedAt <= now;
}
