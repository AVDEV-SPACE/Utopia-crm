'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const URL_WRITE_DELAY_MS = 250;

/**
 * Starea filtrelor unei pagini, ținută în URL (`?status=sent&niche=Dentist`):
 * linkul se poate partaja, iar filtrele rămân după refresh. O valoare egală cu
 * cea implicită nu apare în URL. Ceilalți parametri (ex. `lead`) rămân neatinși.
 *
 * `defaults` trebuie să fie o constantă din afara componentei.
 */
export function useUrlFilters<K extends string>(defaults: Readonly<Record<K, string>>) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [values, setValues] = useState<Record<K, string>>(() => {
    const initial = { ...defaults } as Record<K, string>;
    for (const key of Object.keys(defaults) as K[]) {
      const fromUrl = searchParams.get(key);
      if (fromUrl !== null) initial[key] = fromUrl;
    }
    return initial;
  });

  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    // Debounce: căutarea scrie în URL după ce utilizatorul se oprește din tastat
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      for (const key of Object.keys(defaults) as K[]) {
        if (values[key] === defaults[key] || values[key] === '') params.delete(key);
        else params.set(key, values[key]);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, URL_WRITE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [values, defaults, pathname, router]);

  const set = useCallback((key: K, value: string) => {
    setValues((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  const reset = useCallback((keep: K[] = []) => {
    setValues((prev) => {
      const next = { ...defaults } as Record<K, string>;
      for (const key of keep) next[key] = prev[key];
      return next;
    });
  }, [defaults]);

  return { values, set, reset };
}

/** Elimină un singur parametru din URL (ex. `lead` după închiderea fișei), fără să atingă filtrele. */
export function withoutParam(pathname: string, key: string): string {
  const params = new URLSearchParams(window.location.search);
  params.delete(key);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
