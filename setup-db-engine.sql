-- setup-db-engine.sql
-- Motorul de leaduri din CRM: descoperire (OSM / Meta Ad Library / CSV),
-- îmbogățire (site + semnale) și scor + pitch cu Groq. Vezi src/services/engine.
-- Run this in Neon SQL Editor DUPĂ setup-db-pipeline.sql. Idempotent.

-- ─── Setări (o singură linie, editabilă din /pipeline) ───────────────────────
CREATE TABLE IF NOT EXISTS engine_settings (
  id               SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Nișele se traduc în tag-uri OSM prin src/services/leads/osm-categories.ts
  niches           TEXT[] NOT NULL DEFAULT ARRAY[
                     'dentist', 'clinica', 'beauty', 'hairdresser', 'fitness', 'avocat',
                     'imobiliare', 'service auto', 'restaurant', 'veterinar', 'hotel'
                   ],
  cities           TEXT[] NOT NULL DEFAULT ARRAY['Oradea'],
  -- NULL = valoarea din env ENGINE_MAX_NEW_LEADS_PER_DAY (implicit 150)
  max_new_per_day  INT CHECK (max_new_per_day BETWEEN 0 AND 2000),
  -- Câte lead-uri procesează o rulare de enrich (plafonat și de durata funcției)
  enrich_batch     INT NOT NULL DEFAULT 8 CHECK (enrich_batch BETWEEN 1 AND 20),
  -- Sub acest scor ICP lead-ul devine DISQUALIFIED
  min_score        INT NOT NULL DEFAULT 50 CHECK (min_score BETWEEN 0 AND 100),
  -- Cursorul de rotație peste perechile nișă × oraș (index în produsul cartezian)
  cursor_pos       INT NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO engine_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─── Jurnalul rulărilor ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS engine_runs (
  id           BIGSERIAL PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('discover', 'enrich', 'import')),
  -- 'cron' (programat) sau 'manual' (buton din /pipeline)
  trigger      TEXT NOT NULL DEFAULT 'cron',
  -- Ce a procesat rularea (ex. { niche, city } la discover)
  params       JSONB,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  found        INT NOT NULL DEFAULT 0,
  inserted     INT NOT NULL DEFAULT 0,
  processed    INT NOT NULL DEFAULT 0,
  errors       JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_engine_runs_started ON engine_runs (started_at DESC);

-- ─── Coloane pe leads pentru coada motorului ─────────────────────────────────
-- Domeniul site-ului, calculat de Postgres din `website` („https://www.x.ro/a”
-- → „x.ro”). E cheia de deduplicare: lanțurile cu mai multe locații au același
-- site, iar un lead deja importat din sheet nu trebuie readus de motor.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS domain TEXT GENERATED ALWAYS AS (
  NULLIF(lower(regexp_replace(
    regexp_replace(coalesce(website, ''), '^\s*(https?://)?(www\.)?', '', 'i'),
    '[/:?#].*$', ''
  )), '')
) STORED;

CREATE INDEX IF NOT EXISTS idx_leads_domain ON leads (domain) WHERE domain IS NOT NULL;

-- Încercări de scor AI (un lead AI_ERROR se reia de maximum 3 ori)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS engine_attempts   INT NOT NULL DEFAULT 0;
-- Rezervarea unui lead de către o rulare de enrich: două rulări suprapuse nu
-- procesează același lead. O rezervare mai veche de 10 minute expiră.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS engine_claimed_at TIMESTAMPTZ;

-- Coada: lead-urile motorului și cele importate din CSV (source='linkedin')
CREATE INDEX IF NOT EXISTS idx_leads_engine_queue
  ON leads (pipeline_stage, created_at) WHERE source IN ('engine', 'linkedin');
