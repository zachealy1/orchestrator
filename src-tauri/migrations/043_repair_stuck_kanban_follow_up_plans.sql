CREATE TEMP TABLE kanban_follow_up_plan_repairs_v43 AS
SELECT
    card.id AS card_id,
    card.workspace_id,
    attempt.id AS attempt_id,
    run.id AS run_id,
    run.completed_plan_item_id AS plan_item_id,
    run.completed_plan_text AS plan_text,
    run.execution_settings_json,
    run.completed_at
FROM kanban_cards AS card
JOIN kanban_attempts AS attempt
    ON attempt.id = card.current_attempt_id
JOIN runs AS run
    ON run.id = attempt.run_id
   AND run.chat_id = card.chat_id
WHERE card.deleted_at IS NULL
  AND card.archived_at IS NULL
  AND card.stage = 'in_progress'
  AND card.execution_state IN (
      'starting', 'running', 'waiting_user', 'waiting_approval'
  )
  AND attempt.status IN (
      'provisioning', 'starting', 'running', 'waiting_user',
      'waiting_approval', 'pause_requested', 'stop_requested'
  )
  AND run.status = 'completed'
  AND run.collaboration_mode = 'plan'
  AND run.run_intent IN ('plan', 'plan-revision')
  AND run.plan_review_state = 'available'
  AND run.completed_plan_item_id IS NOT NULL
  AND LENGTH(TRIM(run.completed_plan_item_id)) > 0
  AND run.completed_plan_text IS NOT NULL
  AND LENGTH(TRIM(run.completed_plan_text)) > 0
  AND run.execution_settings_json IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM kanban_plan_results AS result
      WHERE result.attempt_id = attempt.id
  );

INSERT INTO kanban_plan_results (
    attempt_id, card_id, run_id, plan_item_id, plan_text, decision
)
SELECT
    attempt_id, card_id, run_id, plan_item_id, plan_text, 'awaiting_review'
FROM kanban_follow_up_plan_repairs_v43;

UPDATE kanban_attempts
SET status = 'completed',
    recoverable = 0,
    error = NULL,
    completed_at = COALESCE(
        (
            SELECT repair.completed_at
            FROM kanban_follow_up_plan_repairs_v43 AS repair
            WHERE repair.attempt_id = kanban_attempts.id
        ),
        CURRENT_TIMESTAMP
    ),
    last_event_sequence = last_event_sequence + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (
    SELECT attempt_id FROM kanban_follow_up_plan_repairs_v43
);

UPDATE kanban_cards
SET stage = 'in_review',
    execution_state = 'completed',
    review_state = 'awaiting_review',
    review_channel = NULL,
    execution_settings_json = (
        SELECT CASE
            WHEN kanban_cards.execution_settings_json IS NULL
                THEN repair.execution_settings_json
            ELSE json_set(
                repair.execution_settings_json,
                '$.selectedRepositoryPath',
                json_extract(
                    kanban_cards.execution_settings_json,
                    '$.selectedRepositoryPath'
                ),
                '$.selectedBranch',
                json_extract(
                    kanban_cards.execution_settings_json,
                    '$.selectedBranch'
                )
            )
        END
        FROM kanban_follow_up_plan_repairs_v43 AS repair
        WHERE repair.card_id = kanban_cards.id
    ),
    last_error = NULL,
    state_version = state_version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (
    SELECT card_id FROM kanban_follow_up_plan_repairs_v43
);

UPDATE kanban_boards
SET revision = revision + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_id IN (
    SELECT workspace_id FROM kanban_follow_up_plan_repairs_v43
);

DROP TABLE kanban_follow_up_plan_repairs_v43;
