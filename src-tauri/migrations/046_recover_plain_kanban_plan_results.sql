CREATE TEMP TABLE kanban_plain_plan_repairs_v46 AS
SELECT
    card.id AS card_id,
    card.workspace_id,
    card.chat_id,
    attempt.id AS attempt_id,
    run.id AS run_id,
    run.task_id,
    'recovered-plan-' || run.id AS plan_item_id,
    TRIM(run.final_message) AS plan_text,
    run.completed_at
FROM kanban_cards AS card
JOIN kanban_attempts AS attempt
    ON attempt.id = card.current_attempt_id
JOIN runs AS run
    ON run.id = attempt.run_id
   AND run.chat_id = card.chat_id
WHERE card.deleted_at IS NULL
  AND card.archived_at IS NULL
  AND card.execution_state = 'failed'
  AND attempt.status = 'failed'
  AND run.status = 'failed'
  AND run.collaboration_mode = 'plan'
  AND run.run_intent IN ('plan', 'plan-revision')
  AND run.plan_review_state = 'none'
  AND (run.completed_plan_item_id IS NULL OR LENGTH(TRIM(run.completed_plan_item_id)) = 0)
  AND (run.completed_plan_text IS NULL OR LENGTH(TRIM(run.completed_plan_text)) = 0)
  AND run.final_message IS NOT NULL
  AND LENGTH(TRIM(run.final_message)) > 0
  AND INSTR(
      COALESCE(run.error, ''),
      'Codex completed the Plan-mode card without a reviewable plan.'
  ) > 0
  AND INSTR(
      COALESCE(attempt.error, ''),
      'Codex completed the Plan-mode card without a reviewable plan.'
  ) > 0
  AND NOT EXISTS (
      SELECT 1
      FROM kanban_plan_results AS result
      WHERE result.attempt_id = attempt.id
         OR result.card_id = card.id
  );

INSERT INTO kanban_plan_results (
    attempt_id, card_id, run_id, plan_item_id, plan_text, decision
)
SELECT
    attempt_id, card_id, run_id, plan_item_id, plan_text, 'awaiting_review'
FROM kanban_plain_plan_repairs_v46;

UPDATE runs
SET status = 'completed',
    error = NULL,
    final_message = '',
    collaboration_mode = 'plan',
    run_intent = 'plan',
    completed_plan_item_id = (
        SELECT repair.plan_item_id
        FROM kanban_plain_plan_repairs_v46 AS repair
        WHERE repair.run_id = runs.id
    ),
    completed_plan_text = (
        SELECT repair.plan_text
        FROM kanban_plain_plan_repairs_v46 AS repair
        WHERE repair.run_id = runs.id
    ),
    plan_review_state = 'available'
WHERE id IN (
    SELECT run_id FROM kanban_plain_plan_repairs_v46
);

UPDATE tasks
SET status = 'completed'
WHERE id IN (
    SELECT task_id
    FROM kanban_plain_plan_repairs_v46
    WHERE task_id IS NOT NULL
);

UPDATE chats
SET status = 'completed',
    collaboration_mode = 'plan',
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (
    SELECT chat_id FROM kanban_plain_plan_repairs_v46
);

UPDATE kanban_attempts
SET status = 'completed',
    recoverable = 0,
    error = NULL,
    completed_at = COALESCE(
        (
            SELECT repair.completed_at
            FROM kanban_plain_plan_repairs_v46 AS repair
            WHERE repair.attempt_id = kanban_attempts.id
        ),
        CURRENT_TIMESTAMP
    ),
    last_event_sequence = last_event_sequence + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (
    SELECT attempt_id FROM kanban_plain_plan_repairs_v46
);

UPDATE kanban_cards
SET stage = 'in_review',
    execution_state = 'completed',
    review_state = 'awaiting_review',
    review_channel = NULL,
    last_error = NULL,
    state_version = state_version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (
    SELECT card_id FROM kanban_plain_plan_repairs_v46
);

UPDATE kanban_boards
SET revision = revision + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_id IN (
    SELECT workspace_id FROM kanban_plain_plan_repairs_v46
);

DROP TABLE kanban_plain_plan_repairs_v46;
