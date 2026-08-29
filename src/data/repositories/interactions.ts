import type {
  RedactedInteractionSessionWrite,
  RedactedInteractionStepWrite,
} from "../../features/interaction/telemetry";
import type {
  AlwaysAllowedApplication,
  InteractionPermissionDecision,
  InteractionSurfaceKind,
} from "../../features/interaction/types";
import { FrontendDatabase } from "../database";

export type InteractionPermissionRecord = {
  scope_kind: InteractionSurfaceKind;
  scope_key: string;
  decision: InteractionPermissionDecision;
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

  async function upsertStep(input: RedactedInteractionStepWrite) {
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO interaction_steps (
         id, session_id, sequence, surface_kind, action_kind, grounding_kind,
         consequence, policy_decision, result_status, retry_count, duration_ms,
         error_code, observation_generation, state_hash_before,
         state_hash_after, started_at, completed_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17
       )
       ON CONFLICT(id) DO UPDATE SET
         result_status = excluded.result_status,
         retry_count = excluded.retry_count,
         duration_ms = excluded.duration_ms,
         error_code = excluded.error_code,
         state_hash_after = excluded.state_hash_after,
         completed_at = excluded.completed_at`,
      [
        input.id,
        input.sessionId,
        input.sequence,
        input.surfaceKind,
        input.actionKind,
        input.groundingKind,
        input.consequence,
        input.policyDecision,
        input.resultStatus,
        input.retryCount,
        input.durationMs,
        input.errorCode,
        input.observationGeneration,
        input.stateHashBefore,
        input.stateHashAfter,
        input.startedAt,
        input.completedAt,
      ],
    );
  }

  async function setPermission(input: {
    scopeKind: InteractionSurfaceKind;
    scopeKey: string;
    decision: InteractionPermissionDecision;
    expiresAt: string | null;
  }) {
    const now = new Date().toISOString();
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO interaction_permissions (
         scope_kind, scope_key, decision, created_at, updated_at, expires_at
       ) VALUES ($1, $2, $3, $4, $4, $5)
       ON CONFLICT(scope_kind, scope_key) DO UPDATE SET
         decision = excluded.decision,
         updated_at = excluded.updated_at,
         expires_at = excluded.expires_at`,
      [
        input.scopeKind,
        normalizeScopeKey(input.scopeKey),
        input.decision,
        now,
        input.expiresAt,
      ],
    );
  }

  async function readPermission(
    scopeKind: InteractionSurfaceKind,
    scopeKey: string,
  ) {
    return database.selectOne<InteractionPermissionRecord>(
      `SELECT scope_kind, scope_key, decision, created_at, updated_at, expires_at
       FROM interaction_permissions
       WHERE scope_kind = $1
         AND scope_key = $2
         AND (expires_at IS NULL OR expires_at > $3)`,
      [scopeKind, normalizeScopeKey(scopeKey), new Date().toISOString()],
    );
  }

  async function listSteps(sessionId: string) {
    const db = await getDatabase();
    return db.select<RedactedInteractionStepWrite[]>(
      `SELECT
         id, session_id AS sessionId, sequence, surface_kind AS surfaceKind,
         action_kind AS actionKind, grounding_kind AS groundingKind,
         consequence, policy_decision AS policyDecision,
         result_status AS resultStatus, retry_count AS retryCount,
         duration_ms AS durationMs, error_code AS errorCode,
         observation_generation AS observationGeneration,
         state_hash_before AS stateHashBefore, state_hash_after AS stateHashAfter,
         started_at AS startedAt, completed_at AS completedAt
       FROM interaction_steps
       WHERE session_id = $1
       ORDER BY sequence`,
      [sessionId],
    );
  }

  async function listAlwaysAllowedApplications(): Promise<AlwaysAllowedApplication[]> {
    const db = await getDatabase();
    const records = await db.select<InteractionPermissionRecord[]>(
      `SELECT scope_kind, scope_key, decision, created_at, updated_at, expires_at
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

  async function deleteExpiredPermissions() {
    const db = await getDatabase();
    return db.execute(
      `DELETE FROM interaction_permissions
       WHERE expires_at IS NOT NULL AND expires_at <= $1`,
      [new Date().toISOString()],
    );
  }

  return {
    deleteExpiredPermissions,
    listAlwaysAllowedApplications,
    listSteps,
    readPermission,
    revokeAlwaysAllowedApplication,
    setPermission,
    upsertSession,
    upsertStep,
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
