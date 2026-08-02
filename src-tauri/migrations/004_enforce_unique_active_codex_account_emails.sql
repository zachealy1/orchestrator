
                UPDATE codex_accounts AS duplicate
                SET
                    status = 'signed_out',
                    last_error = 'Duplicate account consolidated',
                    updated_at = CURRENT_TIMESTAMP,
                    deleted_at = CURRENT_TIMESTAMP
                WHERE duplicate.deleted_at IS NULL
                  AND duplicate.email IS NOT NULL
                  AND TRIM(duplicate.email) <> ''
                  AND EXISTS (
                      SELECT 1
                      FROM codex_accounts AS keeper
                      WHERE keeper.deleted_at IS NULL
                        AND keeper.id <> duplicate.id
                        AND LOWER(TRIM(keeper.email)) = LOWER(TRIM(duplicate.email))
                        AND (
                            COALESCE(
                                keeper.last_used_at,
                                keeper.updated_at,
                                keeper.created_at
                            ) > COALESCE(
                                duplicate.last_used_at,
                                duplicate.updated_at,
                                duplicate.created_at
                            )
                            OR (
                                COALESCE(
                                    keeper.last_used_at,
                                    keeper.updated_at,
                                    keeper.created_at
                                ) = COALESCE(
                                    duplicate.last_used_at,
                                    duplicate.updated_at,
                                    duplicate.created_at
                                )
                                AND keeper.id > duplicate.id
                            )
                        )
                  );

                UPDATE workspaces
                SET default_account_id = NULL
                WHERE default_account_id IN (
                    SELECT id
                    FROM codex_accounts
                    WHERE deleted_at IS NOT NULL
                      AND last_error = 'Duplicate account consolidated'
                );

                CREATE UNIQUE INDEX IF NOT EXISTS idx_codex_accounts_unique_active_email
                    ON codex_accounts(LOWER(TRIM(email)))
                    WHERE deleted_at IS NULL
                      AND email IS NOT NULL
                      AND TRIM(email) <> '';
            