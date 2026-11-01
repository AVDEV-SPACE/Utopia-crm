-- setup-db-socials.sql
-- Modulul /socials: Facebook Page + Instagram Business (inbox DM + comentarii,
-- auto-reply AI pe mesajele primite, postări programate).
-- Run this in Neon SQL Editor (după setup-db-pipeline.sql). Idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Prerechizite: tabelele din setup-db-followups.sql ───────────────────────
-- Pe baza de producție setup-db-followups.sql nu a rulat, deci tabelele lipsesc.
-- Definițiile sunt IDENTICE cu cele de acolo și folosesc IF NOT EXISTS: oricare
-- script rulează al doilea, nu are ce strica. Modificările pentru canalele
-- sociale vin mai jos, ca ALTER-uri.

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

CREATE UNIQUE INDEX IF NOT EXISTS uq_conv_messages_twilio_sid
  ON conversation_messages (twilio_sid) WHERE twilio_sid IS NOT NULL;

-- ─── Conversații pe canalele sociale ─────────────────────────────────────────
-- Canalele noi. CHECK-ul se recreează (DROP + ADD), deci rularea repetată e sigură.
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_channel_check
  CHECK (channel IN ('whatsapp', 'sms', 'facebook', 'instagram'));

-- Pe Facebook / Instagram nu există telefon: persoana e PSID-ul / IGSID-ul.
-- UNIQUE (org_id, channel, contact_phone) rămâne valid: în Postgres valorile NULL
-- sunt distincte, deci conversațiile sociale (telefon NULL) nu se ciocnesc între ele,
-- iar getOrCreateConversation (WhatsApp/SMS) trimite mereu un telefon.
ALTER TABLE conversations ALTER COLUMN contact_phone DROP NOT NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS external_user_id TEXT;
-- Lead-ul din CRM al persoanei (creat sau găsit la primul mesaj)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads (id) ON DELETE SET NULL;

-- Fiecare canal are identificatorul lui: telefon pe WhatsApp/SMS, id extern pe social
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_contact_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_contact_check CHECK (
  (channel IN ('whatsapp', 'sms') AND contact_phone IS NOT NULL)
  OR (channel IN ('facebook', 'instagram') AND external_user_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_external_user
  ON conversations (org_id, channel, external_user_id) WHERE external_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_lead ON conversations (lead_id) WHERE lead_id IS NOT NULL;

-- ─── Mesaje: DM-uri și comentarii ────────────────────────────────────────────
-- `external_id`: `mid`-ul DM-ului sau id-ul comentariului — cheia de idempotență
-- (Meta reîncearcă webhook-urile). `external_parent_id`: postarea / media la care
-- e comentariul, sau comentariul-părinte (pentru răspunsul în fir).
ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS external_id        TEXT;
ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS kind               TEXT NOT NULL DEFAULT 'dm';
ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS external_parent_id TEXT;

ALTER TABLE conversation_messages DROP CONSTRAINT IF EXISTS conversation_messages_kind_check;
ALTER TABLE conversation_messages ADD CONSTRAINT conversation_messages_kind_check
  CHECK (kind IN ('dm', 'comment'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_conv_messages_external_id
  ON conversation_messages (external_id) WHERE external_id IS NOT NULL;

-- ─── Setări: auto-reply AI pe social (oprit implicit) ────────────────────────
ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS social_ai_enabled BOOLEAN NOT NULL DEFAULT false;

-- ─── Postări programate pe Facebook / Instagram ──────────────────────────────
-- Ciclul: draft → scheduled → publishing (revendicată de job) → published / failed.
CREATE TABLE IF NOT EXISTS social_posts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT NOT NULL,
  platform          TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  caption           TEXT NOT NULL DEFAULT '',
  -- URL public al imaginii (obligatoriu pe Instagram; opțional pe Facebook)
  media_url         TEXT,
  scheduled_at      TIMESTAMPTZ,
  published_at      TIMESTAMPTZ,
  external_post_id  TEXT,
  error             TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Jobul de publicare: postările programate ajunse la termen
CREATE INDEX IF NOT EXISTS idx_social_posts_due
  ON social_posts (scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_social_posts_org ON social_posts (org_id, created_at DESC);
