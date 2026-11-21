-- Studio de conținut /socials, faza F1: biblioteca media (fișiere în Vercel Blob)
-- și postări cu mai multe elemente (carusel) sau video (reel).
-- Idempotent; rulează după setup-db-socials.sql.

CREATE TABLE IF NOT EXISTS social_media (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  -- upload = încărcat de noi; template / ai = generat (fazele F4–F5)
  origin      TEXT NOT NULL DEFAULT 'upload' CHECK (origin IN ('upload', 'template', 'ai')),
  -- URL public (Meta descarcă media de aici la publicare)
  url         TEXT NOT NULL,
  pathname    TEXT,
  name        TEXT,
  mime        TEXT,
  size_bytes  INTEGER,
  width       INTEGER,
  height      INTEGER,
  duration_s  REAL,
  -- generare: promptul, furnizorul și costul (F4–F5)
  prompt      TEXT,
  provider    TEXT,
  cost_usd    NUMERIC(10, 4),
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_media_org ON social_media (org_id, created_at DESC);

-- Formatul postării (text, o imagine, carusel, video) și elementele ei, în ordine
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'single';
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS media_ids UUID[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_posts_format_check') THEN
    ALTER TABLE social_posts
      ADD CONSTRAINT social_posts_format_check CHECK (format IN ('text', 'single', 'carousel', 'reel'));
  END IF;
END $$;

-- Postările existente fără imagine sunt doar text
UPDATE social_posts SET format = 'text'
WHERE media_url IS NULL AND cardinality(media_ids) = 0 AND format = 'single';
