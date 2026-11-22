-- setup-db-linkedin.sql
-- LinkedIn în /socials: conexiunea OAuth a paginii de companie (token criptat),
-- postări programate pe LinkedIn și comentariile de la postările paginii în inbox.
-- Run this in Neon SQL Editor (după setup-db-socials.sql și setup-db-content.sql). Idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Conexiunea OAuth (un rând per tenant și furnizor) ───────────────────────
-- Tokenii se păstrează criptați (AES-256-GCM, cheia SOCIAL_TOKEN_KEY din env):
-- o scurgere a bazei de date nu dă acces la pagina LinkedIn.
CREATE TABLE IF NOT EXISTS social_credentials (
  org_id                   TEXT NOT NULL,
  provider                 TEXT NOT NULL CHECK (provider IN ('linkedin')),
  access_token_enc         TEXT NOT NULL,
  access_expires_at        TIMESTAMPTZ NOT NULL,
  -- Programmatic refresh token: doar dacă LinkedIn îl emite aplicației
  refresh_token_enc        TEXT,
  refresh_expires_at       TIMESTAMPTZ,
  scopes                   TEXT NOT NULL DEFAULT '',
  -- Cine a autorizat (adminul paginii) — doar pentru afișare
  member_urn               TEXT,
  member_name              TEXT,
  -- Pagina de companie pe care se publică (urn:li:organization:<id>)
  organization_urn         TEXT NOT NULL,
  connected_by             TEXT,
  -- Ultima sincronizare a comentariilor și ultima eroare (fără tokeni)
  last_sync_at             TIMESTAMPTZ,
  last_error               TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, provider)
);

-- ─── Postări: LinkedIn ca platformă ──────────────────────────────────────────
ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_platform_check;
ALTER TABLE social_posts ADD CONSTRAINT social_posts_platform_check
  CHECK (platform IN ('facebook', 'instagram', 'linkedin'));

-- ─── Conversații: comentariile LinkedIn (persoana = urn:li:person:...) ───────
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_channel_check
  CHECK (channel IN ('whatsapp', 'sms', 'facebook', 'instagram', 'linkedin'));

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_contact_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_contact_check CHECK (
  (channel IN ('whatsapp', 'sms') AND contact_phone IS NOT NULL)
  OR (channel IN ('facebook', 'instagram', 'linkedin') AND external_user_id IS NOT NULL)
);
