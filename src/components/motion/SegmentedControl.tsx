'use client';

// Segmented control (ex. „Quarter / 6 months / Year”, „Ținta / Răspunsuri”) cu
// același stretch pill ca sidebar-ul, pe orizontală.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { isPillAnimating, slidePill } from '@/lib/motion';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface SegmentOption<V extends string> {
  value: V;
  label: React.ReactNode;
}

interface SegmentedControlProps<V extends string> {
  options: SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  size = 'sm',
  className = '',
  'aria-label': ariaLabel,
}: SegmentedControlProps<V>) {
  const listRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef(new Map<V, HTMLButtonElement>());

  const move = (instant: boolean) => {
    const pill = pillRef.current;
    const target = itemRefs.current.get(value);
    if (pill && target) slidePill(pill, target, { axis: 'x', radius: 8, instant });
  };

  useIsoLayoutEffect(() => move(false), [value]);

  const moveRef = useRef(move);
  useEffect(() => {
    moveRef.current = move;
  });

  // Resize (ex. etichete care își schimbă lățimea) → repoziționare directă.
  // Un singur observer: recrearea lui ar opri animația prin callback-ul inițial.
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (pillRef.current && isPillAnimating(pillRef.current)) return;
      moveRef.current(true);
    });
    ro.observe(list);
    return () => ro.disconnect();
  }, []);

  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm';

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`relative inline-flex items-center gap-0.5 p-0.5 rounded-[10px] bg-[var(--surface-1)] ${className}`}
    >
      <span ref={pillRef} className="seg-pill" aria-hidden />
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              if (el) itemRefs.current.set(opt.value, el);
              else itemRefs.current.delete(opt.value);
            }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`relative z-[1] rounded-lg font-medium whitespace-nowrap transition-colors duration-150 ${pad} ${
              active ? 'text-amber-400' : 'text-stone-500 hover:text-stone-300'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
