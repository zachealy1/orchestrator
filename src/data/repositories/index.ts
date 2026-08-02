import { FrontendDatabase } from "../database";
import { createAccountRepository } from "./accounts";
import { createAnalyticsRepository } from "./analytics";
import { createChatRepository } from "./chats";
import { createPromptQueueRepository } from "./promptQueue";
import { createRunRepository } from "./runs";
import { createTranscriptRepository } from "./transcripts";
import { createWorkspaceRepository } from "./workspaces";

export function createAppRepositories(database: FrontendDatabase) {
  const chats = createChatRepository(database);

  return {
    accounts: createAccountRepository(database),
    analytics: createAnalyticsRepository(database),
    chats,
    promptQueue: createPromptQueueRepository(database, chats),
    runs: createRunRepository(database),
    transcripts: createTranscriptRepository(database),
    workspaces: createWorkspaceRepository(database),
  };
}

export type AppRepositories = ReturnType<typeof createAppRepositories>;
export type { RunEventInput } from "./runs";
