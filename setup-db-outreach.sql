-- setup-db-outreach.sql
-- Faza 2: outreach pe email — secvențe de 3 pași cu plafon, modelul fiecărui
-- pas ales dintre template-urile din `educational_templates` (sau pitch-ul AI),
-- tracking deschideri și dezabonare. Răspunsurile se detectează în tabela
-- existentă `sent_messages` (coloanele replied_at / reply_*).
-- Idempotent — se poate rula de mai multe ori.
-- Rulează în Neon SQL Editor DUPĂ setup-db-pipeline.sql și setup-db-template-case-types.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Pașii secvenței de outreach (email / Instagram / LinkedIn) ─────────────
CREATE TABLE IF NOT EXISTS outreach_tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  channel          TEXT NOT NULL CHECK (channel IN ('email', 'instagram', 'linkedin')),
  step             INT  NOT NULL CHECK (step BETWEEN 1 AND 3),
  -- Modelul pasului: un template (randat la trimitere, deci editările lui se
  -- văd și în pașii deja planificați) sau, cu template_id NULL, textul AI din `message`
  template_id      INT REFERENCES educational_templates (id) ON DELETE SET NULL,
  subject          TEXT,
  message          TEXT,
  due_at           TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'sent', 'skipped', 'replied', 'failed', 'cancelled')),
  sent_at          TIMESTAMPTZ,
  error            TEXT,
  -- Singura autorizare a pixelului de deschidere și a linkului de dezabonare
  tracking_token   TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  -- Message-ID-ul emailului trimis: pașii următori răspund în același fir, iar
  -- răspunsul se leagă de pas prin sent_messages.message_id
  message_id       TEXT,
  opened_at        TIMESTAMPTZ,
  -- Răspunsul la acest pas a fost procesat (clasificat, secvența oprită/amânată)
  reply_handled_at TIMESTAMPTZ,
  reply_intent     TEXT,
  -- Revendicarea la trimitere: două rulări suprapuse nu trimit același pas.
  -- O revendicare mai veche de 10 minute (rulare căzută) expiră.
  claimed_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  -- Fără CHECK „template sau mesaj”: ștergerea unui template folosit (SET NULL)
  -- ar fi blocată. Un pas rămas fără conținut e marcat `failed` la trimitere.
);

-- Un singur pas N pe canal pentru un lead: generatorul poate rula de oricâte ori
CREATE UNIQUE INDEX IF NOT EXISTS uq_outreach_tasks_lead_channel_step
  ON outreach_tasks (lead_id, channel, step);

-- Coada de trimitere: pașii pending ajunși la termen
CREATE INDEX IF NOT EXISTS idx_outreach_tasks_due
  ON outreach_tasks (channel, due_at) WHERE status = 'pending';

-- Plafonul zilnic numără trimiterile de azi
CREATE INDEX IF NOT EXISTS idx_outreach_tasks_sent
  ON outreach_tasks (channel, sent_at) WHERE status = 'sent';

-- Legătura cu sent_messages (răspunsuri) după Message-ID
CREATE INDEX IF NOT EXISTS idx_outreach_tasks_message_id
  ON outreach_tasks (message_id) WHERE message_id IS NOT NULL;

-- ── Modelul ales pentru fiecare pas al secvenței de email ──────────────────
-- Un singur rând (id = 1). NULL = pitch-ul AI al lead-ului (pasul 1) sau
-- follow-up generat de AI (pașii 2–3). Un template șters revine la AI.
CREATE TABLE IF NOT EXISTS outreach_settings (
  id                 INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  step1_template_id  INT REFERENCES educational_templates (id) ON DELETE SET NULL,
  step2_template_id  INT REFERENCES educational_templates (id) ON DELETE SET NULL,
  step3_template_id  INT REFERENCES educational_templates (id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO outreach_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Răspunsurile din sent_messages care încă nu au fost procesate de outreach
CREATE INDEX IF NOT EXISTS idx_sent_messages_message_id
  ON sent_messages (message_id) WHERE message_id IS NOT NULL;
