'use client';

import { useCallback, useEffect, useState } from 'react';

/** Aplicația are exact două teme: închisă (implicit) și deschisă. */
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'kspot-theme';
/** Eveniment intern: `storage` nu se declanșează în tab-ul care scrie. */
const THEME_EVENT = 'utopia-theme-change';

/**
 * Normalizează și valoarea veche `amber`, rămasă în localStorage de la tema
 * eliminată, la `dark` — altfel `data-theme` ar rămâne fără reguli CSS.
 */
export function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* modul privat / storage blocat — tema rămâne aplicată doar pe sesiunea curentă */
  }
  document.documentElement.setAttribute('data-theme', theme);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

/**
 * Tema curentă + setter, sincronizate între toate componentele (și între
 * tab-uri, prin evenimentul `storage`). Pornește de la `dark` și se sincronizează
 * la mount, ca serverul și clientul să randeze identic la hidratare.
 */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const sync = () => setTheme(readStoredTheme());
    sync();
    window.addEventListener(THEME_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(THEME_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return [theme, useCallback((next: Theme) => applyTheme(next), [])];
}
