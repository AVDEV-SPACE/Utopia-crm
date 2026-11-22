'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LinkedInPanel } from '@/components/socials/LinkedInPanel';
import { MediaLibrary } from '@/components/socials/MediaLibrary';
import { SocialInbox } from '@/components/socials/SocialInbox';
import { SocialPosts } from '@/components/socials/SocialPosts';
import { SocialSettings } from '@/components/socials/SocialSettings';

type Tab = 'inbox' | 'posts' | 'media' | 'settings' | 'linkedin';

const TABS: { value: Tab; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'posts', label: 'Postări' },
  { value: 'media', label: 'Media' },
  { value: 'settings', label: 'Setări' },
  { value: 'linkedin', label: 'LinkedIn' },
];

const isTab = (value: string | null): value is Tab => TABS.some((t) => t.value === value);

/**
 * /socials: Facebook Page + Instagram Business + pagina de companie LinkedIn în
 * CRM — inbox (DM-uri și comentarii, cu auto-reply AI pe DM-urile Meta),
 * postări programate (text, imagine, carusel, video), biblioteca media și
 * starea conexiunilor. `?tab=` deschide direct un tab (ex. revenirea din OAuth LinkedIn).
 */
export default function SocialsPage() {
  const [tab, setTab] = useState<Tab>('inbox');

  // Revenirea din autorizarea LinkedIn: tab-ul și rezultatul vin în query
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('tab');
    if (isTab(requested)) setTab(requested);
    if (params.get('linkedin') === 'connected') toast.success('Pagina LinkedIn a fost conectată');
    const error = params.get('linkedin_error');
    if (error) toast.error(`LinkedIn: ${error}`);
    if (params.has('linkedin') || params.has('linkedin_error')) {
      params.delete('linkedin');
      params.delete('linkedin_error');
      const query = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    }
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title text-stone-100">Socials</h1>
        <p className="text-sm text-stone-500">
          Mesajele și comentariile de pe Facebook, Instagram și LinkedIn, într-un singur inbox, plus postări programate
          pe toate trei. Fiecare persoană care scrie devine un lead în Pipeline.
        </p>
      </div>

      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              tab === t.value
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-stone-900/60 text-stone-500 border border-stone-800/60 hover:border-stone-700 hover:text-stone-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'inbox' && <SocialInbox />}
      {tab === 'posts' && <SocialPosts />}
      {tab === 'media' && (
        <section className="rounded-xl border border-stone-800/60 bg-stone-900/60 p-4">
          <MediaLibrary />
        </section>
      )}
      {tab === 'settings' && <SocialSettings />}
      {tab === 'linkedin' && <LinkedInPanel />}
    </div>
  );
}
