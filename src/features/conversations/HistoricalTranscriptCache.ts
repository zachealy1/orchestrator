import type { HistoricalTranscriptState, TaskChatEntry } from "./types";

export type StableHistoryChatCacheEntry = {
  version: string;
  renderVersion: string;
  entries: TaskChatEntry[];
  transcript: HistoricalTranscriptState;
  sourceCharacters: number;
};

export class HistoricalTranscriptCache {
  private readonly entries = new Map<number, StableHistoryChatCacheEntry>();
  private sourceCharacters = 0;

  constructor(
    readonly entryLimit: number,
    readonly sourceCharacterBudget: number,
  ) {}

  get(chatId: number): StableHistoryChatCacheEntry | undefined {
    const entry = this.entries.get(chatId);
    if (!entry) return undefined;
    this.entries.delete(chatId);
    this.entries.set(chatId, entry);
    return entry;
  }

  set(chatId: number, entry: StableHistoryChatCacheEntry): void {
    this.delete(chatId);
    if (entry.sourceCharacters > this.sourceCharacterBudget) return;
    this.entries.set(chatId, entry);
    this.sourceCharacters += entry.sourceCharacters;
    while (
      this.entries.size > this.entryLimit ||
      this.sourceCharacters > this.sourceCharacterBudget
    ) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
  }

  delete(chatId: number): void {
    const entry = this.entries.get(chatId);
    if (!entry) return;
    this.entries.delete(chatId);
    this.sourceCharacters -= entry.sourceCharacters;
  }

  clear(): void {
    this.entries.clear();
    this.sourceCharacters = 0;
  }
}
