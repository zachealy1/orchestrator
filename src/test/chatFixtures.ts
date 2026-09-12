export function workspaceChatFixture(
  overrides: Partial<{
    id: number;
    workspace_id: number;
    title: string;
    codex_thread_id: string | null;
    origin: "orchestrator" | "codex_external";
    profile_key: `account:${number}` | "default" | null;
    external_thread_id: string | null;
    source_kind: string | null;
    status: string;
    turn_count: number;
    total_tokens: number | null;
    duration_ms: number | null;
    latest_activity_at: string;
    conversation_revision: number;
  }> = {},
) {
  return {
    id: overrides.id ?? 401,
    workspace_id: overrides.workspace_id ?? 1,
    account_id: 7,
    account_label: "dev@example.com",
    account_email: "dev@example.com",
    title: overrides.title ?? "Fix the app",
    codex_thread_id: overrides.codex_thread_id ?? "thread-1",
    origin: overrides.origin ?? "orchestrator",
    profile_key: overrides.profile_key ?? "account:7",
    external_thread_id: overrides.external_thread_id ?? null,
    source_kind: overrides.source_kind ?? null,
    sync_status: "synced",
    external_cwd: null,
    external_created_at: null,
    external_updated_at: null,
    last_synced_at: null,
    status: overrides.status ?? "completed",
    created_at: "2026-06-30T09:00:00Z",
    updated_at: "2026-06-30T09:01:00Z",
    deleted_at: null,
    latest_activity_at: overrides.latest_activity_at ?? "2026-06-30T09:01:00Z",
    turn_count: overrides.turn_count ?? 1,
    total_tokens: overrides.total_tokens ?? 1280,
    duration_ms: overrides.duration_ms ?? 60000,
    latest_model: "GPT-5.5",
    conversation_revision: overrides.conversation_revision ?? 0,
  };
}
