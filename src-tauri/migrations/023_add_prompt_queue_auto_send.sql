
                ALTER TABLE prompt_queue_items
                    ADD COLUMN auto_send_enabled INTEGER NOT NULL DEFAULT 1;
            