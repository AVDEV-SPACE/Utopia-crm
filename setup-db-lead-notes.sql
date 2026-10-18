-- setup-db-lead-notes.sql
-- Istoricul de interacțiuni pe lead (note, apeluri, întâlniri, schimbări de status)
-- Run this in Neon SQL Editor (după setup-db-leads.sql)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS lead_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  -- Clerk orgId, sau "user:<clerkUserId>" (vezi src/lib/tenant.ts)
  org_id      TEXT,
  author_id   TEXT,
  author_name TEXT,

  -- 'status' e generat automat la schimbarea statusului lead-ului,
  -- restul sunt alese de utilizator când scrie nota
  kind        TEXT NOT NULL DEFAULT 'note'
              CHECK (kind IN ('note', 'call', 'meeting', 'email', 'whatsapp', 'status')),
  body        TEXT NOT NULL,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Interogarea principală: toate notele unui lead, cronologic invers
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead
  ON lead_notes (lead_id, created_at DESC);
