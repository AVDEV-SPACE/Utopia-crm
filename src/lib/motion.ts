// src/lib/motion.ts
//
// Primitivele de animație ale aplicației (GSAP). Animează doar transform,
// opacity, filter și clip-path, ca să nu provoace reflow și layout shift.
// Fiecare funcție respectă `prefers-reduced-motion`: atunci rămâne doar un
// fade scurt (120ms), fără mișcare și fără blur.
import gsap from 'gsap';

export const EASE_OUT = 'power3.out';
export const REDUCED_FADE = 0.12;

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ── Stretch pill ─────────────────────────────────────────────────────────
// Un singur element absolut în containerul listei, decupat cu clip-path.
// La schimbarea item-ului activ, marginea din direcția mișcării pleacă prima
// (0.36s), iar cea din spate o ajunge din urmă (0.55s): pill-ul se întinde
// peste ambele item-uri, apoi se strânge pe cel nou.

// Marginile se țin în coordonate absolute față de colțul stânga-sus al
// containerului (t/b = sus/jos, l/r = stânga/dreapta). Inset-ul de jos și din
// dreapta se calculează la fiecare cadru din dimensiunea curentă a
// containerului, deci pill-ul rămâne lipit de item chiar dacă lista crește
// sau se micșorează sub el (badge-uri încărcate, fonturi, grupuri restrânse).
type Edges = { t: number; b: number; l: number; r: number };
type PillHost = HTMLElement & { __st?: Edges };

export type PillAxis = 'y' | 'x';

export interface PillOptions {
  /** 'y' pentru liste verticale (sidebar), 'x' pentru segmented controls. */
  axis?: PillAxis;
  radius?: number;
  /** Straturi suplimentare (ex. umplerea din interiorul conturului) și cât sunt de retrase. */
  layers?: { el: HTMLElement; inset: number }[];
  /** true = poziționare directă, fără animație (mount, resize, collapse). */
  instant?: boolean;
}

/** Poziția țintei față de container, din getBoundingClientRect (nu depinde de offsetParent). */
function edgesFor(box: HTMLElement, target: HTMLElement): Edges {
  const b = box.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  return { t: r.top - b.top, b: r.bottom - b.top, l: r.left - b.left, r: r.right - b.left };
}

const same = (a: Edges, b: Edges) =>
  Math.abs(a.t - b.t) < 0.5 && Math.abs(a.b - b.b) < 0.5 && Math.abs(a.l - b.l) < 0.5 && Math.abs(a.r - b.r) < 0.5;

/** true cât timp pill-ul e în mișcare (resize-ul nu trebuie să-l oprească). */
export function isPillAnimating(pill: HTMLElement): boolean {
  const st = (pill as PillHost).__st;
  return !!st && gsap.isTweening(st);
}

export function slidePill(pill: HTMLElement, target: HTMLElement, opts: PillOptions = {}) {
  const box = pill.parentElement;
  if (!box) return;
  const { axis = 'y', radius = 14, layers = [], instant = false } = opts;
  const to = edgesFor(box, target);

  const host = pill as PillHost;
  const firstPaint = !host.__st;
  const st = (host.__st ??= { ...to });
  const clip = (d = 0) => {
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    return `inset(${st.t + d}px ${w - st.r + d}px ${h - st.b + d}px ${st.l + d}px round ${Math.max(0, radius - d)}px)`;
  };
  const paint = () => {
    pill.style.clipPath = clip();
    for (const layer of layers) layer.el.style.clipPath = clip(layer.inset);
  };

  if (instant || firstPaint || prefersReducedMotion()) {
    gsap.killTweensOf(st);
    Object.assign(st, to);
    paint();
    return;
  }
  if (same(st, to) && !gsap.isTweening(st)) {
    paint();
    return;
  }
  gsap.killTweensOf(st);

  const fwd = axis === 'y' ? to.t > st.t : to.l > st.l;
  // marginea din față pleacă prima, cea din spate o ajunge din urmă
  const [lead, trail] =
    axis === 'y'
      ? (fwd ? (['b', 't'] as const) : (['t', 'b'] as const))
      : (fwd ? (['r', 'l'] as const) : (['l', 'r'] as const));
  const [crossA, crossB] = axis === 'y' ? (['l', 'r'] as const) : (['t', 'b'] as const);

  gsap.to(st, { [lead]: to[lead], [crossA]: to[crossA], [crossB]: to[crossB], duration: 0.36, ease: EASE_OUT, onUpdate: paint });
  gsap.to(st, {
    [trail]: to[trail],
    duration: 0.55,
    ease: EASE_OUT,
    onUpdate: paint,
    // Dacă layout-ul s-a mișcat în timpul animației, pill-ul se lipește din nou de țintă
    onComplete: () => {
      if (!target.isConnected) return;
      const now = edgesFor(box, target);
      if (!same(st, now)) {
        Object.assign(st, now);
        paint();
      }
    },
  });
}

// ── Reveal-uri (tranziția între rute, carduri, tab-uri) ────────────────────

/** Ieșirea conținutului vechi: fade + blur, 150ms. */
export function blurOut(el: HTMLElement, duration = 0.15) {
  gsap.killTweensOf(el);
  if (prefersReducedMotion()) return gsap.to(el, { opacity: 0, duration: REDUCED_FADE });
  return gsap.to(el, { opacity: 0, filter: 'blur(10px)', duration, ease: 'power2.in' });
}

/**
 * Titlul paginii apare cu „mask reveal” de jos în sus. Fără wrapper în DOM:
 * textul coboară cu p% din înălțimea lui, iar clip-path-ul (în coordonatele
 * elementului) taie exact aceeași bucată de jos, deci fereastra vizibilă
 * rămâne fixă pe poziția finală.
 */
export function maskRevealTitle(el: HTMLElement, delay = 0) {
  if (prefersReducedMotion()) {
    return gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: REDUCED_FADE, delay, clearProps: 'opacity' });
  }
  const p = { v: 100 };
  const paint = () => {
    el.style.transform = `translateY(${p.v}%)`;
    el.style.clipPath = `inset(-0.2em -0.2em ${p.v}% -0.2em)`;
  };
  paint();
  return gsap.to(p, {
    v: 0,
    duration: 0.3,
    delay,
    ease: 'expo.out',
    onUpdate: paint,
    onComplete: () => {
      el.style.transform = '';
      el.style.clipPath = '';
    },
  });
}

/** Fade + mică ridicare (subtitluri, badge-uri de trend). */
export function fadeUp(el: Element | Element[], delay = 0, y = 6, duration = 0.3) {
  if (prefersReducedMotion()) {
    return gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: REDUCED_FADE, delay, clearProps: 'opacity' });
  }
  return gsap.fromTo(
    el,
    { opacity: 0, y },
    { opacity: 1, y: 0, duration, delay, ease: EASE_OUT, clearProps: 'opacity,transform' }
  );
}

/**
 * Cardurile intră în stagger (ordinea: rânduri de sus în jos, stânga→dreapta)
 * cu opacity, blur și translateY. La final se șterg stilurile inline: filter și
 * transform ar crea un containing block nou și ar decala modalele `fixed`
 * randate în interiorul cardurilor.
 */
export function staggerReveal(
  els: Element[],
  { delay = 0, stagger = 0.05, onComplete }: { delay?: number; stagger?: number; onComplete?: () => void } = {}
) {
  if (els.length === 0) {
    onComplete?.();
    return null;
  }
  const ordered = sortByReadingOrder(els);
  if (prefersReducedMotion()) {
    return gsap.fromTo(ordered, { opacity: 0 }, { opacity: 1, duration: REDUCED_FADE, delay, clearProps: 'opacity', onComplete });
  }
  return gsap.fromTo(
    ordered,
    { opacity: 0, y: 8, filter: 'blur(12px)' },
    {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      duration: 0.45,
      delay,
      stagger,
      ease: EASE_OUT,
      clearProps: 'opacity,transform,filter',
      onComplete,
    }
  );
}

/** Ordinea de citire: rând cu rând (toleranță 8px), apoi stânga→dreapta. */
export function sortByReadingOrder(els: Element[]): Element[] {
  const withBox = els.map((el) => ({ el, box: el.getBoundingClientRect() }));
  withBox.sort((a, b) => (Math.abs(a.box.top - b.box.top) > 8 ? a.box.top - b.box.top : a.box.left - b.box.left));
  return withBox.map((x) => x.el);
}

/** Crossfade cu blur pentru conținutul unui tab (~400ms). */
export function crossfadeIn(el: HTMLElement) {
  if (prefersReducedMotion()) {
    return gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: REDUCED_FADE, clearProps: 'opacity' });
  }
  return gsap.fromTo(
    el,
    { opacity: 0, filter: 'blur(8px)', y: 4 },
    { opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.4, ease: EASE_OUT, clearProps: 'opacity,transform,filter' }
  );
}
