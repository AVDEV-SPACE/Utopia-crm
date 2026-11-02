-- Preluarea de către om a conversațiilor cu agentul de pe site (/messaging).
-- Cât timp `taken_by_human` e true, /api/chat/llm de pe site nu mai răspunde,
-- iar mesajele operatorului se salvează cu role = 'human' și ajung în widget prin polling.

BEGIN;

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS taken_by_human BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ;

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_role_check;
ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_role_check CHECK (role IN ('user', 'assistant', 'human'));

COMMIT;
