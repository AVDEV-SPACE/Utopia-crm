-- setup-db-sent-messages.sql
-- Jurnalul mesajelor trimise (email / SMS / WhatsApp)
-- Run this in Neon SQL Editor (după setup-db.sql și setup-db-leads.sql)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sent_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Clerk orgId, sau "user:<clerkUserId>" (vezi src/lib/tenant.ts)
  org_id          TEXT,
  sent_by         TEXT,

  channel         TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  -- 'lead' = destinatar din tabela `leads`, 'client' = din contacts/bookings
  recipient_type  TEXT NOT NULL DEFAULT 'client' CHECK (recipient_type IN ('lead', 'client')),
  -- Fără FK: jurnalul rămâne intact dacă lead-ul e șters ulterior
  lead_id         UUID,
  recipient_name  TEXT,
  recipient_email TEXT,
  recipient_phone TEXT,

  -- TEXT, nu FK: id-ul șablonului e SERIAL, dar șablonul poate fi șters,
  -- iar pitch-urile de lead nu au deloc șablon
  template_id     TEXT,
  template_title  TEXT,
  subject         TEXT,
  body            TEXT NOT NULL,

  status          TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sent_messages_org
  ON sent_messages (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sent_messages_lead
  ON sent_messages (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sent_messages_channel
  ON sent_messages (channel, created_at DESC);
