-- setup-db-outreach-channels.sql
-- Trimiterea din fișa lead-ului pe toate canalele + ținta zilnică de outreach
-- din cardul „Pitched” (Overview). Idempotent — se poate rula de mai multe ori.
-- Rulează în Neon SQL Editor DUPĂ setup-db-sent-messages.sql și setup-db-outreach.sql.

-- Jurnalul „Mesaje trimise” primește și trimiterile manuale pe Instagram,
-- Facebook și LinkedIn (CRM-ul deschide conversația, trimiterea se înregistrează).
ALTER TABLE sent_messages DROP CONSTRAINT IF EXISTS sent_messages_channel_check;
ALTER TABLE sent_messages ADD CONSTRAINT sent_messages_channel_check CHECK (
  channel IN ('email', 'sms', 'whatsapp', 'instagram', 'facebook', 'linkedin')
);

-- Câte lead-uri vrei să contactezi pe zi (toate canalele). Ținta lunii =
-- ținta zilnică × zilele lunii; se editează din panoul „Outreach” din /pipeline.
ALTER TABLE outreach_settings
  ADD COLUMN IF NOT EXISTS daily_target INT NOT NULL DEFAULT 40;

ALTER TABLE outreach_settings DROP CONSTRAINT IF EXISTS outreach_settings_daily_target_check;
ALTER TABLE outreach_settings ADD CONSTRAINT outreach_settings_daily_target_check CHECK (
  daily_target BETWEEN 0 AND 1000
);

-- Cardul „Pitched” numără trimiterile către lead-uri pe zile
CREATE INDEX IF NOT EXISTS idx_sent_messages_lead_created
  ON sent_messages (created_at) WHERE recipient_type = 'lead';
