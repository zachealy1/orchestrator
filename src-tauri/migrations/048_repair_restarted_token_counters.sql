-- Resuming a thread can reset the engine's cumulative counters. A first report
-- whose total equals its last request proves that this run started at zero.
-- Missing baselines can also be recovered from that first request's delta.
WITH usage_events AS (
    SELECT run_id, sequence, id,
           CASE WHEN json_valid(payload_json) THEN payload_json ELSE '{}' END AS payload
    FROM run_events
    WHERE method = 'thread/tokenUsage/updated'
), reports AS (
    SELECT run_id, sequence, id,
           json_extract(payload, '$.params.threadId') AS thread_id,
           json_extract(payload, '$.params.tokenUsage.total.totalTokens') AS total,
           json_extract(payload, '$.params.tokenUsage.last.totalTokens') AS last,
           json_extract(payload, '$.params.tokenUsage.total.cachedInputTokens') AS cached,
           json_extract(payload, '$.params.tokenUsage.last.cachedInputTokens') AS last_cached
    FROM usage_events
), ordered_reports AS (
    SELECT *, ROW_NUMBER() OVER (
        PARTITION BY run_id, thread_id ORDER BY sequence, id
    ) AS position
    FROM reports
    WHERE typeof(total) = 'integer' AND typeof(last) = 'integer'
      AND total >= last AND last >= 0
), baselines AS (
    SELECT run_id, thread_id, total = last AS restarted,
           total - last AS start_total,
           CASE
               WHEN total = last THEN 0
               WHEN typeof(cached) = 'integer' AND typeof(last_cached) = 'integer'
                 AND cached >= last_cached AND last_cached >= 0
               THEN cached - last_cached
           END AS start_cached
    FROM ordered_reports WHERE position = 1
)
UPDATE token_usage_snapshots AS snapshot
SET run_tokens = snapshot.total_tokens - baseline.start_total,
    run_cached_input_tokens = CASE
        WHEN snapshot.cached_input_tokens >= baseline.start_cached
        THEN snapshot.cached_input_tokens - baseline.start_cached
    END
FROM baselines AS baseline
WHERE snapshot.run_id = baseline.run_id
  AND snapshot.thread_id IS baseline.thread_id
  AND snapshot.total_tokens >= baseline.start_total
  AND (baseline.restarted OR snapshot.run_tokens IS NULL
       OR (snapshot.run_tokens = 0 AND snapshot.total_tokens > 0));
