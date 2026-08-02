
                ALTER TABLE prompt_queue_items
                    ADD COLUMN conversation_revision INTEGER NOT NULL DEFAULT 0;
            