CREATE TEMP TABLE kanban_pending_requests_v39 AS
SELECT * FROM kanban_pending_requests;

CREATE TEMP TABLE kanban_review_decisions_v39 AS
SELECT * FROM kanban_review_decisions;

CREATE TEMP TABLE kanban_runtime_events_v39 AS
SELECT * FROM kanban_runtime_events;

CREATE TEMP TABLE kanban_plan_results_v39 AS
SELECT * FROM kanban_plan_results;

DELETE FROM kanban_pending_requests;
DELETE FROM kanban_review_decisions;
DELETE FROM kanban_runtime_events;
DELETE FROM kanban_plan_results;

CREATE TABLE kanban_attempts_v39 (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    generation INTEGER NOT NULL,
    attempt_kind TEXT NOT NULL
        CHECK (attempt_kind IN (
            'start', 'retry', 'resume', 'request_changes', 'implement_plan'
        )),
    status TEXT NOT NULL
        CHECK (status IN (
            'provisioning', 'starting', 'running', 'waiting_user',
            'waiting_approval', 'pause_requested', 'paused',
            'stop_requested', 'stopped', 'blocked', 'failed',
            'interrupted', 'completed'
        )),
    prompt TEXT NOT NULL,
    config_snapshot_json TEXT NOT NULL,
    run_id INTEGER,
    task_id INTEGER,
    thread_id TEXT,
    turn_id TEXT,
    execution_root TEXT,
    recoverable INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    last_event_sequence INTEGER NOT NULL DEFAULT 0,
    UNIQUE (card_id, generation),
    FOREIGN KEY (card_id) REFERENCES kanban_cards(id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

INSERT INTO kanban_attempts_v39 (
    id, card_id, generation, attempt_kind, status, prompt,
    config_snapshot_json, run_id, task_id, thread_id, turn_id,
    execution_root, recoverable, error, started_at, updated_at,
    completed_at, last_event_sequence
)
SELECT
    id, card_id, generation, attempt_kind, status, prompt,
    config_snapshot_json, run_id, task_id, thread_id, turn_id,
    execution_root, recoverable, error, started_at, updated_at,
    completed_at, last_event_sequence
FROM kanban_attempts;

DROP TABLE kanban_attempts;
ALTER TABLE kanban_attempts_v39 RENAME TO kanban_attempts;

CREATE UNIQUE INDEX idx_kanban_attempt_one_active
    ON kanban_attempts(card_id)
    WHERE status IN (
        'provisioning', 'starting', 'running', 'waiting_user',
        'waiting_approval', 'pause_requested', 'stop_requested'
    );

CREATE INDEX idx_kanban_attempts_card_generation
    ON kanban_attempts(card_id, generation DESC);

INSERT INTO kanban_pending_requests (
    id, card_id, attempt_id, request_kind, request_key, payload_json,
    status, resolution_json, created_at, resolved_at
)
SELECT
    id, card_id, attempt_id, request_kind, request_key, payload_json,
    status, resolution_json, created_at, resolved_at
FROM kanban_pending_requests_v39;

INSERT INTO kanban_review_decisions (
    id, card_id, attempt_id, decision, message, created_at
)
SELECT id, card_id, attempt_id, decision, message, created_at
FROM kanban_review_decisions_v39;

INSERT INTO kanban_runtime_events (
    id, card_id, attempt_id, generation, sequence, event_key,
    event_type, payload_json, applied, created_at
)
SELECT
    id, card_id, attempt_id, generation, sequence, event_key,
    event_type, payload_json, applied, created_at
FROM kanban_runtime_events_v39;

INSERT INTO kanban_plan_results (
    attempt_id, card_id, run_id, plan_item_id, plan_text, decision,
    generated_card_id, created_at, updated_at, decided_at
)
SELECT
    attempt_id, card_id, run_id, plan_item_id, plan_text, decision,
    generated_card_id, created_at, updated_at, decided_at
FROM kanban_plan_results_v39;

DROP TABLE kanban_pending_requests_v39;
DROP TABLE kanban_review_decisions_v39;
DROP TABLE kanban_runtime_events_v39;
DROP TABLE kanban_plan_results_v39;
