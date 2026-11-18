-- Notificările Telegram pentru conversațiile cu agentul de pe site (lib/notify.ts în UTOPIA-SITE).
-- Fiecare coloană e „lacătul" unui eveniment: site-ul trimite notificarea doar dacă un
-- UPDATE ... WHERE notified_*_at IS NULL a reușit, deci o singură dată per sesiune,
-- oricâte instanțe serverless sau reîncercări ale widgetului ar ajunge acolo.
--   notified_started_at  conversația a trecut de MIN_USER_MESSAGES (chat.started)
--   notified_lead_at     a apărut primul email/telefon (chat.lead)
--
-- Sesiunile existente sunt marcate ca notificate, ca la deploy să nu plece o
-- avalanșă de notificări pentru conversații vechi.

BEGIN;

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS notified_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notified_lead_at TIMESTAMPTZ;

UPDATE chat_sessions SET notified_started_at = COALESCE(notified_started_at, NOW())
 WHERE user_message_count >= 2;
UPDATE chat_sessions SET notified_lead_at = COALESCE(notified_lead_at, NOW())
 WHERE client_email IS NOT NULL OR client_phone IS NOT NULL;

COMMIT;
