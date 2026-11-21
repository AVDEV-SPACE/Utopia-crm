// src/components/Sidebar.tsx
'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { UserButton, useUser } from '@clerk/nextjs';
import { ChevronLeft, ChevronDown, Menu } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { NAV_CONFIG, categoryOf, isNavActive, type NavBadges } from '@/lib/navConfig';
import { isPillAnimating, slidePill } from '@/lib/motion';
import { preload } from '@/lib/data-cache';
import { useBeginExit } from '@/components/motion/PageTransition';
import { useLiveRefresh } from '@/hooks/use-live-refresh';

const GROUPS_STORAGE_KEY = 'utopia-nav-groups';
const BADGES_REFRESH_MS = 60_000;
const PILL_RADIUS = 14;

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function readClosedGroups(): string[] {
  try {
    const raw = window.localStorage.getItem(GROUPS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeClosedGroups(ids: string[]) {
  try {
    window.localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage blocat (mod privat) — grupurile rămân deschise la următoarea vizită
  }
}

function formatBadge(n: number): string {
  return n > 99 ? '99+' : String(n);
}

export default function Sidebar() {
  const pathname = usePathname();
  const beginExit = useBeginExit();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [closedGroups, setClosedGroups] = useState<string[]>([]);
  const [badges, setBadges] = useState<NavBadges>({});
  // Click-ul mută pill-ul imediat, fără să aștepte încărcarea noii rute
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const { user, isLoaded } = useUser();

  const listRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const pillInnerRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());

  const activeHref =
    pendingHref ?? NAV_CONFIG.flatMap((c) => c.items).find((i) => isNavActive(pathname, i.href))?.href ?? null;
  const activeCategory = pendingHref ? categoryOf(pendingHref) : categoryOf(pathname);

  useEffect(() => setPendingHref(null), [pathname]);
  useEffect(() => setClosedGroups(readClosedGroups()), []);

  const fetchBadges = useCallback(async () => {
    try {
      const res = await fetch('/api/nav/badges', { cache: 'no-store' });
      if (res.ok) setBadges(await res.json());
    } catch {
      // Badge-urile sunt informative; o eroare de rețea nu afectează meniul
    }
  }, []);
  useEffect(() => {
    fetchBadges();
  }, [fetchBadges, pathname]);
  useLiveRefresh(fetchBadges, BADGES_REFRESH_MS);

  // ── Pill-ul activ ───────────────────────────────────────────────────────
  const movePill = useCallback(
    (instant: boolean) => {
      const pill = pillRef.current;
      const inner = pillInnerRef.current;
      if (!pill || !inner) return;
      const target = activeHref ? itemRefs.current.get(activeHref) : undefined;
      if (!target) {
        pill.style.opacity = '0';
        inner.style.opacity = '0';
        return;
      }
      pill.style.opacity = '';
      inner.style.opacity = '';
      slidePill(pill, target, { axis: 'y', radius: PILL_RADIUS, layers: [{ el: inner, inset: 1 }], instant });
    },
    [activeHref]
  );

  useIsoLayoutEffect(() => movePill(false), [movePill]);

  const movePillRef = useRef(movePill);
  useEffect(() => {
    movePillRef.current = movePill;
  }, [movePill]);

  // Resize, restrângerea meniului și a grupurilor schimbă pozițiile → repoziționare directă.
  // Observer-ul se creează o singură dată: recrearea lui la fiecare rută declanșa
  // callback-ul inițial, care oprea animația pill-ului imediat după pornire.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const snap = () => {
      const pill = pillRef.current;
      // În timpul animației nu întrerupem; slidePill se re-aliniază singur la final
      if (pill && isPillAnimating(pill)) return;
      movePillRef.current(true);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(snap) : null;
    ro?.observe(list);
    // Fonturile web schimbă înălțimea rândurilor după prima măsurare
    document.fonts?.ready.then(snap).catch(() => {});
    return () => ro?.disconnect();
  }, []);

  function toggleGroup(id: string) {
    setClosedGroups((prev) => {
      const next = prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id];
      writeClosedGroups(next);
      return next;
    });
  }

  function handleNavigate(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    // Ctrl/Cmd/Shift/click mijloc deschid tab nou: fără animații locale
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    setIsMobileOpen(false);
    if (isNavActive(pathname, href)) return;
    setPendingHref(href);
    beginExit(href);
  }

  return (
    <>
      {/* Overlay doar pe mobil când sidebar-ul e deschis */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      {/* Glass, plutitor: 0.35rem de margini, rotunjit sus și jos (`.sidebar-glass`) */}
      <aside className={`sidebar-glass fixed lg:relative inset-y-0 left-0 z-50 flex flex-col shrink-0 transition-all duration-300 ${
        isCollapsed ? 'w-[72px]' : 'w-60'
      } ${isMobileOpen ? 'translate-x-0' : '-translate-x-[calc(100%+1rem)] lg:translate-x-0'}`}>
        {/* Logo */}
        {/* Pe 72px (collapsed) logo-ul + butonul nu încap pe același rând: containerul
            se strânge, iar `max-width:100%` din preflight ar turti imaginea. De aceea
            butonul de extindere trece pe rândul de dedesubt când e collapsed. */}
        <div className={`flex items-center h-16 ${isCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          <Link href="/overview" onClick={(e) => handleNavigate(e, '/overview')} className="flex items-center gap-3 min-w-0 shrink-0">
            {/* Logo-ul are deja fundal și colțuri rotunjite în imagine */}
            <Image
              src="/utopia-icon.svg"
              alt="Utopia CRM"
              width={36}
              height={36}
              priority
              className="w-9 h-9 max-w-none shrink-0 rounded-xl shadow-md shadow-black/30"
            />
            {!isCollapsed && (
              <div className="min-w-0">
                <p className="text-sm font-semibold text-stone-100 tracking-wide truncate">CRM Tools</p>
                <p className="text-[10px] text-stone-500 uppercase tracking-[0.15em]">Utopia CRM</p>
              </div>
            )}
          </Link>

          {!isCollapsed && (
            <>
              <button onClick={() => setIsCollapsed(true)}
                title="Restrânge meniul"
                className="p-1.5 rounded-lg hover:bg-stone-800 transition-colors hidden lg:flex items-center justify-center shrink-0">
                <ChevronLeft className="h-4 w-4 text-stone-500 transition-transform duration-300" />
              </button>
              <button onClick={() => setIsMobileOpen(false)}
                className="p-1.5 rounded-lg hover:bg-stone-800 lg:hidden shrink-0">
                <ChevronLeft className="h-4 w-4 text-stone-500" />
              </button>
            </>
          )}
        </div>

        {isCollapsed && (
          <button onClick={() => setIsCollapsed(false)}
            title="Extinde meniul"
            className="hidden lg:flex items-center justify-center h-8 mx-2 rounded-lg hover:bg-stone-800 transition-colors shrink-0">
            <ChevronLeft className="h-4 w-4 text-stone-500 rotate-180" />
          </button>
        )}

        {/* Nav — un singur pill pentru toată lista, care traversează și categoriile */}
        <nav className="flex-1 p-3 overflow-y-auto">
          <div ref={listRef} className={`relative ${isCollapsed ? 'space-y-2' : 'space-y-4'}`}>
            <span ref={pillRef} className="nav-pill" aria-hidden />
            <span ref={pillInnerRef} className="nav-pill-inner" aria-hidden />

            {NAV_CONFIG.map((category, index) => {
              // Grupul rutei active e mereu deschis; în modul icon-only nu se restrânge nimic
              const open = isCollapsed || category.id === activeCategory || !closedGroups.includes(category.id);
              return (
                <div key={category.id}>
                  {isCollapsed ? (
                    index > 0 && (
                      <div title={category.label} className="relative z-[1] py-1.5" role="separator" aria-label={category.label}>
                        <div className="h-px mx-3" />
                      </div>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleGroup(category.id)}
                      aria-expanded={open}
                      className="relative z-[1] w-full flex items-center justify-between px-3 mb-1.5 text-[10.5px] uppercase tracking-[0.12em] font-medium group"
                      style={{ color: 'rgb(var(--line-rgb) / 0.45)' }}
                    >
                      <span>{category.label}</span>
                      <ChevronDown
                        className={`h-3 w-3 opacity-0 group-hover:opacity-100 transition-[transform,opacity] duration-200 ${open ? '' : '-rotate-90 opacity-100'}`}
                      />
                    </button>
                  )}

                  <div className="nav-group-body" data-open={open}>
                    <ul className="space-y-1">
                      {category.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.href === activeHref;
                        const badge = item.badgeKey ? badges[item.badgeKey] : undefined;
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              ref={(el) => {
                                if (el) itemRefs.current.set(item.href, el);
                                else itemRefs.current.delete(item.href);
                              }}
                              onClick={(e) => handleNavigate(e, item.href)}
                              // Datele paginii pornesc la hover/focus: la click sunt de obicei deja în cache
                              onMouseEnter={() => item.prefetch?.forEach((url) => preload(url))}
                              onFocus={() => item.prefetch?.forEach((url) => preload(url))}
                              aria-current={isActive ? 'page' : undefined}
                              tabIndex={open ? undefined : -1}
                              title={isCollapsed ? item.name : undefined}
                              className={`nav-item relative z-[1] w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium group ${
                                isActive ? 'text-amber-400' : 'text-stone-400 hover:text-stone-200'
                              } ${isCollapsed ? 'justify-center' : ''}`}
                            >
                              <span className="relative flex-shrink-0">
                                <Icon className={`h-4 w-4 transition-colors duration-150 ${isActive ? 'text-amber-400' : 'text-stone-500 group-hover:text-stone-300'}`} />
                                {isCollapsed && !!badge && (
                                  <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
                                )}
                              </span>
                              {!isCollapsed && <span className="truncate">{item.name}</span>}
                              {!isCollapsed && !!badge && (
                                <span
                                  className={`ml-auto text-[10px] leading-none tabular-nums px-1.5 py-1 rounded-md ${
                                    isActive ? 'bg-amber-500/20 text-amber-400' : 'bg-stone-800 text-stone-400'
                                  }`}
                                  title={`${badge}`}
                                >
                                  {formatBadge(badge)}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        {/* User */}
        <div className="p-3 border-t border-stone-800/60">
          <div className={`flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-stone-800/50 transition-colors ${isCollapsed ? 'justify-center' : ''}`}>
            {isLoaded && user ? (
              <>
                <UserButton afterSignOutUrl="/auth/sign-in" />
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-stone-300 truncate">{user.firstName} {user.lastName || ''}</p>
                    <p className="text-[10px] text-stone-600 truncate">{user.primaryEmailAddress?.emailAddress}</p>
                  </div>
                )}
              </>
            ) : (
              // Loading or no user
              <>
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-stone-300 truncate">Cont CRM</p>
                    <p className="text-[10px] text-stone-600 truncate">Autentificat</p>
                  </div>
                )}
                <div className="w-8 h-8 rounded-lg bg-stone-800 flex items-center justify-center">
                  <span className="text-stone-400 text-xs">U</span>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile FAB */}
      <button onClick={() => setIsMobileOpen(true)}
        className="fixed bottom-6 right-6 z-50 lg:hidden bg-amber-500 hover:bg-amber-400 text-black p-3.5 rounded-full shadow-xl shadow-amber-500/25 transition-all active:scale-95">
        <Menu className="h-5 w-5" />
      </button>
    </>
  );
}
