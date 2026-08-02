
                ALTER TABLE token_usage_snapshots ADD COLUMN context_tokens INTEGER;

                UPDATE token_usage_snapshots
                SET context_tokens = (
                    SELECT CAST(json_extract(run_events.payload_json, '$.params.tokenUsage.last.totalTokens') AS INTEGER)
                    FROM run_events
                    WHERE run_events.run_id = token_usage_snapshots.run_id
                      AND run_events.method = 'thread/tokenUsage/updated'
                      AND json_valid(run_events.payload_json)
                      AND json_extract(run_events.payload_json, '$.params.tokenUsage.last.totalTokens') IS NOT NULL
                    ORDER BY run_events.sequence DESC, run_events.id DESC
                    LIMIT 1
                )
                WHERE token_usage_snapshots.id IN (
                    SELECT MAX(id)
                    FROM token_usage_snapshots
                    GROUP BY run_id
                );
            