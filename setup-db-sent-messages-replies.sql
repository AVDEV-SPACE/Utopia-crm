-- setup-db-sent-messages-replies.sql
-- Legătura cu emailul din Gmail + detectarea răspunsurilor
-- Run this in Neon SQL Editor (după setup-db-sent-messages.sql). Idempotent.

-- Message-ID-ul emailului trimis (din SMTP) — deschide exact mesajul în Gmail
-- și leagă răspunsurile prin In-Reply-To / References
ALTER TABLE sent_messages ADD COLUMN IF NOT EXISTS message_id       TEXT;

-- Primul răspuns primit, găsit prin IMAP în căsuța Gmail
ALTER TABLE sent_messages ADD COLUMN IF NOT EXISTS replied_at       TIMESTAMPTZ;
ALTER TABLE sent_messages ADD COLUMN IF NOT EXISTS reply_message_id TEXT;
ALTER TABLE sent_messages ADD COLUMN IF NOT EXISTS reply_subject    TEXT;
ALTER TABLE sent_messages ADD COLUMN IF NOT EXISTS reply_snippet    TEXT;

-- Sincronizarea caută doar emailurile reușite care încă așteaptă răspuns
CREATE INDEX IF NOT EXISTS idx_sent_messages_awaiting_reply
  ON sent_messages (org_id, created_at DESC)
  WHERE channel = 'email' AND status = 'sent' AND replied_at IS NULL;
