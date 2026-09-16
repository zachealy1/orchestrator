import type { StreamActivityEvent, StreamEvent } from "./streamTypes";
import { streamIdentityKey, type StreamIdentity } from "./streamIdentity";

/** Keep streamed fragments on their side of a user steer, including final reconciliation. */
export function updateStreamText(
  events: StreamEvent[],
  identity: StreamIdentity,
  kind: "message" | "reasoning",
  text: string,
  append: boolean,
): StreamEvent[] {
  const key = streamIdentityKey(identity);
  const matches = (event: StreamEvent) =>
    event.kind === kind &&
    (event.identity
      ? streamIdentityKey(event.identity) === key
      : kind === "message" && event.activityIds?.includes(identity.itemId));
  let boundary = -1;
  events.forEach((event, index) => {
    if (event.kind === "steer") boundary = index;
  });
  const indexes = events.flatMap((event, index) =>
    matches(event) && (!append || index > boundary) ? [index] : [],
  );
  if (indexes.length === 0) {
    if (!text && append) return events;
    const event: StreamActivityEvent = {
      id: `${key}:${events.filter(matches).length}`,
      kind,
      text,
      identity,
      streaming: append,
      activityIds: [identity.itemId],
      timestamp: new Date().toISOString(),
    };
    return [...events, event];
  }
  const next = [...events];
  if (append) {
    const index = indexes[indexes.length - 1];
    const event = next[index];
    if (event.kind !== "steer")
      next[index] = { ...event, text: event.text + text, streaming: true };
  } else {
    let cursor = 0;
    indexes.forEach((index, position) => {
      const event = next[index];
      if (event.kind === "steer") return;
      const length =
        position === indexes.length - 1
          ? text.length - cursor
          : next[index].text.length;
      next[index] = {
        ...event,
        text: text.slice(cursor, cursor + length),
        streaming: false,
      };
      cursor += length;
    });
  }
  return next;
}
