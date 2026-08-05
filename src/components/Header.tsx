// components/Header.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, ChevronDown, Building2, Calendar } from 'lucide-react';

import AvailabilityModal from './AvailabilityModal';
import AddClientModal from './AddClientModal';

const MENU_PAGES = [
  { name: 'Overview',   href: '/overview',              keywords: ['overview','dashboard','acasa','home','ov'] },
  { name: 'Bookings',   href: '/bookings',              keywords: ['bookings','programari','rezervari','bo'] },
  { name: 'Chats',  href: '/messaging',             keywords: ['messaging','mesaje','chat','conversatii','me'] },
  { name: 'Templates',  href: '/educational-templates', keywords: ['templates','sabloane','educational','te'] },
];



export default function Header() {
  const router = useRouter();
  const [theme, setTheme] = useState<'light' | 'dark' | 'amber'>('dark');

  useEffect(() => {
    const savedTheme = (localStorage.getItem('kspot-theme') ?? 'dark') as 'light' | 'dark' | 'amber';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
    const interval = setInterval(() => {
      const newTheme = (localStorage.getItem('kspot-theme') ?? 'dark') as 'light' | 'dark' | 'amber';
      setTheme((prev) => {
        if (prev === newTheme) return prev;
        document.documentElement.setAttribute('data-theme', newTheme);
        return newTheme;
      });
    }, 500);
    return () => clearInterval(interval);
    // rulează o singură dată la mount — citește tema curentă prin funcția de update,
    // nu prin dependency, ca să nu recreeze interval-ul (și să nu buclheze) la fiecare schimbare
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isModalOpen,             setIsModalOpen]             = useState(false);
  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  const [searchQuery,             setSearchQuery]             = useState('');
  const [showSearchResults,       setShowSearchResults]       = useState(false);
  const [selectedResultIndex,     setSelectedResultIndex]     = useState(-1);
  const [showSalonSelector,       setShowSalonSelector]       = useState(false);

  const filteredPages = searchQuery.trim()
    ? MENU_PAGES.filter(p => p.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase())))
    : [];

  const handleNavigate = (href: string) => {
    router.push(href);
    setSearchQuery(''); setShowSearchResults(false); setSelectedResultIndex(-1);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSearchResults || !filteredPages.length) return;
    if      (e.key === 'ArrowDown') { e.preventDefault(); setSelectedResultIndex(p => Math.min(p+1, filteredPages.length-1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedResultIndex(p => Math.max(p-1, -1)); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      handleNavigate(selectedResultIndex >= 0 ? filteredPages[selectedResultIndex].href : filteredPages[0].href);
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

            {/* ── Salon / Role selector ── */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowSalonSelector(!showSalonSelector)}
                className={`flex items-center gap-2 px-3 h-9 rounded-xl border transition text-sm selector-bg selector-border ${true ? 'cursor-pointer' : ''}`}
              >
                <Building2 className="w-4 h-4 text-amber-400" />
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-medium leading-tight text-primary">
                    CRM Tools
                  </p>
                  <p className="text-[10px] leading-tight text-secondary">
                    Yours
                  </p>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform text-secondary ${showSalonSelector ? 'rotate-180' : ''}`} />
              </button>

              {showSalonSelector && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSalonSelector(false)} />
                  <div
                    className="absolute top-full left-0 mt-2 rounded-xl shadow-2xl z-50 overflow-hidden min-w-[220px] border dropdown-bg dropdown-border"
                  >
                    {/* Dropdown header */}
                    <div
                      className="px-6 py-2 text-[10px] font-medium uppercase tracking-[0.15em] border-b dropdown-hdr-bg text-secondary"
                      style={{ borderColor: 'inherit' }}
                    >
                      Theme Select
                    </div>
                    {['light', 'dark', 'amber'].map((thm) => (
                      <button
                        key={thm}
                        onClick={() => { localStorage.setItem('kspot-theme', thm); setTheme(thm as 'light' | 'dark' | 'amber'); document.documentElement.setAttribute('data-theme', thm); setShowSalonSelector(false); }}
                        className={`w-full px-6 py-3 transition text-sm flex items-center gap-3 ${
                          theme === thm ? 'bg-amber-500/10 text-amber-400' : 'text-secondary hover:bg-stone-800/60'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full ${thm === 'light' ? 'bg-white border-2 border-gray-300' : thm === 'dark' ? 'bg-gray-900 border-2 border-gray-600' : 'bg-amber-50 border-2 border-amber-300'}`} />
                        <div>
                          <p className="font-medium capitalize text-primary">{thm}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-600 pointer-events-none" />
              <input
                type="text"
                placeholder="Cauta pagini... (da, cl, pr, se)"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setShowSearchResults(e.target.value.length > 0); setSelectedResultIndex(-1); }}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => searchQuery.length > 0 && setShowSearchResults(true)}
                onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                className="w-full pl-9 pr-4 h-9 bg-stone-900/60 text-stone-300 placeholder-stone-700 border border-stone-800/60 rounded-xl focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/10 transition text-sm"
              />
              {showSearchResults && filteredPages.length > 0 && (
                <div
                  className="absolute top-full left-0 right-0 mt-2 rounded-xl shadow-2xl z-50 overflow-hidden border dropdown-bg dropdown-border"
                >
                  <div className="px-3 py-2 text-[10px] font-medium uppercase tracking-[0.15em] border-b dropdown-hdr-bg text-secondary"
                    style={{ borderColor: 'inherit' }}>
                    Navigare
                  </div>
                  {filteredPages.map((page, idx) => (
                    <button key={page.href} onClick={() => handleNavigate(page.href)}
                      className={`w-full text-left px-4 py-2.5 transition text-sm ${selectedResultIndex === idx ? 'bg-amber-500/10 text-amber-400' : 'text-secondary'}`}>
                      {page.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Availability + Add Client */}
          <div className="flex items-center gap-2 flex-shrink-0">
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
