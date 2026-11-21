'use client';

// Tranziția între rute (~700ms), cu sidebar-ul și header-ul fixe:
//   1. ieșire (0–150ms): conținutul vechi face fade + blur — pornește la click,
//      în paralel cu navigarea, deci nu o întârzie;
//   2. titlul paginii (H1) apare cu mask reveal de jos în sus, subtitlul cu
//      fade + translateY, la 60ms după;
//   3. cardurile intră în stagger cu blur-in;
//   4. abia apoi `useRevealReady()` devine true și pornesc animațiile de date
//      (count-up, grafice).
//
// <TransitionProvider> învelește tot layout-ul (și sidebar-ul, și header-ul
// pornesc ieșirea); <PageTransition> e doar zona de conținut care se animă.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import gsap from 'gsap';
import { blurOut, fadeUp, maskRevealTitle, staggerReveal } from '@/lib/motion';

interface TransitionContextValue {
  /** Pornește ieșirea conținutului curent; apelat la click pe un link intern. */
  beginExit: (href: string) => void;
  /** true după ce intrarea paginii s-a terminat. */
  ready: boolean;
  setReady: (ready: boolean) => void;
  contentRef: MutableRefObject<HTMLDivElement | null>;
  safetyTimer: MutableRefObject<ReturnType<typeof setTimeout> | undefined>;
}

const TransitionContext = createContext<TransitionContextValue | null>(null);

/** Funcția de ieșire; în afara providerului e un no-op. */
export const useBeginExit = () => useContext(TransitionContext)?.beginExit ?? noop;
/** În afara providerului (ex. pagini de auth), animațiile de date pornesc direct. */
export const useRevealReady = () => useContext(TransitionContext)?.ready ?? true;

function noop() {}

// În SSR, useLayoutEffect avertizează; pe client rulează înainte de paint,
// deci starea „de dinainte” a cardurilor se aplică fără flash.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Dacă navigarea nu se produce (eroare, link spre aceeași pagină), conținutul revine. */
const EXIT_SAFETY_MS = 2500;

function pathOf(href: string): string {
  try {
    return new URL(href, window.location.href).pathname;
  } catch {
    return href;
  }
}

/** Peste atâtea elemente într-o trecere, restul apar fără stagger. */
const MAX_STAGGERED = 15;
const MAX_DEPTH = 4;

/**
 * Cardurile de animat, în ordinea din DOM:
 *  - elementele marcate `[data-reveal]`, dacă pagina le folosește;
 *  - altfel secțiunile de nivel 1, coborând în wrapper-ele care conțin titlul
 *    (ex. Overview are un singur container cu titlul și tot restul) și în
 *    grid-uri (fiecare card al grid-ului intră separat).
 * Modalele (`position: fixed`) și elementele ascunse sunt ignorate.
 */
function collectRevealTargets(root: HTMLElement, title: HTMLElement | null, subtitle: HTMLElement | null): Element[] {
  const marked = Array.from(root.querySelectorAll('[data-reveal]'));
  if (marked.length) return marked;

  const out: Element[] = [];
  const walk = (el: Element, depth: number) => {
    for (const child of Array.from(el.children)) {
      if (!(child instanceof HTMLElement) || child === title || child === subtitle) continue;
      const cs = getComputedStyle(child);
      if (cs.position === 'fixed' || cs.display === 'none' || cs.display === 'contents') continue;
      if (title && child.contains(title) && depth < MAX_DEPTH) {
        walk(child, depth + 1);
      } else if (cs.display.includes('grid') && child.children.length > 1 && depth < MAX_DEPTH) {
        for (const cell of Array.from(child.children)) {
          if (cell instanceof HTMLElement && getComputedStyle(cell).position !== 'fixed') out.push(cell);
        }
      } else {
        out.push(child);
      }
    }
  };
  walk(root, 0);
  return out;
}

function restoreContent(el: HTMLElement | null) {
  if (!el) return;
  gsap.killTweensOf(el);
  gsap.set(el, { clearProps: 'opacity,filter' });
}

export function TransitionProvider({ children }: { children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout>>();
  const [ready, setReady] = useState(false);

  const beginExit = useCallback((href: string) => {
    const el = contentRef.current;
    if (!el || pathOf(href) === window.location.pathname) return;
    blurOut(el);
    clearTimeout(safetyTimer.current);
    safetyTimer.current = setTimeout(() => restoreContent(contentRef.current), EXIT_SAFETY_MS);
  }, []);

  useEffect(() => () => clearTimeout(safetyTimer.current), []);

  const value = useMemo(
    () => ({ beginExit, ready, setReady, contentRef, safetyTimer }),
    [beginExit, ready]
  );
  return <TransitionContext.Provider value={value}>{children}</TransitionContext.Provider>;
}

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ctx = useContext(TransitionContext);
  const localRef = useRef<HTMLDivElement | null>(null);
  const contentRef = ctx?.contentRef ?? localRef;
  const setReady = ctx?.setReady;
  const safetyTimer = ctx?.safetyTimer;

  useIsoLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    clearTimeout(safetyTimer?.current);
    restoreContent(content);
    setReady?.(false);

    const tweens: (gsap.core.Tween | null)[] = [];
    const seen = new WeakSet<Element>();
    const animated: Element[] = [];
    let titleEl: HTMLElement | null = null;
    let subtitleEl: HTMLElement | null = null;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;

    // O trecere: titlul (dacă a apărut și nu l-am animat) + cardurile noi.
    // Rulează la intrarea rutei și apoi la fiecare schimbare de DOM — paginile își
    // încarcă datele după montare (spinner → conținut), iar cardurile reale apar abia atunci.
    const pass = (initial: boolean) => {
      const root = content.firstElementChild as HTMLElement | null;
      if (!root) return 0;

      const title = root.querySelector<HTMLElement>('.page-title, h1');
      let titleDelay = 0;
      if (title && title !== titleEl) {
        titleEl = title;
        const next = title.nextElementSibling;
        subtitleEl = next instanceof HTMLElement && next.tagName === 'P' ? next : null;
        tweens.push(maskRevealTitle(title));
        if (subtitleEl) tweens.push(fadeUp(subtitleEl, 0.06));
        titleDelay = 0.1;
      }

      const fresh = collectRevealTargets(root, titleEl, subtitleEl).filter((el) => !seen.has(el));
      if (fresh.length === 0) return 0;
      for (const el of fresh) {
        seen.add(el);
        animated.push(el);
      }
      const batch = fresh.slice(0, MAX_STAGGERED);
      const n = batch.length;
      tweens.push(
        staggerReveal(batch, {
          delay: initial ? titleDelay : 0,
          stagger: n > 1 ? Math.min(0.05, 0.45 / (n - 1)) : 0,
        })
      );
      return n;
    };

    const count = pass(true);
    // `ready` = intrarea s-a terminat; animațiile de date (count-up) pornesc după
    readyTimer = setTimeout(() => setReady?.(true), count ? 450 + Math.min(count, MAX_STAGGERED) * 50 : 0);

    const mo = new MutationObserver(() => pass(false));
    mo.observe(content, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      clearTimeout(readyTimer);
      for (const t of tweens) t?.kill();
      if (titleEl) gsap.set(titleEl, { clearProps: 'transform,clipPath,opacity' });
      if (subtitleEl) gsap.set(subtitleEl, { clearProps: 'transform,opacity' });
      const alive = animated.filter((el) => el.isConnected);
      if (alive.length) gsap.set(alive, { clearProps: 'opacity,transform,filter' });
    };
    // contentRef/safetyTimer sunt ref-uri stabile; animația depinde doar de rută
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return <div ref={contentRef}>{children}</div>;
}
