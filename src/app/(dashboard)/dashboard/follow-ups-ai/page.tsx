import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant';
import { getOrCreateSettings } from '@/services/followups/settings';
import { buildSettingsResponse } from '@/services/followups/response';
import { FollowUpSettingsForm } from '@/components/followups/FollowUpSettingsForm';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export const metadata = {
  title: 'AI Follow-Up & WhatsApp Automation',
};

export default async function FollowUpsAiPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect('/auth/sign-in?redirect_url=/dashboard/follow-ups-ai');

  // Prima încărcare creează rândul de setări (inclusiv API key-ul), ca UI-ul
  // să afișeze imediat webhook-ul și cheia — fără „salvează întâi".
  let initial;
  try {
    initial = buildSettingsResponse(await getOrCreateSettings(tenant.orgId));
  } catch (error) {
    console.error('[follow-ups-ai] nu am putut încărca setările:', error);
    return (
      <div className="space-y-2">
        <h1 className="page-title text-stone-100">AI Follow-Up & WhatsApp</h1>
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-300">
          Nu am putut încărca setările. Verifică conexiunea la Neon și că ai rulat{' '}
          <code className="rounded bg-stone-900 px-1.5 py-0.5 text-red-200">setup-db-followups.sql</code>.
        </div>
      </div>
    );
  }

  return <FollowUpSettingsForm initial={initial} />;
}
