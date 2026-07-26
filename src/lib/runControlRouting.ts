export type RunControlRouteCandidate = {
  profileKey: string;
  stopped: boolean;
  threadId: string | null;
  turnId: string | null;
  startedAt: string | null;
  acceptsThreadContinuation?: boolean;
};

export function selectRunControlForIds<
  T extends RunControlRouteCandidate,
>(
  controls: Iterable<T>,
  profileKey: string,
  threadId: string | null,
  turnId: string | null,
) {
  const profileCandidates = [...controls].filter(
    (control) =>
      !control.stopped &&
      control.profileKey === profileKey,
  );
  const exact = profileCandidates.filter(
    (control) =>
      (!threadId || control.threadId === threadId) &&
      (!turnId || control.turnId === turnId),
  );
  if (exact.length === 1) return exact[0];
  if (!threadId) return null;

  const threadCandidates = profileCandidates.filter(
    (control) => control.threadId === threadId,
  );
  const continuationCandidates = turnId
    ? threadCandidates.filter(
        (control) => control.acceptsThreadContinuation,
      )
    : threadCandidates;
  if (continuationCandidates.length === 0) return null;

  return continuationCandidates
    .slice()
    .sort(
      (left, right) =>
        timestamp(right.startedAt) - timestamp(left.startedAt),
    )[0] ?? null;
}

function timestamp(value: string | null) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}
