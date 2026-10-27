-- setup-db-pipeline.sql
-- Pipeline de leaduri: motorul din CRM + importuri externe + evenimente de outreach (/pipeline)
-- Run this in Neon SQL Editor (la fel ca setup-db-leads.sql). Idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Prerechizite: coloane din setup-db-followups.sql ────────────────────────
-- Pe baza de producție setup-db-followups.sql nu a rulat, deci `org_id`,
-- `source_ref` și `service_desired` lipsesc, deși codul (createAutomationLead,
-- tipul Lead) le folosește deja. Definițiile sunt IDENTICE cu cele de acolo și
-- folosesc IF NOT EXISTS, deci scriptul rulat al doilea nu are ce strica.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS org_id          TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS service_desired TEXT;
-- Referință externă unică. Pentru pipeline e cheia lead-ului (de regulă domeniul).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_ref      TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_org ON leads (org_id);

-- Cheia de upsert a pipeline-ului: `ON CONFLICT (source_ref) WHERE source_ref
-- IS NOT NULL`. Indexul e parțial ca lead-urile fără referință (scanate,
-- importate, manuale) să nu fie constrânse. Același nume ca în followups.
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_source_ref
  ON leads (source_ref) WHERE source_ref IS NOT NULL;

-- ─── Coloane noi pentru pipeline ─────────────────────────────────────────────
-- `status` (enum lead_status) rămâne vocabularul general al CRM-ului; etapa
-- detaliată din pipeline (QUEUED_EMAIL, CONTACTED, CALL_BOOKED...) stă separat și se
-- mapează pe `status` în cod (src/services/pipeline/stages.ts).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_stage TEXT;
-- Segmentul ICP calculat de motor (A / B / C)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS segment        TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS icp_match      BOOLEAN;
-- Momentul ultimului eveniment de outreach (trimis, deschis, răspuns...)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_event_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage
  ON leads (pipeline_stage) WHERE source = 'engine';

-- ─── Evenimente de outreach ──────────────────────────────────────────────────
-- Jurnal append-only: evenimentele de outreach (email_sent, email_opened,
-- reply_received...) și schimbările manuale de etapă din CRM (channel='manual').
-- `lead_id` e NULL când evenimentul nu s-a putut potrivi cu niciun lead — îl
-- păstrăm oricum, ca să se vadă ce s-a raportat.
CREATE TABLE IF NOT EXISTS pipeline_events (
  id           BIGSERIAL PRIMARY KEY,
  lead_id      UUID REFERENCES leads (id) ON DELETE CASCADE,
  source_ref   TEXT,
  email        TEXT,
  channel      TEXT,
  event        TEXT NOT NULL,
  stage        TEXT,
  campaign_id  TEXT,
  reply_text   TEXT,
  payload      JSONB,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_events_lead
  ON pipeline_events (lead_id, occurred_at DESC);
