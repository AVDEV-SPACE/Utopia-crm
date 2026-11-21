'use client';

// Cifră care numără de la valoarea anterioară (0 la prima afișare) la cea nouă,
// ~800ms, ease-out, cu `tabular-nums` ca lățimea să nu „danseze”. Pornește abia
// după intrarea paginii și când cifra e vizibilă. Cu reduced-motion apare direct.
//
//   <CountUp value={13} />
//   <CountUp value={3.8} decimals={1} suffix="%" onDone={() => setShowTrend(true)} />
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { useRevealReady } from './PageTransition';

export const COUNT_UP_MS = 800;

interface CountUpProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Formatare proprie (ex. separator de mii); primește valoarea intermediară. */
  format?: (n: number) => string;
  className?: string;
  /** Apelat când cifra s-a oprit — ex. pentru fade-in-ul badge-ului de trend. */
  onDone?: () => void;
}

export function CountUp({ value, decimals = 0, prefix = '', suffix = '', format, className, onDone }: CountUpProps) {
  const ready = useRevealReady();
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  const [visible, setVisible] = useState(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // Vizibilitate: numărătoarea nu pornește pentru cifre aflate sub fold
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!ready || !visible) return;
    const finish = () => {
      shownRef.current = value;
      setShown(value);
      onDoneRef.current?.();
    };
    if (prefersReducedMotion() || shownRef.current === value) {
      finish();
      return;
    }
    const state = { n: shownRef.current };
    const tween = gsap.to(state, {
      n: value,
      duration: COUNT_UP_MS / 1000,
      ease: 'power3.out',
      onUpdate: () => {
        shownRef.current = state.n;
        setShown(state.n);
      },
      onComplete: finish,
    });
    return () => {
      tween.kill();
    };
  }, [value, ready, visible]);

  const text = format
    ? format(shown)
    : shown.toLocaleString('ro-RO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  return (
    <span ref={ref} data-countup className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
