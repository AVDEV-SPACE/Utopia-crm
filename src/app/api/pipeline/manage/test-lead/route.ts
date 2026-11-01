import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { z } from 'zod';
import { requirePipelineOwner } from '@/lib/pipeline-auth';
import { allowedRecipients } from '@/services/outreach/schedule';
import { deleteTestLead, getTestLead, upsertTestLead } from '@/services/pipeline/test-lead';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Starea pentru dialog: lead-ul de test existent și emailul contului, pentru precompletare. */
async function accountEmail(): Promise<{ email: string | null; name: string }> {
  const user = await currentUser().catch(() => null);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return {
    email: user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? null,
    name: name || 'Eu',
  };
}

/** Secvența automată în mod test trimite doar la adresele din OUTREACH_ALLOWED_RECIPIENTS. */
function automationReaches(email: string | null): boolean {
  const list = allowedRecipients();
  return list.length === 0 || (email !== null && list.includes(email.toLowerCase()));
}

export async function GET() {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  try {
    const [lead, account] = await Promise.all([getTestLead(access.userId), accountEmail()]);
    return NextResponse.json({ lead, accountEmail: account.email, automationReaches: automationReaches(lead?.contact_email ?? account.email) });
  } catch (error) {
    console.error('Lead de test: citirea a eșuat:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresa de email nu este validă').max(320),
  // Câmpurile goale din formular devin null
  phone: z
    .string()
    .trim()
    .max(32)
    .transform((v) => v || null)
    .refine((v) => v === null || /^\+?[\d\s().-]{6,}$/.test(v), 'Telefonul nu este valid')
    .nullish(),
  instagram: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null)
    .nullish(),
});

/** Creează sau resetează lead-ul de test (etapa revine la „În coadă email”). */
export async function POST(req: NextRequest) {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Date invalide' }, { status: 400 });
  }

  try {
    const { name } = await accountEmail();
    const lead = await upsertTestLead(access.userId, {
      name,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
      instagram: parsed.data.instagram ?? null,
    });
    return NextResponse.json({ lead, automationReaches: automationReaches(lead.contact_email) });
  } catch (error) {
    console.error('Lead de test: salvarea a eșuat:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE() {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  try {
    return NextResponse.json({ deleted: await deleteTestLead(access.userId) });
  } catch (error) {
    console.error('Lead de test: ștergerea a eșuat:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
