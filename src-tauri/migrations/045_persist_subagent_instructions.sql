CREATE TABLE IF NOT EXISTS run_subagent_instructions (
    id TEXT PRIMARY KEY,
    subagent_id TEXT NOT NULL,
    run_id INTEGER NOT NULL,
    instruction_kind TEXT NOT NULL CHECK (
        instruction_kind IN ('spawn', 'followup', 'steer')
    ),
    instruction_text TEXT NOT NULL CHECK (length(trim(instruction_text)) > 0),
    created_at TEXT NOT NULL,
    FOREIGN KEY (subagent_id) REFERENCES run_subagents(id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_subagent_instructions_subagent
    ON run_subagent_instructions(subagent_id, created_at, id);

