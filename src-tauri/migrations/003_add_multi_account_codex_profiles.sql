
                CREATE TABLE IF NOT EXISTS codex_accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    label TEXT NOT NULL,
                    email TEXT,
                    plan_type TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    last_error TEXT,
                    last_used_at TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    deleted_at TEXT
                );

                ALTER TABLE workspaces
                    ADD COLUMN default_account_id INTEGER
                    REFERENCES codex_accounts(id) ON DELETE SET NULL;

                ALTER TABLE runs
                    ADD COLUMN account_id INTEGER
                    REFERENCES codex_accounts(id) ON DELETE SET NULL;
                ALTER TABLE runs ADD COLUMN account_label TEXT;
                ALTER TABLE runs ADD COLUMN account_email TEXT;

                CREATE INDEX IF NOT EXISTS idx_codex_accounts_active
                    ON codex_accounts(deleted_at, last_used_at DESC);
                CREATE INDEX IF NOT EXISTS idx_runs_account_started
                    ON runs(account_id, started_at DESC);
            