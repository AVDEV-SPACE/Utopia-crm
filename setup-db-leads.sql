-- setup-db-leads.sql
-- Modulul Lead Generation & Sales Automation
-- Run this in Neon SQL Editor (la fel ca setup-db.sql)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS leads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name        TEXT NOT NULL,
  website             TEXT,
  niche               TEXT,
  location            TEXT,
  score               INT CHECK (score BETWEEN 0 AND 100),
  score_details        JSONB,
  contact_email        TEXT,
  contact_instagram    TEXT,
  contact_phone        TEXT,
  pitch_generated      TEXT,
  pitch_subject        TEXT, -- subiect email (hook, generat pe baza celei mai relevante probleme)
  pitch_channel        TEXT NOT NULL DEFAULT 'email'
                       CHECK (pitch_channel IN ('email', 'instagram', 'whatsapp')),
  status              TEXT NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new', 'scored', 'pitch_ready', 'sent', 'replied', 'negotiating', 'won', 'lost')),
  payment_link        TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);

-- Rate limiting generic (folosit pt /api/leads/scan — max 1 request/10s)
CREATE TABLE IF NOT EXISTS rate_limits (
  key              TEXT PRIMARY KEY,
  last_request_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
