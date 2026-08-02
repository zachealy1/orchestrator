
                ALTER TABLE chats ADD COLUMN collaboration_mode TEXT;
                ALTER TABLE chats ADD COLUMN saved_default_collaboration_mode_json TEXT;

                ALTER TABLE runs ADD COLUMN collaboration_mode TEXT;
                ALTER TABLE runs ADD COLUMN run_intent TEXT NOT NULL DEFAULT 'normal';
                ALTER TABLE runs ADD COLUMN client_user_message_id TEXT;
                ALTER TABLE runs ADD COLUMN completed_plan_item_id TEXT;
                ALTER TABLE runs ADD COLUMN completed_plan_text TEXT;
                ALTER TABLE runs ADD COLUMN plan_review_state TEXT NOT NULL DEFAULT 'none';

                CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_client_user_message_id
                    ON runs(client_user_message_id)
                    WHERE client_user_message_id IS NOT NULL;
            