import {
  createContext,
  useContext,
  type PropsWithChildren,
} from "react";
import type { StateSnapshot } from "react-virtuoso";
import { FrontendDatabase } from "../data/database";
import { createAppRepositories } from "../data/repositories";
import { CodexEventRouter } from "../features/codex/CodexEventRouter";
import { RunCoordinator } from "../features/runs/RunCoordinator";
import { ActiveRunRegistry } from "../features/runs/ActiveRunRegistry";
import { RunEventBuffer } from "../features/runs/RunEventBuffer";
import { CodePreviewCache } from "../lib/codePreview";
import { CodePreviewHighlightingService } from "../lib/codePreviewHighlighting";
import { ImageAttachmentPreviewCache } from "../lib/imageAttachments";
import {
  SubagentStore,
  type SubagentTranscript,
} from "../lib/subagents";
import { TranscriptGeometryCache } from "../lib/transcriptVirtualization";
import { BoundedLruCache } from "../shared/cache/BoundedLruCache";
import { AnimationFrameBatcher } from "../shared/AnimationFrameBatcher";
import { AsyncResourceCache } from "../shared/cache/AsyncResourceCache";
import type { CodexMessage, CodexProfileKey } from "../features/codex/types";
import { HistoricalTranscriptCache } from "../features/conversations/HistoricalTranscriptCache";
import type { HistoricalTurnActivityResponse } from "../codexClient";
import { WorkspaceTaskMemoryStore } from "../features/conversations/WorkspaceTaskMemoryStore";
import { WorkspaceFilePreviewService } from "../features/workspaces/WorkspaceFilePreviewService";

export type CachedTranscriptState = {
  snapshot: StateSnapshot;
  entryCount: number;
};

export class AppServices {
  readonly database = new FrontendDatabase();
  readonly repositories = createAppRepositories(this.database);
  readonly codexEvents = new CodexEventRouter();
  readonly runCoordinator = new RunCoordinator();
  readonly activeRuns = new ActiveRunRegistry();
  readonly runEvents = new RunEventBuffer((events) =>
    this.repositories.runs.appendRunEvents(events),
  );
  readonly codexNotificationFrames = new AnimationFrameBatcher<{
    profileKey: CodexProfileKey;
    message: CodexMessage;
  }>();
  readonly historicalTranscripts = new HistoricalTranscriptCache(5, 2_000_000);
  readonly historicalActivities = new AsyncResourceCache<
    string,
    HistoricalTurnActivityResponse
  >(200);
  readonly workspaceTaskMemories = new WorkspaceTaskMemoryStore();
  readonly codePreview = new CodePreviewCache();
  readonly codePreviewHighlighting = new CodePreviewHighlightingService({
    cache: this.codePreview,
  });
  readonly workspaceFilePreviews = new WorkspaceFilePreviewService();
  readonly imageAttachments = new ImageAttachmentPreviewCache();
  readonly subagents = new SubagentStore();
  readonly subagentTranscripts = new BoundedLruCache<
    string,
    SubagentTranscript
  >(5);
  readonly transcriptGeometry = new TranscriptGeometryCache();
  readonly transcriptStates = new BoundedLruCache<
    string,
    CachedTranscriptState
  >(5);

  invalidateChat(chatId: number) {
    const chatPrefix = `chat:${chatId}`;
    const childThreadIds = new Set(
      this.subagents
        .getConversation(chatPrefix)
        .map((record) => record.childThreadId),
    );
    this.subagentTranscripts.deleteWhere((key) =>
      [...childThreadIds].some((threadId) => key.includes(`:${threadId}:`)),
    );
    this.subagents.removeConversation(chatPrefix);
    this.transcriptGeometry.invalidateScope(chatPrefix);
    this.transcriptStates.deleteWhere((key) => key.includes(chatPrefix));
    this.historicalTranscripts.delete(chatId);
  }

  invalidateWorkspace(workspaceId: number) {
    const workspaceThreads = this.subagents
      .getWorkspaceRecords(workspaceId)
      .map((record) => record.childThreadId);
    this.subagentTranscripts.deleteWhere((key) =>
      workspaceThreads.some((threadId) => key.includes(`:${threadId}:`)),
    );
    this.subagents.removeWorkspace(workspaceId);
    this.transcriptGeometry.invalidateScope(`workspace:${workspaceId}`);
    this.transcriptStates.deleteWhere((key) =>
      key.includes(`workspace:${workspaceId}`),
    );
    this.workspaceTaskMemories.delete(workspaceId);
  }

  dispose() {
    this.database.dispose();
    this.codexEvents.dispose();
    this.runCoordinator.dispose();
    this.activeRuns.dispose();
    this.runEvents.dispose();
    this.codexNotificationFrames.dispose();
    this.historicalTranscripts.clear();
    this.historicalActivities.clear();
    this.workspaceTaskMemories.clear();
    this.codePreviewHighlighting.dispose();
    this.codePreview.clear();
    this.workspaceFilePreviews.clear();
    this.imageAttachments.clear();
    this.subagents.dispose();
    this.subagentTranscripts.clear();
    this.transcriptGeometry.clear();
    this.transcriptStates.clear();
  }
}

const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({
  services,
  children,
}: PropsWithChildren<{ services: AppServices }>) {
  return (
    <AppServicesContext.Provider value={services}>
      {children}
    </AppServicesContext.Provider>
  );
}

export function useAppServices() {
  const services = useContext(AppServicesContext);
  if (!services) {
    throw new Error("AppServicesProvider is required for application features.");
  }
  return services;
}
