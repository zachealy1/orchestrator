CREATE TABLE IF NOT EXISTS kanban_plan_results (
    attempt_id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    run_id INTEGER NOT NULL,
    plan_item_id TEXT NOT NULL,
    plan_text TEXT NOT NULL,
    decision TEXT NOT NULL DEFAULT 'awaiting_review'
        CHECK (decision IN ('awaiting_review', 'superseded', 'accepted', 'rejected')),
    generated_card_id TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at TEXT,
    UNIQUE (card_id, run_id),
    FOREIGN KEY (attempt_id) REFERENCES kanban_attempts(id) ON DELETE CASCADE,
    FOREIGN KEY (card_id) REFERENCES kanban_cards(id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
    FOREIGN KEY (generated_card_id) REFERENCES kanban_cards(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kanban_plan_one_awaiting_review
    ON kanban_plan_results(card_id)
    WHERE decision = 'awaiting_review';

CREATE INDEX IF NOT EXISTS idx_kanban_plan_generated_card
    ON kanban_plan_results(generated_card_id)
    WHERE generated_card_id IS NOT NULL;
