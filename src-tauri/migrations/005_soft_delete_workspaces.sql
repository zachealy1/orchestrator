
                ALTER TABLE workspaces ADD COLUMN deleted_at TEXT;

                CREATE INDEX IF NOT EXISTS idx_workspaces_active_last_opened
                    ON workspaces(deleted_at, last_opened_at DESC);
            