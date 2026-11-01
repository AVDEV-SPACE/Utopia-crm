import { sql } from '@/lib/neon';
import { createAutomationLead } from '@/services/leads/repository';
import type { Lead } from '@/services/leads/types';
import type { SocialChannel } from './config';

/**
 * Lead-ul CRM al unei persoane care scrie pe Facebook / Instagram.
 * Ordinea: lead-ul creat anterior pentru același PSID / IGSID (`source_ref`),
 * apoi (pe Instagram) un lead existent cu același username, altfel unul nou.
 */

const CHANNEL_LABELS: Record<SocialChannel, string> = { facebook: 'Facebook', instagram: 'Instagram' };

const sourceRefFor = (channel: SocialChannel, externalUserId: string) =>
  `${channel === 'facebook' ? 'fb' : 'ig'}:${externalUserId}`;

async function findBySourceRef(sourceRef: string): Promise<Lead | null> {
  const rows = await sql`SELECT * FROM leads WHERE source_ref = ${sourceRef} LIMIT 1`;
  return (rows[0] as unknown as Lead) ?? null;
}

/** Username IG în orice formă salvată: „@x”, „x”, „instagram.com/x/”, URL complet. */
async function findByInstagramUsername(username: string): Promise<Lead | null> {
  const rows = await sql`
    SELECT * FROM leads
    WHERE lower(trim(BOTH '@/' FROM regexp_replace(
            coalesce(contact_instagram, score_details->'social'->>'instagram', ''),
            '^(https?://)?(www[.])?instagram[.]com/', '', 'i'))) = lower(${username})
    ORDER BY created_at
    LIMIT 1
  `;
  return (rows[0] as unknown as Lead) ?? null;
}

export async function findOrCreateSocialLead(input: {
  orgId: string;
  channel: SocialChannel;
  externalUserId: string;
  name: string | null;
  username: string | null;
  kind: 'dm' | 'comment';
}): Promise<Lead> {
  const sourceRef = sourceRefFor(input.channel, input.externalUserId);
  const existing = await findBySourceRef(sourceRef);
  if (existing) return existing;

  if (input.channel === 'instagram' && input.username) {
    const known = await findByInstagramUsername(input.username);
    if (known) return known;
  }

  const label = CHANNEL_LABELS[input.channel];
  const created = await createAutomationLead({
    org_id: input.orgId,
    company_name: (input.name ?? `Contact ${label} ${input.externalUserId.slice(-6)}`).slice(0, 300),
    status: 'new',
    source: input.channel,
    source_ref: sourceRef,
    notes: `Contact nou din ${label} (${input.kind === 'comment' ? 'comentariu' : 'mesaj direct'}).`,
  });
  // `null` = alt webhook l-a creat între timp (cheia e source_ref)
  const lead = created ?? (await findBySourceRef(sourceRef));
  if (!lead) throw new Error(`Lead-ul pentru ${sourceRef} nu a putut fi creat`);

  if (input.channel === 'instagram' && input.username) {
    await sql`
      UPDATE leads SET contact_instagram = ${`@${input.username}`}, updated_at = now()
      WHERE id = ${lead.id}::uuid AND contact_instagram IS NULL
    `;
  }
  return lead;
}
