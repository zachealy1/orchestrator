import { parseRunExecutionSettings } from "../lib/runExecutionSettings";
import {
  isTitlePending,
  type ChatTitleCoordinator,
  type ChatTitleDependencies,
} from "../features/conversations/ChatTitleCoordinator";
import type { ChatTitleGenerationRequest } from "../features/runs/runtimeTypes";
import type { ApplicationNotificationQueue } from "./useApplicationNotificationQueue";

type ChatTitleActionDependencies = {
  coordinator: ChatTitleCoordinator;
  titles: ChatTitleDependencies;
  updateHistoryChatTitle: (
    chatId: number,
    title: string,
    state: "complete" | "failed",
  ) => void;
  syncSharedChatTitle: (chatId: number, title: string) => Promise<unknown>;
  applicationNotifications: ApplicationNotificationQueue;
  setStatusMessage: (message: string) => void;
};

export function createChatTitleActions({
  coordinator,
  titles,
  updateHistoryChatTitle,
  syncSharedChatTitle,
  applicationNotifications,
  setStatusMessage,
}: ChatTitleActionDependencies) {
  const {
    load: getChatRecord,
    claim: claimChatTitleGeneration,
    generate: generateChatTitle,
    complete: completeChatTitleGeneration,
    fail: failChatTitleGeneration,
  } = titles;
  async function ensureChatTitleReady(
    chatId: number,
    workspacePath: string,
    initialPrompt?: string,
    signal?: AbortSignal,
    model?: string | null,
  ) {
    const chat = await getChatRecord(chatId);
    if (!chat) throw new Error("The conversation is no longer available.");
    const noticeId = `chat-title-wait:${chatId}`;
    if (isTitlePending(chat)) {
      applicationNotifications.publish({
        id: noticeId,
        revisionKey: String(Date.now()),
        tone: "info",
        title: "Waiting for title…",
        timeoutMs: null,
      });
    }
    try {
      const settings = parseRunExecutionSettings(
        chat.continuation_settings_json,
      );
      const resolved = await coordinator.ensure(
        {
          chatId,
          workspacePath,
          initialPrompt: initialPrompt ?? chat.title_fallback ?? chat.title,
          accountId: chat.account_id ?? 0,
          model: model === undefined ? (settings?.model ?? null) : model,
        },
        {
          load: getChatRecord,
          claim: claimChatTitleGeneration,
          generate: generateChatTitle,
          complete: completeChatTitleGeneration,
          fail: failChatTitleGeneration,
        },
        signal,
      );
      updateHistoryChatTitle(
        chatId,
        resolved.title,
        resolved.title_generation_state === "failed" ? "failed" : "complete",
      );
      return resolved;
    } finally {
      applicationNotifications.dismiss(noticeId);
    }
  }

  function startChatTitleGeneration(request: ChatTitleGenerationRequest) {
    void coordinator
      .ensure(request, {
        load: getChatRecord,
        claim: claimChatTitleGeneration,
        generate: generateChatTitle,
        complete: completeChatTitleGeneration,
        fail: failChatTitleGeneration,
      })
      .then(async (chat) => {
        updateHistoryChatTitle(
          chat.id,
          chat.title,
          chat.title_generation_state === "failed" ? "failed" : "complete",
        );
        if (chat.title_generation_state === "failed") {
          setStatusMessage(
            "AI title generation failed; using the prompt-based title.",
          );
        } else {
          await syncSharedChatTitle(chat.id, chat.title).catch((error) => {
            console.warn(
              "Could not synchronize the generated Codex title",
              error,
            );
          });
        }
      })
      .catch((error) => {
        console.warn("Could not settle the conversation title", error);
        setStatusMessage(
          "The conversation title could not be saved. Retry before creating a branch.",
        );
      })
      .finally(() => request.onSettled?.());
  }

  return { ensureChatTitleReady, startChatTitleGeneration };
}
