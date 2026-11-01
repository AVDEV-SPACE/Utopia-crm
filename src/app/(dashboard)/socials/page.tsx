'use client';

import { useState } from 'react';
import { Linkedin } from 'lucide-react';
import { SocialInbox } from '@/components/socials/SocialInbox';
import { SocialPosts } from '@/components/socials/SocialPosts';
import { SocialSettings } from '@/components/socials/SocialSettings';

type Tab = 'inbox' | 'posts' | 'settings' | 'linkedin';

const TABS: { value: Tab; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'posts', label: 'Postări' },
  { value: 'settings', label: 'Setări' },
  { value: 'linkedin', label: 'LinkedIn' },
];

/**
 * /socials: Facebook Page + Instagram Business în CRM — inbox (DM-uri și
 * comentarii, cu auto-reply AI pe mesajele primite), postări programate și
 * starea conexiunii. LinkedIn: în așteptarea aprobării API-ului.
 */
export default function SocialsPage() {
  const [tab, setTab] = useState<Tab>('inbox');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title text-stone-100">Socials</h1>
        <p className="text-sm text-stone-500">
          Mesajele și comentariile de pe pagina de Facebook și contul de Instagram, într-un singur inbox, plus postări
          programate. Fiecare persoană care scrie devine un lead în Pipeline.
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
      {tab === 'settings' && <SocialSettings />}
      {tab === 'linkedin' && (
        <div className="flex items-start gap-3 rounded-xl border border-stone-800/60 bg-stone-900/60 p-5">
          <Linkedin size={18} className="mt-0.5 text-stone-400" />
          <div>
            <p className="text-sm font-medium text-stone-200">LinkedIn — în aprobare</p>
            <p className="mt-1 text-xs text-stone-500">
              Accesul la API-ul LinkedIn așteaptă aprobarea. Până atunci, mesajele LinkedIn se trimit manual din fișa lead-ului
              (Pipeline → Trimite un mesaj), iar trimiterea se înregistrează în istoric.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
