// components/Header.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, Calendar, Building2 } from 'lucide-react';

import AvailabilityModal from './AvailabilityModal';
import AddClientModal from './AddClientModal';
import ThemeToggle from './ThemeToggle';
import type { Lead } from '@/services/leads/types';

const MENU_PAGES = [
  { name: 'Overview',   href: '/overview',              keywords: ['overview','dashboard','acasa','home','ov'] },
  { name: 'Bookings',   href: '/bookings',              keywords: ['bookings','programari','rezervari','bo'] },
  { name: 'Chats',  href: '/messaging',             keywords: ['messaging','mesaje','chat','conversatii','me'] },
  { name: 'Templates',  href: '/educational-templates', keywords: ['templates','sabloane','educational','te'] },
  { name: 'Lead Generation', href: '/lead-generation',  keywords: ['leads','lead','generation','prospecti','lg'] },
];

/** Un rezultat de căutare: pagină din meniu sau lead din baza de date. */
type SearchResult =
  | { type: 'page'; key: string; label: string; href: string }
  | { type: 'lead'; key: string; label: string; href: string; hint: string };

export default function Header() {
  const router = useRouter();

  const [isModalOpen,             setIsModalOpen]             = useState(false);
  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  const [searchQuery,             setSearchQuery]             = useState('');
  const [showSearchResults,       setShowSearchResults]       = useState(false);
  const [selectedResultIndex,     setSelectedResultIndex]     = useState(-1);
  const [leadResults,             setLeadResults]             = useState<Lead[]>([]);

  const trimmedQuery = searchQuery.trim();

  // Lead-urile se caută pe server, cu debounce, ca să nu lovim API-ul la fiecare tastă
  useEffect(() => {
    if (trimmedQuery.length < 2) {
      setLeadResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/leads?q=${encodeURIComponent(trimmedQuery)}&limit=6`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error('search failed');
        setLeadResults(await res.json());
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setLeadResults([]);
      }
    }, 250);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [trimmedQuery]);

  const pageResults: SearchResult[] = trimmedQuery
    ? MENU_PAGES
        .filter(p => p.keywords.some(k => k.toLowerCase().includes(trimmedQuery.toLowerCase())))
        .map(p => ({ type: 'page' as const, key: p.href, label: p.name, href: p.href }))
    : [];

  const results: SearchResult[] = [
    ...pageResults,
    ...leadResults.map(l => ({
      type: 'lead' as const,
      key: l.id,
      label: l.company_name,
      // Toate leadurile sunt în /pipeline (fosta /leads a fost unită cu ea)
      href: `/pipeline?lead=${l.id}`,
      hint: l.contact_email || l.contact_phone || [l.niche, l.location].filter(Boolean).join(' · ') || '—',
    })),
  ];

  const handleNavigate = (href: string) => {
    router.push(href);
    setSearchQuery(''); setShowSearchResults(false); setSelectedResultIndex(-1);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSearchResults || !results.length) return;
    if      (e.key === 'ArrowDown') { e.preventDefault(); setSelectedResultIndex(p => Math.min(p+1, results.length-1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedResultIndex(p => Math.max(p-1, -1)); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      handleNavigate(selectedResultIndex >= 0 ? results[selectedResultIndex].href : results[0].href);
    }
    else if (e.key === 'Escape') { setShowSearchResults(false); setSelectedResultIndex(-1); }
  };

  return (
    <>
      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header
        className="px-4 lg:px-8 h-14 flex items-center border-b border-stone-800/60 sticky top-0 z-30"
      >
        <div className="flex items-center justify-between gap-4 w-full">

          {/* Left: salon selector + search */}
          <div className="flex items-center gap-4 flex-1 max-w-sm relative">

            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-600 pointer-events-none" />
              <input
                type="text"
                placeholder="Caută pagini sau lead-uri (nume, email)..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setShowSearchResults(e.target.value.length > 0); setSelectedResultIndex(-1); }}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => searchQuery.length > 0 && setShowSearchResults(true)}
                onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                className="w-full pl-9 pr-4 h-9 bg-stone-900/60 text-stone-300 placeholder-stone-700 border border-stone-800/60 rounded-xl focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/10 transition text-sm"
              />
              {showSearchResults && results.length > 0 && (
                <div
                  className="absolute top-full left-0 right-0 mt-2 rounded-xl shadow-2xl z-50 overflow-hidden border dropdown-bg dropdown-border max-h-80 overflow-y-auto"
                >
                  {results.map((result, idx) => {
                    // Antet de secțiune înaintea primului rezultat de fiecare tip
                    const isFirstOfType = idx === 0 || results[idx - 1].type !== result.type;
                    return (
                      <div key={`${result.type}-${result.key}`}>
                        {isFirstOfType && (
                          <div
                            className="px-3 py-2 text-[10px] font-medium uppercase tracking-[0.15em] border-b dropdown-hdr-bg text-secondary"
                            style={{ borderColor: 'inherit' }}
                          >
                            {result.type === 'page' ? 'Navigare' : 'Lead-uri'}
                          </div>
                        )}
                        <button
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleNavigate(result.href)}
                          className={`w-full text-left px-4 py-2.5 transition text-sm flex items-center gap-2 ${
                            selectedResultIndex === idx ? 'bg-amber-500/10 text-amber-400' : 'text-secondary'
                          }`}
                        >
                          {result.type === 'lead' && <Building2 className="w-3.5 h-3.5 shrink-0 opacity-70" />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{result.label}</span>
                            {result.type === 'lead' && (
                              <span className="block text-[11px] opacity-60 truncate">{result.hint}</span>
                            )}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: Theme + Availability + Add Client */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <ThemeToggle />

            <button
              onClick={() => setIsAvailabilityModalOpen(true)}
              className="flex items-center gap-2 px-3 h-9 border rounded-xl transition-all text-sm font-medium selector-bg selector-border text-secondary"
              title="Gestionează disponibilitatea"
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden md:inline">Availability</span>
            </button>

            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-4 h-9 bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-semibold rounded-xl transition-all shadow-md shadow-amber-500/20 text-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">Add Client</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── ADD CLIENT MODAL ────────────────────────────────────────────── */}
      <AddClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* ── AVAILABILITY MODAL ──────────────────────────────────────────── */}
      <AvailabilityModal
        isOpen={isAvailabilityModalOpen}
        onClose={() => setIsAvailabilityModalOpen(false)}
      />
    </>
  );
}
