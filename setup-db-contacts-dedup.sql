-- Comasează contactele duplicate (același email) și impune un singur contact per email.
-- Site-ul crea câte un contact la fiecare formular, iar /bookings afișa câte un rând
-- pentru fiecare duplicat. Se păstrează cel mai vechi contact; câmpurile lipsă se
-- completează din duplicate, iar activitățile sunt mutate pe contactul păstrat.

BEGIN;

CREATE TABLE IF NOT EXISTS contacts_backup_20261102 AS SELECT * FROM contacts;

CREATE TEMP TABLE contact_merge ON COMMIT DROP AS
SELECT id, keeper_id
FROM (
  SELECT
    id,
    FIRST_VALUE(id) OVER (PARTITION BY LOWER(email) ORDER BY created_at, id) AS keeper_id
  FROM contacts
) t
WHERE id <> keeper_id;

UPDATE contacts k
SET phone        = COALESCE(k.phone, d.phone),
    company_name = COALESCE(k.company_name, d.company_name)
FROM (
  SELECT
    m.keeper_id,
    (ARRAY_AGG(c.phone ORDER BY c.created_at DESC) FILTER (WHERE c.phone IS NOT NULL))[1] AS phone,
    (ARRAY_AGG(c.company_name ORDER BY c.created_at DESC) FILTER (WHERE c.company_name IS NOT NULL))[1] AS company_name
  FROM contact_merge m
  JOIN contacts c ON c.id = m.id
  GROUP BY m.keeper_id
) d
WHERE k.id = d.keeper_id;

UPDATE activities a
SET contact_id = m.keeper_id::text
FROM contact_merge m
WHERE a.contact_id = m.id::text;

DELETE FROM contacts c
USING contact_merge m
WHERE c.id = m.id;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_lower_key ON contacts (LOWER(email));

COMMIT;
