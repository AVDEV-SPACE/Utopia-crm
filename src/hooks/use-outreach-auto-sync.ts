'use client';

import { useEffect, useRef } from 'react';

/** Cât de des verifică o pagină deschisă răspunsurile. */
const INTERVAL_MS = 2 * 60_000;

/**
 * Cât timp pagina e deschisă și vizibilă, rulează periodic verificarea
 * răspunsurilor la outreach (Gmail + clasificare; serverul o limitează la una
 * pe minut) și apoi reîncarcă lista. Așa apar fără refresh etapele schimbate
 * de un răspuns, de o deschidere sau de joburile programate.
 */
export function useOutreachAutoSync(onChanged: () => void) {
  const callback = useRef(onChanged);
  useEffect(() => {
    callback.current = onChanged;
  }, [onChanged]);

  useEffect(() => {
    let stopped = false;
    let busy = false;

    async function tick() {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        // Un rol fără acces (403) sau o eroare de rețea: lista se reîncarcă oricum
        await fetch('/api/outreach/sync?auto=1', { method: 'POST' }).catch(() => null);
      } finally {
        busy = false;
      }
      if (!stopped) callback.current();
    }

    tick();
    const timer = setInterval(tick, INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
