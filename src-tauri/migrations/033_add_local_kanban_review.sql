ALTER TABLE kanban_cards ADD COLUMN review_channel TEXT
    CHECK (review_channel IS NULL OR review_channel IN ('github', 'local'));

CREATE TABLE kanban_local_reviews (
    card_id TEXT NOT NULL,
    source_repository_path TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'committing', 'merging', 'merged', 'nothing_to_merge', 'failed')),
    merge_started INTEGER NOT NULL DEFAULT 0 CHECK (merge_started IN (0, 1)),
    last_error TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (card_id, source_repository_path),
    FOREIGN KEY (card_id) REFERENCES kanban_cards(id) ON DELETE CASCADE
);

UPDATE kanban_cards
SET review_channel = CASE
    WHEN EXISTS (
        SELECT 1 FROM kanban_pull_requests pr
        WHERE pr.card_id = kanban_cards.id
          AND pr.pull_request_number IS NOT NULL
    ) THEN 'github'
    WHEN EXISTS (
        SELECT 1 FROM github_connections connection
        WHERE connection.id = 1 AND connection.status = 'connected'
    ) THEN 'github'
    ELSE 'local'
END
WHERE stage IN ('in_review', 'done') AND review_state != 'none';

DELETE FROM kanban_pull_requests
WHERE pull_request_number IS NULL
  AND card_id IN (
      SELECT id FROM kanban_cards WHERE review_channel = 'local'
  );

CREATE INDEX idx_kanban_local_reviews_status
    ON kanban_local_reviews(card_id, status);
