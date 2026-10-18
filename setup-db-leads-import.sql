-- setup-db-leads-import.sql
-- Import de lead-uri din spreadsheet-uri (Google Sheets / .csv / .xlsx) — ruta /leads
-- Run this in Neon SQL Editor (la fel ca setup-db-leads.sql)

-- ─── Prerechizită: coloana `source` ──────────────────────────────────────────
-- Separarea /leads (source='sheet') de /lead-generation se bazează pe `source`.
-- Coloana e introdusă de setup-db-followups.sql, care poate să nu fi fost rulat
-- încă pe o bază dată. Definiția e IDENTICĂ acolo și aici, iar ambele folosesc
-- IF NOT EXISTS, deci scriptul care rulează al doilea nu are ce strica.
-- Lead-urile existente devin 'crm' prin DEFAULT — adică exact ce sunt: rezultate
-- ale scanării, care rămân în /lead-generation.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'crm';

-- ─── Coloane venite din spreadsheet, fără corespondent în schema de scanare ───
-- `category` e clasificarea SEO din sheet (1st Page / 2nd Page / Fără website /
-- Advertising) — cel mai bun semnal de calificare pentru lead-urile importate.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS category        TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS address         TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS opening_hours   TEXT;
-- Rating Google: "4.9 (194)" din sheet se sparge în notă + număr de recenzii,
-- ca să se poată filtra și sorta după ele.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rating          NUMERIC(2,1);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reviews_count   INT;
-- Ultimul import care a atins rândul — util pentru audit și pentru
-- „ce a intrat la rularea de ieri".
ALTER TABLE leads ADD COLUMN IF NOT EXISTS import_batch_id UUID;

-- ─── Identitatea unui lead importat ──────────────────────────────────────────
-- Cheia de upsert e (nume, oraș): re-importul aceluiași sheet actualizează
-- rândurile, nu le dublează. Indexul e parțial pe source='sheet' ca să nu
-- constrângă lead-urile scanate sau cele venite din automatizări, unde aceeași
-- firmă poate apărea legitim de mai multe ori.
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_sheet_identity
  ON leads (lower(company_name), lower(coalesce(location, '')))
  WHERE source = 'sheet';

-- ─── Indexuri pentru listarea și filtrarea din /leads ────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_source   ON leads (source);
CREATE INDEX IF NOT EXISTS idx_leads_category ON leads (category) WHERE source = 'sheet';

-- Notă despre volum: căutarea din /leads folosește ILIKE '%...%', care nu poate
-- folosi un index B-tree. La ordinul sutelor/miilor de rânduri e instant. Dacă
-- tabelul trece de ~10k lead-uri, activează pg_trgm și adaugă indexuri GIN:
--   CREATE EXTENSION IF NOT EXISTS pg_trgm;
--   CREATE INDEX idx_leads_company_trgm ON leads USING gin (company_name gin_trgm_ops);
