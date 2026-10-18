'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';

/** Switch cu iconiță pentru comutarea temei închis / deschis. */
export default function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Comută pe tema deschisă' : 'Comută pe tema închisă';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="relative inline-flex h-9 w-16 flex-shrink-0 items-center rounded-full border transition-colors selector-bg selector-border"
    >
      <span
        className={`absolute left-1 flex h-7 w-7 items-center justify-center rounded-full transition-transform duration-300 ease-out ${
          isDark ? 'translate-x-7' : 'translate-x-0'
        }`}
        style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-ink)' }}
      >
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </span>
    </button>
  );
}
