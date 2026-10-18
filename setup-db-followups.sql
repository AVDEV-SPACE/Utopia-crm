-- setup-db-followups.sql
-- Modulul AI Follow-Up & WhatsApp Automation
-- Run this in Neon SQL Editor (după setup-db.sql și setup-db-leads.sql)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Setări per organizație (Clerk orgId, sau "user:<clerkUserId>" dacă
--    organizațiile Clerk nu sunt activate pe cont) ───────────────────────────
CREATE TABLE IF NOT EXISTS organization_settings (
  org_id                     TEXT PRIMARY KEY,
  api_key                    TEXT NOT NULL UNIQUE,

  -- SMS automat la apel pierdut
  missed_call_sms_enabled    BOOLEAN NOT NULL DEFAULT false,
  missed_call_sms_message    TEXT NOT NULL DEFAULT '',

  -- Auto-reply AI pe WhatsApp
  whatsapp_ai_enabled        BOOLEAN NOT NULL DEFAULT false,
  whatsapp_system_prompt     TEXT NOT NULL DEFAULT '',
  -- Câte minute așteptăm un agent uman înainte să răspundă AI-ul
  human_takeover_minutes     INT NOT NULL DEFAULT 3 CHECK (human_takeover_minutes BETWEEN 0 AND 1440),

  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_settings_api_key ON organization_settings (api_key);

-- ── Conversații (WhatsApp / SMS) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             TEXT NOT NULL,
  channel            TEXT NOT NULL DEFAULT 'whatsapp'
                     CHECK (channel IN ('whatsapp', 'sms')),
  -- Număr în format E.164, FĂRĂ prefixul `whatsapp:` (normalizat la scriere)
  contact_phone      TEXT NOT NULL,
  wa_id              TEXT,
  contact_name       TEXT,

  -- Preluare de către un operator uman: cât timp e activă, AI-ul tace
  taken_by_human     BOOLEAN NOT NULL DEFAULT false,
  taken_by_human_at  TIMESTAMPTZ,
  taken_by_user_id   TEXT,

  last_message_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id, channel, contact_phone)
);

CREATE INDEX IF NOT EXISTS idx_conversations_org ON conversations (org_id, last_message_at DESC);

-- ── Mesajele din conversații (istoric trimis către Groq) ────────────────────
CREATE TABLE IF NOT EXISTS conversation_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  -- 'user' = clientul, 'assistant' = AI, 'human' = operator uman din CRM
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'human')),
  body             TEXT NOT NULL,
  twilio_sid       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_messages_conversation
  ON conversation_messages (conversation_id, created_at DESC);

-- Idempotență: Twilio poate re-trimite același webhook (retry) — nu vrem
-- să logăm de două ori același mesaj.
CREATE UNIQUE INDEX IF NOT EXISTS uq_conv_messages_twilio_sid
  ON conversation_messages (twilio_sid) WHERE twilio_sid IS NOT NULL;

-- ── Extinderi pe tabela `leads` pentru multi-tenant + sursele noi ───────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS org_id          TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source          TEXT NOT NULL DEFAULT 'crm';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS service_desired TEXT;
-- Referință externă (ex. Twilio CallSid) — cheia de idempotență a webhook-ului
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_ref      TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_org ON leads (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_source_ref
  ON leads (source_ref) WHERE source_ref IS NOT NULL;

-- `status` primește stările noi produse de automatizări.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (
  status IN (
    'new', 'scored', 'pitch_ready', 'sent', 'replied',
    'negotiating', 'won', 'lost',
    'MISSED_CALL', 'WEB_FORM'
  )
);
