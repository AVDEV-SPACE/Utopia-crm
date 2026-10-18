-- setup-db-template-case-types.sql
-- Tipul de caz în care se folosește un șablon (tab-urile din „Opțiuni Trimitere")
-- Run this in Neon SQL Editor (după setup-db.sql)

-- NULL = „Generic". Celelalte valori: 'after_call', 'offer_request',
-- 'follow_up', 'cold_outreach' (vezi CASE_TYPES în
-- src/app/(dashboard)/educational-templates/page.tsx).
-- Fără CHECK: lista de tipuri de caz se poate extinde din cod, iar un `case_type`
-- necunoscut e tratat de UI ca „Generic", nu pierdut.
ALTER TABLE educational_templates
  ADD COLUMN IF NOT EXISTS case_type TEXT;

-- Șabloanele existente rămân cu case_type NULL, deci apar sub „Generic".
-- Nu e nevoie de nicio migrare de date.

CREATE INDEX IF NOT EXISTS idx_educational_templates_case_type
  ON educational_templates (created_by, case_type);
