DROP INDEX IF EXISTS idx_runs_client_user_message_id;

CREATE UNIQUE INDEX idx_runs_client_user_message_id
    ON runs(client_user_message_id)
    WHERE client_user_message_id IS NOT NULL
      AND status NOT IN ('failed', 'interrupted');
