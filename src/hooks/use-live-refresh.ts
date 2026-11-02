'use client';

import { useEffect, useRef } from 'react';

/**
 * Reîncarcă datele unei pagini deschise: la fiecare `intervalMs` cât tab-ul e
 * vizibil și imediat când utilizatorul revine pe tab. Neon nu are un canal de
 * push, deci așa apar fără refresh datele scrise din afara CRM-ului (agentul de
 * pe site, webhook-uri, joburile programate).
 *
 * Nu rulează la montare (pagina își face singură prima încărcare), iar o
 * reîncărcare nu pornește cât timp cea anterioară e încă în curs.
 */
export function useLiveRefresh(onTick: () => unknown, intervalMs: number) {
  const callback = useRef(onTick);
  useEffect(() => {
    callback.current = onTick;
  }, [onTick]);

  useEffect(() => {
    let busy = false;

    async function tick() {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        await callback.current();
      } catch {
        // Eroarea o tratează pagina; următoarea reîncărcare reîncearcă
      } finally {
        busy = false;
      }
    }

    const timer = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
}
