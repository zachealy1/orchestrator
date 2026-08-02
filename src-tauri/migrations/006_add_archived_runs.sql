
                ALTER TABLE runs ADD COLUMN archived_at TEXT;
                CREATE INDEX IF NOT EXISTS idx_runs_workspace_archive_started
                    ON runs(workspace_id, archived_at, started_at DESC);
            