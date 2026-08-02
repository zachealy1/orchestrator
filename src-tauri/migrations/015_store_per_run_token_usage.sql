
                ALTER TABLE token_usage_snapshots ADD COLUMN run_tokens INTEGER;
                ALTER TABLE token_usage_snapshots ADD COLUMN run_cached_input_tokens INTEGER;

                UPDATE token_usage_snapshots
                SET
                    run_tokens = MAX(
                        total_tokens - COALESCE((
                            SELECT previous_tokens.total_tokens
                            FROM runs previous_runs
                            JOIN token_usage_snapshots previous_tokens
                              ON previous_tokens.id = (
                                  SELECT MAX(previous_snapshot.id)
                                  FROM token_usage_snapshots previous_snapshot
                                  WHERE previous_snapshot.run_id = previous_runs.id
                              )
                            WHERE previous_runs.codex_thread_id = token_usage_snapshots.thread_id
                              AND previous_runs.id < token_usage_snapshots.run_id
                            ORDER BY previous_runs.id DESC
                            LIMIT 1
                        ), 0),
                        0
                    ),
                    run_cached_input_tokens = MAX(
                        cached_input_tokens - COALESCE((
                            SELECT previous_tokens.cached_input_tokens
                            FROM runs previous_runs
                            JOIN token_usage_snapshots previous_tokens
                              ON previous_tokens.id = (
                                  SELECT MAX(previous_snapshot.id)
                                  FROM token_usage_snapshots previous_snapshot
                                  WHERE previous_snapshot.run_id = previous_runs.id
                              )
                            WHERE previous_runs.codex_thread_id = token_usage_snapshots.thread_id
                              AND previous_runs.id < token_usage_snapshots.run_id
                            ORDER BY previous_runs.id DESC
                            LIMIT 1
                        ), 0),
                        0
                    )
                WHERE token_usage_snapshots.id IN (
                    SELECT MAX(id)
                    FROM token_usage_snapshots
                    GROUP BY run_id
                );
            