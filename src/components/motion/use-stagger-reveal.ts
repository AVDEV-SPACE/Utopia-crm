'use client';

import { useEffect, useRef, type DependencyList } from 'react';
import { staggerReveal } from '@/lib/motion';
import { useRevealReady } from './PageTransition';

/**
 * Stagger pentru un grid de carduri care apare DUPĂ intrarea paginii (ex. când
 * datele s-au încărcat și skeleton-ul e înlocuit). Intrarea inițială a rutei o
 * face <PageTransition>; hook-ul rulează doar după ea, la fiecare schimbare a
 * `deps`, ca elementele să nu fie animate de două ori.
 *
 *   const gridRef = useStaggerReveal<HTMLDivElement>([loading]);
 *   <div ref={gridRef}> {cards} </div>
 *
 * Țintele: copiii marcați `[data-reveal]`, altfel copiii direcți. `limit`
 * animă doar primele N elemente (restul apar direct), util la liste lungi.
 */
export function useStaggerReveal<T extends HTMLElement>(
  deps: DependencyList,
  { stagger = 0.05, limit = 15 }: { stagger?: number; limit?: number } = {}
) {
  const ref = useRef<T>(null);
  const ready = useRevealReady();
  const wasReady = useRef(false);

  useEffect(() => {
    const el = ref.current;
    // Prima trecere la „ready” = intrarea rutei tocmai s-a terminat: nu re-animăm.
    if (!ready) {
      wasReady.current = false;
      return;
    }
    if (!wasReady.current) {
      wasReady.current = true;
      return;
    }
    if (!el) return;
    const marked = Array.from(el.querySelectorAll(':scope > [data-reveal]'));
    const targets = (marked.length ? marked : Array.from(el.children)).slice(0, limit);
    const tween = staggerReveal(targets, { stagger });
    return () => {
      tween?.kill();
    };
    // `deps` vine de la apelant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ...deps]);

  return ref;
}
