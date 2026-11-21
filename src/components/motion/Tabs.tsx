'use client';

// Tab-uri de pagină cu underline care alunecă spre tab-ul activ (FLIP pe
// transform: translateX + scaleX, 320ms) și crossfade cu blur pe conținut.
//
//   <Tabs tabs={[{ value: 'all', label: 'Toate', count: 42 }, ...]} value={tab} onChange={setTab} />
//   <TabPanel key={tab}> ...conținutul tab-ului... </TabPanel>
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { crossfadeIn, prefersReducedMotion } from '@/lib/motion';
import { useRevealReady } from './PageTransition';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface TabItem<V extends string> {
  value: V;
  label: ReactNode;
  count?: number;
}

interface TabsProps<V extends string> {
  tabs: TabItem<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
  'aria-label'?: string;
}

export function Tabs<V extends string>({ tabs, value, onChange, className = '', 'aria-label': ariaLabel }: TabsProps<V>) {
  const listRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef(new Map<V, HTMLButtonElement>());
  const placed = useRef(false);

  const move = (instant: boolean) => {
    const bar = barRef.current;
    const target = itemRefs.current.get(value);
    if (!bar || !target) return;
    // Bara are lățimea de 100px; scaleX o aduce la lățimea tab-ului
    const vars = { x: target.offsetLeft, scaleX: target.offsetWidth / 100 };
    if (instant || !placed.current || prefersReducedMotion()) {
      gsap.set(bar, vars);
      placed.current = true;
    } else {
      gsap.to(bar, { ...vars, duration: 0.32, ease: 'power3.out' });
    }
  };

  useIsoLayoutEffect(() => move(false), [value, tabs.length]);

  const moveRef = useRef(move);
  useEffect(() => {
    moveRef.current = move;
  });

  // Un singur observer; în timpul alunecării nu întrerupem animația
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (barRef.current && gsap.isTweening(barRef.current)) return;
      moveRef.current(true);
    });
    ro.observe(list);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`relative flex items-center gap-1 overflow-x-auto border-b border-[var(--card-border)] ${className}`}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(el) => {
              if (el) itemRefs.current.set(tab.value, el);
              else itemRefs.current.delete(tab.value);
            }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={`relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
              active ? 'text-stone-100' : 'text-stone-500 hover:text-stone-300'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`text-[11px] tabular-nums px-1.5 rounded-md ${
                  active ? 'bg-amber-500/15 text-amber-400' : 'bg-[var(--surface-2)] text-stone-500'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
      <span
        ref={barRef}
        aria-hidden
        className="absolute left-0 bottom-[-1px] h-[2px] w-[100px] origin-left rounded-full bg-amber-500 pointer-events-none"
      />
    </div>
  );
}

/** Conținutul unui tab; dă-i `key={tab}` ca să facă crossfade la schimbare. */
export function TabPanel({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Tab-ul afișat la intrarea rutei e animat de PageTransition; doar schimbările fac crossfade
  const pageReady = useRevealReady();
  const animateOnMount = useRef(pageReady);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || !animateOnMount.current) return;
    const tween = crossfadeIn(el);
    return () => {
      tween.kill();
    };
  }, []);
  return (
    <div ref={ref} role="tabpanel" className={className}>
      {children}
    </div>
  );
}
