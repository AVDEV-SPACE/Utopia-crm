import { randomBytes } from 'crypto';
import { sql } from '@/lib/neon';
import {
  DEFAULT_HUMAN_TAKEOVER_MINUTES,
  DEFAULT_MISSED_CALL_MESSAGE,
  DEFAULT_WHATSAPP_SYSTEM_PROMPT,
  OrganizationSettings,
  OrganizationSettingsPatch,
} from './types';

/** Cheie API pentru site-urile care trimit lead-uri (ex. agentie-digitala). */
export function generateApiKey(): string {
  return `utk_${randomBytes(24).toString('hex')}`;
}

/**
 * Rândul de setări al organizației. Prima accesare îl creează cu valorile
 * implicite, ca UI-ul să aibă mereu ce afișa (inclusiv un API key valid).
 */
export async function getOrCreateSettings(orgId: string): Promise<OrganizationSettings> {
  const existing = await sql`
    SELECT * FROM organization_settings WHERE org_id = ${orgId}
  `;
  if (existing[0]) return existing[0] as unknown as OrganizationSettings;

  // ON CONFLICT DO NOTHING + re-citire: două request-uri paralele la prima
  // încărcare a paginii nu trebuie să arunce eroare de cheie duplicată.
  const inserted = await sql`
    INSERT INTO organization_settings (
      org_id, api_key, missed_call_sms_message, whatsapp_system_prompt, human_takeover_minutes
    ) VALUES (
      ${orgId}, ${generateApiKey()}, ${DEFAULT_MISSED_CALL_MESSAGE},
      ${DEFAULT_WHATSAPP_SYSTEM_PROMPT}, ${DEFAULT_HUMAN_TAKEOVER_MINUTES}
    )
    ON CONFLICT (org_id) DO NOTHING
    RETURNING *
  `;
  if (inserted[0]) return inserted[0] as unknown as OrganizationSettings;

  const raced = await sql`SELECT * FROM organization_settings WHERE org_id = ${orgId}`;
  if (!raced[0]) throw new Error(`Nu am putut crea setările pentru organizația ${orgId}`);
  return raced[0] as unknown as OrganizationSettings;
}

/** Doar citire — folosit de webhook, care nu trebuie să creeze tenanți noi. */
export async function getSettingsByOrgId(orgId: string): Promise<OrganizationSettings | null> {
  const rows = await sql`SELECT * FROM organization_settings WHERE org_id = ${orgId}`;
  return (rows[0] as unknown as OrganizationSettings) ?? null;
}

export async function getSettingsByApiKey(apiKey: string): Promise<OrganizationSettings | null> {
  const rows = await sql`SELECT * FROM organization_settings WHERE api_key = ${apiKey}`;
  return (rows[0] as unknown as OrganizationSettings) ?? null;
}

export async function updateSettings(
  orgId: string,
  patch: OrganizationSettingsPatch
): Promise<OrganizationSettings> {
  // Setările există garantat înainte de UPDATE (UI-ul le-a creat la GET, dar
  // un PUT „la rece" — ex. din alt tab — nu trebuie să eșueze).
  await getOrCreateSettings(orgId);

  // COALESCE pe fiecare câmp: patch parțial, fără SQL construit prin string
  // concatenation (parametrii rămân legați de driver).
  const rows = await sql`
    UPDATE organization_settings SET
      missed_call_sms_enabled = COALESCE(${patch.missed_call_sms_enabled ?? null}, missed_call_sms_enabled),
      missed_call_sms_message = COALESCE(${patch.missed_call_sms_message ?? null}, missed_call_sms_message),
      whatsapp_ai_enabled     = COALESCE(${patch.whatsapp_ai_enabled ?? null}, whatsapp_ai_enabled),
      whatsapp_system_prompt  = COALESCE(${patch.whatsapp_system_prompt ?? null}, whatsapp_system_prompt),
      human_takeover_minutes  = COALESCE(${patch.human_takeover_minutes ?? null}, human_takeover_minutes),
      social_ai_enabled       = COALESCE(${patch.social_ai_enabled ?? null}, social_ai_enabled),
      updated_at              = now()
    WHERE org_id = ${orgId}
    RETURNING *
  `;
  return rows[0] as unknown as OrganizationSettings;
}

export async function rotateApiKey(orgId: string): Promise<OrganizationSettings> {
  await getOrCreateSettings(orgId);
  const rows = await sql`
    UPDATE organization_settings
    SET api_key = ${generateApiKey()}, updated_at = now()
    WHERE org_id = ${orgId}
    RETURNING *
  `;
  return rows[0] as unknown as OrganizationSettings;
}
