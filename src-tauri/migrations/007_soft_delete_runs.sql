
                ALTER TABLE runs ADD COLUMN deleted_at TEXT;
                CREATE INDEX IF NOT EXISTS idx_runs_workspace_deleted_started
                    ON runs(workspace_id, deleted_at, started_at DESC);
            