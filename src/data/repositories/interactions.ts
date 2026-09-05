import type { RedactedInteractionSessionWrite } from "../../features/interaction/telemetry";
import type {
  AlwaysAllowedApplication,
  InteractionSurfaceKind,
} from "../../features/interaction/types";
import { FrontendDatabase } from "../database";

export type InteractionPermissionRecord = {
  scope_kind: InteractionSurfaceKind;
  scope_key: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
};

export function createInteractionRepository(database: FrontendDatabase) {
  const getDatabase = () => database.get();

  async function upsertSession(input: RedactedInteractionSessionWrite) {
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO interaction_sessions (
         id, run_id, thread_id, turn_id, state, current_surface_kind,
         browser_provider_version, desktop_provider_version, started_at,
         updated_at, completed_at, error_code
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT(id) DO UPDATE SET
         run_id = excluded.run_id,
         thread_id = excluded.thread_id,
         turn_id = excluded.turn_id,
         state = excluded.state,
         current_surface_kind = excluded.current_surface_kind,
         browser_provider_version = excluded.browser_provider_version,
         desktop_provider_version = excluded.desktop_provider_version,
         updated_at = excluded.updated_at,
         completed_at = excluded.completed_at,
         error_code = excluded.error_code`,
      [
        input.id,
        input.runId,
        input.threadId,
        input.turnId,
        input.state,
        input.currentSurfaceKind,
        input.browserProviderVersion,
        input.desktopProviderVersion,
        input.startedAt,
        new Date().toISOString(),
        input.completedAt,
        input.errorCode,
      ],
    );
  }

  async function listAlwaysAllowedApplications(): Promise<AlwaysAllowedApplication[]> {
    const db = await getDatabase();
    const records = await db.select<InteractionPermissionRecord[]>(
      `SELECT scope_kind, scope_key, created_at, updated_at, expires_at
       FROM interaction_permissions
       WHERE scope_kind = 'desktop'
         AND decision = 'allow-always'
         AND expires_at IS NULL
       ORDER BY updated_at DESC`,
    );
    return records.map((record) => ({
      id: record.scope_key,
      bundleId: record.scope_key,
      name: applicationNameFromScope(record.scope_key),
      approvedAt: record.updated_at,
    }));
  }

  async function revokeAlwaysAllowedApplication(applicationId: string) {
    const db = await getDatabase();
    return db.execute(
      `DELETE FROM interaction_permissions
       WHERE scope_kind = 'desktop' AND scope_key = $1`,
      [normalizeScopeKey(applicationId)],
    );
  }

  return {
    listAlwaysAllowedApplications,
    revokeAlwaysAllowedApplication,
    upsertSession,
  };
}

function normalizeScopeKey(value: string) {
  return value.trim().toLocaleLowerCase().slice(0, 512);
}

function applicationNameFromScope(value: string) {
  const parts = value.split(".").filter(Boolean);
  const last = parts[parts.length - 1] ?? value;
  return last.charAt(0).toLocaleUpperCase() + last.slice(1);
}

export type InteractionRepository = ReturnType<
  typeof createInteractionRepository
>;
