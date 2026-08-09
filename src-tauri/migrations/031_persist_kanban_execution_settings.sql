ALTER TABLE kanban_cards
ADD COLUMN execution_settings_json TEXT;

CREATE TRIGGER sync_kanban_card_title_from_chat
AFTER UPDATE OF title ON chats
WHEN OLD.title IS NOT NEW.title
  AND EXISTS (
    SELECT 1 FROM kanban_cards WHERE chat_id = NEW.id AND deleted_at IS NULL
  )
BEGIN
  UPDATE kanban_cards
  SET title = NEW.title,
      updated_at = CURRENT_TIMESTAMP
  WHERE chat_id = NEW.id AND deleted_at IS NULL;

  UPDATE kanban_boards
  SET revision = revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE workspace_id IN (
    SELECT workspace_id FROM kanban_cards
    WHERE chat_id = NEW.id AND deleted_at IS NULL
  );
END;
