ALTER TABLE kanban_local_reviews
    ADD COLUMN merge_started INTEGER NOT NULL DEFAULT 0
    CHECK (merge_started IN (0, 1));
