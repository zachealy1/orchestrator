import type { PriorityChatListItem } from "../conversations/types";

export function nextLocalMidnight(now: number) {
  const date = new Date(now);
  date.setHours(24, 0, 0, 0);
  return date.getTime();
}

export function groupPriorityChats(chats: PriorityChatListItem[], now: number) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const groups: { label: string; chats: PriorityChatListItem[] }[] = [
    { label: "Today", chats: [] },
    { label: "Yesterday", chats: [] },
    { label: "Earlier", chats: [] },
  ];
  const sorted = [...chats].sort(
    (left, right) =>
      Date.parse(right.latest_finished_at) - Date.parse(left.latest_finished_at)
      || right.id - left.id,
  );
  for (const chat of sorted) {
    const finishedAt = Date.parse(chat.latest_finished_at);
    const index = finishedAt >= today.getTime()
      ? 0
      : finishedAt >= yesterday.getTime() ? 1 : 2;
    groups[index].chats.push(chat);
  }
  return groups.filter((group) => group.chats.length > 0);
}
