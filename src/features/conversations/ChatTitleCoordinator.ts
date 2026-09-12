import { sanitizeGeneratedChatTitle } from "../../lib/chatTitles";
import type { ChatRecord } from "./types";

export type TitleGenerationInput = {
  chatId: number;
  workspacePath: string;
  accountId: number;
  model: string | null;
  initialPrompt: string;
};

export type ChatTitleDependencies = {
  load: (chatId: number) => Promise<ChatRecord | null>;
  claim: (chatId: number) => Promise<boolean>;
  generate: (
    input: Omit<TitleGenerationInput, "chatId">,
  ) => Promise<{ title: string }>;
  complete: (chatId: number, title: string) => Promise<boolean>;
  fail: (chatId: number) => Promise<boolean>;
};

export function isTitlePending(chat: ChatRecord) {
  return (
    chat.title_generation_state === "pending" ||
    chat.title_generation_state === "generating"
  );
}

function requireChat(chat: ChatRecord | null): ChatRecord {
  if (!chat || chat.deleted_at)
    throw new Error("The conversation is no longer available.");
  return chat;
}

function requireReadyTitle(chat: ChatRecord) {
  if (
    isTitlePending(chat) ||
    !chat.title.trim() ||
    /^generating[\s-]+title[.\u2026\s]*$/i.test(chat.title.trim())
  ) {
    throw new Error(
      "The conversation title could not be saved. Retry title generation before creating a branch.",
    );
  }
  return chat;
}

// Cancelling a launch releases that caller without cancelling shared title generation.
export function awaitWithSignal<T>(
  operation: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return operation;
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new Error("Launch cancelled."));
    if (signal.aborted) aborted();
    else signal.addEventListener("abort", aborted, { once: true });
    operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", aborted));
  });
}

export class ChatTitleCoordinator {
  private readonly inFlight = new Map<number, Promise<ChatRecord>>();
  private disposed = false;

  ensure(
    input: TitleGenerationInput,
    dependencies: ChatTitleDependencies,
    signal?: AbortSignal,
  ) {
    let operation = this.inFlight.get(input.chatId);
    if (!operation) {
      operation = this.settle(input, dependencies).finally(() =>
        this.inFlight.delete(input.chatId),
      );
      this.inFlight.set(input.chatId, operation);
    }
    // Reload even for callers joining an existing generation: manual edits win.
    return awaitWithSignal(
      operation.then(async () => {
        this.assertActive();
        return requireReadyTitle(
          requireChat(await dependencies.load(input.chatId)),
        );
      }),
      signal,
    );
  }

  private assertActive() {
    if (this.disposed) throw new Error("Title generation service was closed.");
  }

  private async settle(
    input: TitleGenerationInput,
    dependencies: ChatTitleDependencies,
  ) {
    this.assertActive();
    let chat = requireChat(await dependencies.load(input.chatId));
    this.assertActive();
    if (!isTitlePending(chat)) return requireReadyTitle(chat);
    if (await dependencies.claim(input.chatId)) {
      this.assertActive();
      let title: string | null;
      try {
        const { workspacePath, accountId, model, initialPrompt } = input;
        const output = await dependencies.generate({
          workspacePath,
          accountId,
          model,
          initialPrompt,
        });
        title = sanitizeGeneratedChatTitle(output.title);
        if (!title) throw new Error("Invalid generated title");
      } catch {
        // Native generation enforces its existing 30-second timeout. Only a
        // generation failure selects the fallback; persistence errors propagate.
        this.assertActive();
        await dependencies.fail(input.chatId);
        return requireReadyTitle(
          requireChat(await dependencies.load(input.chatId)),
        );
      }
      this.assertActive();
      await dependencies.complete(input.chatId, title);
    } else {
      // Another caller/window may already own generation. Observe its persisted
      // result, with a bounded wait for an abandoned owner.
      const deadline = Date.now() + 35_000;
      while (isTitlePending(chat)) {
        this.assertActive();
        if (Date.now() >= deadline) {
          await dependencies.fail(input.chatId);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
        chat = requireChat(await dependencies.load(input.chatId));
      }
    }
    return requireReadyTitle(
      requireChat(await dependencies.load(input.chatId)),
    );
  }

  dispose() {
    this.disposed = true;
  }
}
