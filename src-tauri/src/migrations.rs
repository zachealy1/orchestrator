use tauri_plugin_sql::{Migration, MigrationKind};

#[derive(Debug, Clone, Copy)]
pub(crate) struct MigrationDefinition {
    pub(crate) version: i64,
    pub(crate) description: &'static str,
    pub(crate) sql: &'static str,
    pub(crate) checksum: u64,
}

pub(crate) const MIGRATION_DEFINITIONS: &[MigrationDefinition] = &[
    MigrationDefinition {
        version: 1,
        description: "remove_starter_notes_table",
        sql: include_str!("../migrations/001_remove_starter_notes_table.sql"),
        checksum: 0xcb820dad6047f7ed,
    },
    MigrationDefinition {
        version: 2,
        description: "create_orchestrator_tables",
        sql: include_str!("../migrations/002_create_orchestrator_tables.sql"),
        checksum: 0x8ec772d5f3a274fc,
    },
    MigrationDefinition {
        version: 3,
        description: "add_multi_account_codex_profiles",
        sql: include_str!("../migrations/003_add_multi_account_codex_profiles.sql"),
        checksum: 0x20a040e6f49af65d,
    },
    MigrationDefinition {
        version: 4,
        description: "enforce_unique_active_codex_account_emails",
        sql: include_str!("../migrations/004_enforce_unique_active_codex_account_emails.sql"),
        checksum: 0xf20d50ce9099ce2b,
    },
    MigrationDefinition {
        version: 5,
        description: "soft_delete_workspaces",
        sql: include_str!("../migrations/005_soft_delete_workspaces.sql"),
        checksum: 0xdbd958535d9dbe54,
    },
    MigrationDefinition {
        version: 6,
        description: "add_archived_runs",
        sql: include_str!("../migrations/006_add_archived_runs.sql"),
        checksum: 0x7de05a2754f2e70d,
    },
    MigrationDefinition {
        version: 7,
        description: "soft_delete_runs",
        sql: include_str!("../migrations/007_soft_delete_runs.sql"),
        checksum: 0xe925ab025c2b3484,
    },
    MigrationDefinition {
        version: 8,
        description: "create_chats_for_threaded_history",
        sql: include_str!("../migrations/008_create_chats_for_threaded_history.sql"),
        checksum: 0xf1c43f5dd230d76b,
    },
    MigrationDefinition {
        version: 9,
        description: "add_external_codex_chats",
        sql: include_str!("../migrations/009_add_external_codex_chats.sql"),
        checksum: 0xbd3ebe187b3dd936,
    },
    MigrationDefinition {
        version: 10,
        description: "cache_external_chat_history_indexes",
        sql: include_str!("../migrations/010_cache_external_chat_history_indexes.sql"),
        checksum: 0x7ce56d432a25a116,
    },
    MigrationDefinition {
        version: 11,
        description: "cache_external_chat_transcript_snapshots",
        sql: include_str!("../migrations/011_cache_external_chat_transcript_snapshots.sql"),
        checksum: 0x6cd7bac3cea2af97,
    },
    MigrationDefinition {
        version: 12,
        description: "add_external_transcript_turn_errors",
        sql: include_str!("../migrations/012_add_external_transcript_turn_errors.sql"),
        checksum: 0xd9e60b4acf3d3d07,
    },
    MigrationDefinition {
        version: 13,
        description: "persist_native_plan_mode_workflows",
        sql: include_str!("../migrations/013_persist_native_plan_mode_workflows.sql"),
        checksum: 0xcabb2c60a148d348,
    },
    MigrationDefinition {
        version: 14,
        description: "separate_active_context_usage",
        sql: include_str!("../migrations/014_separate_active_context_usage.sql"),
        checksum: 0xc0f2afa985cf0a03,
    },
    MigrationDefinition {
        version: 15,
        description: "store_per_run_token_usage",
        sql: include_str!("../migrations/015_store_per_run_token_usage.sql"),
        checksum: 0x89106266e73935f5,
    },
    MigrationDefinition {
        version: 16,
        description: "persist_ai_chat_title_generation",
        sql: include_str!("../migrations/016_persist_ai_chat_title_generation.sql"),
        checksum: 0x7cf050c4bf582275,
    },
    MigrationDefinition {
        version: 17,
        description: "persist_run_execution_settings",
        sql: include_str!("../migrations/017_persist_run_execution_settings.sql"),
        checksum: 0xf9547d1e059f2893,
    },
    MigrationDefinition {
        version: 18,
        description: "persist_run_web_previews",
        sql: include_str!("../migrations/018_persist_run_web_previews.sql"),
        checksum: 0xdd590de1c89d3fdc,
    },
    MigrationDefinition {
        version: 19,
        description: "preserve_adopted_external_chat_identity",
        sql: include_str!("../migrations/019_preserve_adopted_external_chat_identity.sql"),
        checksum: 0x13f86b1afe0e49ce,
    },
    MigrationDefinition {
        version: 20,
        description: "repair_per_run_cached_token_usage",
        sql: include_str!("../migrations/020_repair_per_run_cached_token_usage.sql"),
        checksum: 0x0c67203e07c0e983,
    },
    MigrationDefinition {
        version: 21,
        description: "persist_prompt_queue",
        sql: include_str!("../migrations/021_persist_prompt_queue.sql"),
        checksum: 0x3f9ee95efe7053d6,
    },
    MigrationDefinition {
        version: 22,
        description: "add_prompt_queue_conversation_revision",
        sql: include_str!("../migrations/022_add_prompt_queue_conversation_revision.sql"),
        checksum: 0xf7bc8d5ac3da6084,
    },
    MigrationDefinition {
        version: 23,
        description: "add_prompt_queue_auto_send",
        sql: include_str!("../migrations/023_add_prompt_queue_auto_send.sql"),
        checksum: 0x45b3eb9d7fa13910,
    },
    MigrationDefinition {
        version: 24,
        description: "persist_run_subagents",
        sql: include_str!("../migrations/024_persist_run_subagents.sql"),
        checksum: 0x74fcf128cb305ba0,
    },
    MigrationDefinition {
        version: 25,
        description: "remember_selected_git_repository",
        sql: include_str!("../migrations/025_remember_selected_git_repository.sql"),
        checksum: 0x77e2683b306c6f03,
    },
    MigrationDefinition {
        version: 26,
        description: "add_workspace_kanban_boards",
        sql: include_str!("../migrations/026_add_workspace_kanban_boards.sql"),
        checksum: 0x96627537dcf45a60,
    },
    MigrationDefinition {
        version: 27,
        description: "add_kanban_execution_and_recovery",
        sql: include_str!("../migrations/027_add_kanban_execution_and_recovery.sql"),
        checksum: 0x1f217d672827b6da,
    },
    MigrationDefinition {
        version: 28,
        description: "persist_complete_kanban_git_bindings",
        sql: include_str!("../migrations/028_persist_complete_kanban_git_bindings.sql"),
        checksum: 0x4a7121132e2183a9,
    },
    MigrationDefinition {
        version: 29,
        description: "add_opt_in_kanban_conversation_context",
        sql: include_str!("../migrations/029_add_opt_in_kanban_conversation_context.sql"),
        checksum: 0x440fe1f50526b717,
    },
    MigrationDefinition {
        version: 30,
        description: "harden_kanban_operation_and_event_ordering",
        sql: include_str!("../migrations/030_harden_kanban_operation_and_event_ordering.sql"),
        checksum: 0x08aa98ad8752da6e,
    },
    MigrationDefinition {
        version: 31,
        description: "persist_kanban_execution_settings",
        sql: include_str!("../migrations/031_persist_kanban_execution_settings.sql"),
        checksum: 0xbd6fb3f458dfbe30,
    },
    MigrationDefinition {
        version: 32,
        description: "add_github_pull_request_publication",
        sql: include_str!("../migrations/032_add_github_pull_request_publication.sql"),
        checksum: 0x54445c5ba6e87778,
    },
    MigrationDefinition {
        version: 33,
        description: "add_local_kanban_review",
        sql: include_str!("../migrations/033_add_local_kanban_review.sql"),
        checksum: 0x1936deacf486df28,
    },
    MigrationDefinition {
        version: 34,
        description: "add_local_review_merge_lifecycle",
        sql: include_str!("../migrations/034_add_local_review_merge_lifecycle.sql"),
        checksum: 0xc7319e33ce0d47df,
    },
    MigrationDefinition {
        version: 35,
        description: "add_chat_continuations",
        sql: include_str!("../migrations/035_add_chat_continuations.sql"),
        checksum: 0x3260bd2173e147fe,
    },
    MigrationDefinition {
        version: 36,
        description: "share_default_codex_threads",
        sql: include_str!("../migrations/036_share_default_codex_threads.sql"),
        checksum: 0xc9bf9cb5a7622fe1,
    },
    MigrationDefinition {
        version: 37,
        description: "add_kanban_plan_results",
        sql: include_str!("../migrations/037_add_kanban_plan_results.sql"),
        checksum: 0xd46677b692f1ed31,
    },
    MigrationDefinition {
        version: 38,
        description: "remove_invalid_root_subagents",
        sql: include_str!("../migrations/038_remove_invalid_root_subagents.sql"),
        checksum: 0x8464d1c957030e0f,
    },
    MigrationDefinition {
        version: 39,
        description: "allow_kanban_plan_implementation_attempts",
        sql: include_str!("../migrations/039_allow_kanban_plan_implementation_attempts.sql"),
        checksum: 0x96a026ba44efbcff,
    },
    MigrationDefinition {
        version: 40,
        description: "bind_kanban_chats_to_native_projects",
        sql: include_str!("../migrations/040_bind_kanban_chats_to_native_projects.sql"),
        checksum: 0xaab7a4d278bca67c,
    },
    MigrationDefinition {
        version: 41,
        description: "default_kanban_workspaces_to_shared_profile",
        sql: include_str!("../migrations/041_default_kanban_workspaces_to_shared_profile.sql"),
        checksum: 0xbeeda1977f6613f7,
    },
    MigrationDefinition {
        version: 42,
        description: "reconcile_native_task_source_roots",
        sql: include_str!("../migrations/042_reconcile_native_task_source_roots.sql"),
        checksum: 0x996443c3b068ca75,
    },
    MigrationDefinition {
        version: 43,
        description: "repair_stuck_kanban_follow_up_plans",
        sql: include_str!("../migrations/043_repair_stuck_kanban_follow_up_plans.sql"),
        checksum: 0xd8e9ef08130503be,
    },
    MigrationDefinition {
        version: 44,
        description: "add_interaction_audit_ledger",
        sql: include_str!("../migrations/044_add_interaction_audit_ledger.sql"),
        checksum: 0x534464cebbeed22b,
    },
    MigrationDefinition {
        version: 45,
        description: "persist_subagent_instructions",
        sql: include_str!("../migrations/045_persist_subagent_instructions.sql"),
        checksum: 0x6764b62d616c948c,
    },
    MigrationDefinition {
        version: 46,
        description: "recover_plain_kanban_plan_results",
        sql: include_str!("../migrations/046_recover_plain_kanban_plan_results.sql"),
        checksum: 0x2c5b7b9c3d06e525,
    },
];

pub(crate) fn migration_sql(definition: &MigrationDefinition) -> &'static str {
    // SQL resources extracted from Rust string literals may carry the editor's
    // terminal newline. Exclude only that file terminator so the SQL passed to
    // the migration plugin remains byte-for-byte identical to the shipped
    // inline migration string.
    definition.sql.strip_suffix('\n').unwrap_or(definition.sql)
}

pub(crate) fn migrations() -> Vec<Migration> {
    MIGRATION_DEFINITIONS
        .iter()
        .map(|definition| {
            assert_eq!(
                migration_checksum(migration_sql(definition)),
                definition.checksum,
                "applied migration {} was modified",
                definition.version,
            );
            Migration {
                version: definition.version,
                description: definition.description,
                sql: migration_sql(definition),
                kind: MigrationKind::Up,
            }
        })
        .collect()
}

pub(crate) fn migration_checksum(sql: &str) -> u64 {
    sql.as_bytes()
        .iter()
        .fold(0xcbf29ce484222325_u64, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn applied_migration_files_match_the_immutable_manifest() {
        let mut versions = HashSet::new();
        for (index, definition) in MIGRATION_DEFINITIONS.iter().enumerate() {
            assert!(
                versions.insert(definition.version),
                "duplicate migration {}",
                definition.version
            );
            assert_eq!(
                definition.version,
                (index + 1) as i64,
                "migration versions must remain ordered and contiguous"
            );
            assert_eq!(
                migration_checksum(migration_sql(definition)),
                definition.checksum,
                "migration {} was modified",
                definition.version
            );
        }
    }
}
