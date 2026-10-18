'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { Check, ArrowUpRight } from 'lucide-react';

import styles from './overview.module.css';

interface Booking {
  id:           string;
  name:         string;
  email:        string;
  meeting_date: string;
  meeting_time: string;
  service:      string | null;
  status:       string;
  created_at:   string;
}

interface TodayBooking {
  id:      string;
  name:    string;
  email:   string;
  time:    string;
  service: string | null;
  status:  string;
}

interface OverviewData {
  bookings:      Booking[];
  bookingsTotal: number;
  bookingsMonth: number;
  pitched: {
    total: number; thisMonth: number; lastMonth: number;
    messages: number; leadsTotal: number;
  };
  pitchedTrend: number[];
  activity:     { date: string; bookings: number; chats: number }[];
  today:        TodayBooking[];
}

interface GAData {
  configured: boolean;
  pageviews:  number | null;
  sessions?:  number | null;
  error?:     string;
  reportUrl?: string;
}

// ─── Utilitare ─────────────────────────────────────────────────────────────
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

/**
 * `2026-10-17` → Date locală. Coloanele `date` vin serializate ca ISO UTC
 * (`2026-10-16T21:00:00.000Z` = miezul nopții local), deci acelea se citesc ca instant.
 */
function parseDay(value: string): Date {
  if (value.includes('T')) {
    const t = new Date(value);
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const fmtDay   = (v: string) => parseDay(v).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
const fmtTime  = (v: string) => v.slice(0, 5);
const fmtCount = (n: number) => n.toLocaleString('ro-RO');
const capital  = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 12) return 'Bună dimineața';
  if (h < 18) return 'Bună ziua';
  return 'Bună seara';
}

// ─── Status pills ──────────────────────────────────────────────────────────
type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

const STATUS: Record<string, { label: string; tone: Tone }> = {
  confirmed: { label: 'Confirmată',   tone: 'success' },
  completed: { label: 'Finalizată',   tone: 'info'    },
  pending:   { label: 'În așteptare', tone: 'warning' },
  cancelled: { label: 'Anulată',      tone: 'danger'  },
};

const TONE_CLASS: Record<Tone, string> = {
  success: 'text-[var(--ov-success)] bg-[var(--ov-success-bg)]',
  warning: 'text-[var(--ov-warning)] bg-[var(--ov-warning-bg)]',
  danger:  'text-[var(--ov-danger)]  bg-[var(--ov-danger-bg)]',
  info:    'text-[var(--ov-info)]    bg-[var(--ov-info-bg)]',
  muted:   'text-[var(--ov-muted)]   bg-[var(--ov-border)]',
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: capital(status), tone: 'muted' as Tone };
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap', TONE_CLASS[s.tone])}>
      {s.tone === 'success'
        ? <Check className="w-3 h-3" strokeWidth={3} />
        : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {s.label}
    </span>
  );
}

// ─── Blocuri de layout ─────────────────────────────────────────────────────
const card = 'rounded-2xl border border-[var(--ov-border)] bg-[var(--ov-surface)]';

/** Cardurile KPI deschid ruta cu datele lor — feedback discret la hover/focus. */
const kpiLink =
  'cursor-pointer transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_6px_24px_-12px_rgb(0_0_0/.45)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ov-accent)]';

/** Cardul GA duce la raportul din Google Analytics, când GA4 e configurat. */
function GALink({ url, className, children }: { url?: string; className: string; children: React.ReactNode }) {
  if (!url) return <div className={className}>{children}</div>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title="Deschide raportul în Google Analytics" className={cx(className, kpiLink)}>
      {children}
    </a>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const pts = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const max = Math.max(...pts, 1);
  const W = 300, H = 64;
  const coords = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 4 - (v / max) * (H - 10)]);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-16" aria-hidden>
      <defs>
        <linearGradient id="ov-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="var(--ov-accent)" stopOpacity=".35" />
          <stop offset="100%" stopColor="var(--ov-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#ov-spark)" />
      <path d={line} fill="none" stroke="var(--ov-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ActivityChart({ data }: { data: OverviewData['activity'] }) {
  const max = Math.max(1, ...data.flatMap(d => [d.bookings, d.chats]));

  return (
    <div>
      <div className="flex items-end gap-1 h-48 border-b border-[var(--ov-border)]">
        {data.map(d => (
          <div
            key={d.date}
            className="flex-1 h-full flex items-end justify-center gap-[3px]"
            title={`${fmtDay(d.date)} · ${d.bookings} bookings · ${d.chats} chat`}
          >
            <span className="w-[34%] max-w-[12px] rounded-t-[3px] bg-[var(--ov-ink)]"
                  style={{ height: `${Math.max(d.bookings ? 4 : 1, (d.bookings / max) * 100)}%` }} />
            <span className="w-[34%] max-w-[12px] rounded-t-[3px] bg-[var(--ov-accent)]"
                  style={{ height: `${Math.max(d.chats ? 4 : 1, (d.chats / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className={cx(styles.mono, 'flex gap-1 mt-2 text-[10px] text-[var(--ov-muted)]')}>
        {data.map((d, i) => (
          <span key={d.date} className="flex-1 text-center leading-tight">
            {i % 2 === 0 && (
              <>
                {parseDay(d.date).toLocaleDateString('ro-RO', { month: 'short' }).replace('.', '')}
                <br />
                {parseDay(d.date).getDate()}
              </>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
const FILTERS = [
  { key: 'all',       label: 'Toate'        },
  { key: 'confirmed', label: 'Confirmate'   },
  { key: 'pending',   label: 'În așteptare' },
  { key: 'cancelled', label: 'Anulate'      },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

export default function OverviewPage() {
  const { user } = useUser();
  const [data,    setData]    = useState<OverviewData | null>(null);
  const [ga,      setGA]      = useState<GAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [now,     setNow]     = useState<Date | null>(null);
  const [filter,  setFilter]  = useState<FilterKey>('all');

  // Un singur request în zbor: tick-urile de polling nu se suprapun, iar la
  // părăsirea paginii request-ul curent e anulat, ca să nu țină conexiuni ocupate.
  const inFlight = useRef<AbortController | null>(null);

  const fetchOverview = useCallback(async () => {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const res = await fetch('/api/overview', { signal: controller.signal });
      if (!res.ok) return;
      const json = await res.json();
      setData({
        bookings:      json.bookings ?? [],
        bookingsTotal: json.metrics?.bookingsTotal     ?? 0,
        bookingsMonth: json.metrics?.bookingsThisMonth ?? 0,
        pitched:       json.pitched ?? { total: 0, thisMonth: 0, lastMonth: 0, messages: 0, leadsTotal: 0 },
        pitchedTrend:  json.pitchedTrend ?? [],
        activity:      json.activity     ?? [],
        today:         json.today        ?? [],
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('Overview fetch error:', err);
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Data se calculează doar pe client, ca salutul să nu difere la hidratare
    setNow(new Date());
    fetchOverview();

    // GA e opțional și lent (token + API Google) — o singură citire, fără polling
    const gaController = new AbortController();
    fetch('/api/analytics/pageviews', { signal: gaController.signal })
      .then(res => (res.ok ? res.json() : null))
      .then(json => json && setGA(json))
      .catch(() => {});

    // Polling doar cât tab-ul e vizibil
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchOverview();
    }, 30_000);

    return () => {
      clearInterval(interval);
      gaController.abort();
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [fetchOverview]);

  const recent = useMemo(() => {
    const list = data?.bookings ?? [];
    return (filter === 'all' ? list : list.filter(b => b.status === filter)).slice(0, 8);
  }, [data, filter]);

  // Defalcarea bookings pe status, pentru bara segmentată din cardul „Total bookings”
  const byStatus = useMemo(() => {
    const counts = { confirmed: 0, pending: 0, other: 0 };
    for (const b of data?.bookings ?? []) {
      if (b.status === 'confirmed' || b.status === 'completed') counts.confirmed++;
      else if (b.status === 'pending') counts.pending++;
      else counts.other++;
    }
    return counts;
  }, [data]);

  const firstName = user?.firstName?.trim();
  const pt = data?.pitched;

  const delta = !pt
    ? null
    : pt.lastMonth === 0
      ? (pt.thisMonth > 0 ? `+${pt.thisMonth} luna asta` : null)
      : `${pt.thisMonth >= pt.lastMonth ? '+' : '−'}${Math.abs(((pt.thisMonth - pt.lastMonth) / pt.lastMonth) * 100).toFixed(1)}%`;

  const pitchRate = pt && pt.leadsTotal ? (pt.total / pt.leadsTotal) * 100 : 0;

  const activityTotal  = (data?.activity ?? []).reduce((s, d) => s + d.bookings, 0);
  const chatsTotal     = (data?.activity ?? []).reduce((s, d) => s + d.chats, 0);
  const todayConfirmed = (data?.today ?? []).filter(b => b.status === 'confirmed' || b.status === 'completed').length;

  return (
    <div className={cx(styles.root, '-m-6 lg:-m-8 min-h-full p-6 lg:p-10')}>
      <div className="max-w-[1180px] mx-auto space-y-5">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
          <div>
            <p className={cx(styles.mono, 'text-[11px] font-medium uppercase tracking-[.14em] text-[var(--ov-muted)] h-4')}>
              {now && `${now.toLocaleDateString('ro-RO', { weekday: 'long' })} · ${now.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' })}`}
            </p>
            <h1 className="page-title mt-1">
              {now ? greeting(now) : 'Bună ziua'}{firstName && `, ${firstName}`}
              <span className="text-[var(--ov-accent)]">.</span>
            </h1>
          </div>
          <Link
            href="/bookings"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--ov-ink)] text-[var(--ov-bg)] px-4 py-2.5 text-[13px] font-medium hover:opacity-90 transition-opacity"
          >
            <span className="text-[var(--ov-accent)]">+</span> Toate programările
          </Link>
        </div>

        {loading || !data || !pt ? (
          <div className="flex items-center gap-3 text-[var(--ov-muted)] py-16">
            <div className="w-5 h-5 border-2 border-[var(--ov-border)] border-t-[var(--ov-accent)] rounded-full animate-spin" />
            <span>Se încarcă datele...</span>
          </div>
        ) : (
          <>
            {/* ── KPI ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Pitched */}
              <Link href="/leads?view=pitched" title="Vezi pitch-urile trimise" className={cx(kpiLink, 'rounded-2xl bg-[var(--ov-hero)] text-[var(--ov-hero-ink)] p-5 pb-3 md:col-span-2 lg:col-span-1 flex flex-col')}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[13px] font-medium text-[var(--ov-hero-muted)]">Pitched · lead-uri contactate</p>
                  {delta && (
                    <span className={cx(styles.mono, 'rounded-full px-2 py-0.5 text-[11px] font-medium bg-[var(--ov-accent)] text-white')}>
                      {delta}
                    </span>
                  )}
                </div>
                <p className="mt-3 leading-none">
                  <span className={cx(styles.serif, styles.num, 'text-[48px]')}>{fmtCount(pt.total)}</span>
                  {pt.leadsTotal > 0 && (
                    <span className="ml-2 text-base text-[var(--ov-hero-muted)]">din {fmtCount(pt.leadsTotal)}</span>
                  )}
                </p>
                <p className={cx(styles.mono, 'mt-2 text-[11px] text-[var(--ov-hero-muted)]')}>
                  {pitchRate.toFixed(1)}% din lead-uri · {fmtCount(pt.messages)} mesaje trimise
                </p>
                <div className="mt-auto pt-2">
                  <Sparkline values={data.pitchedTrend} />
                </div>
              </Link>

              {/* Total bookings */}
              <Link href="/bookings" title="Vezi toate programările" className={cx(card, kpiLink, 'p-5')}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[13px] font-medium text-[var(--ov-muted)]">Total bookings</p>
                  <span className={cx(styles.mono, 'text-[11px] text-[var(--ov-muted)]')}>+{fmtCount(data.bookingsMonth)} luna asta</span>
                </div>
                <p className="mt-3 leading-none">
                  <span className={cx(styles.serif, styles.num, 'text-[36px]')}>{fmtCount(data.bookingsTotal)}</span>
                  <span className="ml-1.5 text-base text-[var(--ov-muted)]">programări</span>
                </p>
                <div className="flex gap-1.5 mt-5 h-1.5">
                  {[
                    { v: byStatus.confirmed, c: 'bg-[var(--ov-success)]' },
                    { v: byStatus.pending,   c: 'bg-[var(--ov-warning)]' },
                    { v: byStatus.other,     c: 'bg-[var(--ov-danger)]'  },
                  ].map((s, i) => (
                    <span key={i} className={cx('rounded-full', data.bookingsTotal ? s.c : 'bg-[var(--ov-border)]')}
                          style={{ flexGrow: data.bookingsTotal ? Math.max(s.v, data.bookingsTotal * 0.04) : 1 }} />
                  ))}
                </div>
                <div className="flex gap-4 mt-2.5 text-[12px] text-[var(--ov-muted)]">
                  <span>Confirmate <b className={cx(styles.mono, 'font-medium text-[var(--ov-ink)]')}>{byStatus.confirmed}</b></span>
                  <span>În așteptare <b className={cx(styles.mono, 'font-medium text-[var(--ov-ink)]')}>{byStatus.pending}</b></span>
                  <span>Anulate <b className={cx(styles.mono, 'font-medium text-[var(--ov-ink)]')}>{byStatus.other}</b></span>
                </div>
              </Link>

              {/* Google Analytics */}
              <GALink url={ga?.reportUrl} className={cx(card, 'p-5')}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[13px] font-medium text-[var(--ov-muted)]">Site · Google Analytics</p>
                  <span className={cx(styles.mono, 'text-[11px] text-[var(--ov-muted)]')}>ultimele 30 zile</span>
                </div>
                {!ga ? (
                  <p className={cx(styles.serif, 'mt-3 text-[36px] leading-none text-[var(--ov-muted)] animate-pulse')}>—</p>
                ) : !ga.configured ? (
                  <>
                    <p className={cx(styles.serif, 'mt-3 text-[36px] leading-none text-[var(--ov-muted)]')}>—</p>
                    <p className="mt-5 text-[12px] text-[var(--ov-muted)]">
                      Adaugă <code className={cx(styles.mono, 'text-[var(--ov-accent)]')}>GA4_PROPERTY_ID</code> în <code className={styles.mono}>.env</code> pentru a activa
                    </p>
                  </>
                ) : ga.pageviews == null ? (
                  <>
                    <p className={cx(styles.serif, 'mt-3 text-[36px] leading-none text-[var(--ov-muted)]')}>—</p>
                    <p className="mt-5 text-[12px] text-[var(--ov-danger)]">Datele GA4 nu au putut fi încărcate</p>
                  </>
                ) : (
                  <>
                    <p className="mt-3 leading-none">
                      <span className={cx(styles.serif, styles.num, 'text-[36px]')}>{fmtCount(ga.pageviews)}</span>
                      <span className="ml-1.5 text-base text-[var(--ov-muted)]">vizualizări</span>
                    </p>
                    <p className="mt-5 text-[12px] text-[var(--ov-muted)]">
                      <b className="font-medium text-[var(--ov-ink)]">{fmtCount(ga.sessions ?? 0)} sesiuni</b>
                      {ga.sessions ? ` · ${(ga.pageviews / ga.sessions).toFixed(1)} pagini / sesiune` : ''}
                    </p>
                  </>
                )}
              </GALink>
            </div>

            {/* ── Activitate + Azi ────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className={cx(card, 'p-5 lg:col-span-2')}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                  <div>
                    <p className="text-[13px] font-medium text-[var(--ov-muted)]">Activitate · ultimele 14 zile</p>
                    <p className="mt-1.5 leading-none">
                      <span className={cx(styles.serif, styles.num, 'text-[28px]')}>+{fmtCount(activityTotal)}</span>
                      <span className={cx(styles.mono, 'ml-2 text-[11px] text-[var(--ov-success)]')}>bookings noi</span>
                      <span className={cx(styles.mono, 'ml-2 text-[11px] text-[var(--ov-muted)]')}>· {fmtCount(chatsTotal)} chat</span>
                    </p>
                  </div>
                  <div className={cx(styles.mono, 'flex gap-4 text-[11px] text-[var(--ov-muted)]')}>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-[2px] bg-[var(--ov-ink)]" />Bookings</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-[2px] bg-[var(--ov-accent)]" />Sesiuni chat</span>
                  </div>
                </div>
                <ActivityChart data={data.activity} />
              </div>

              <div className={cx(card, 'p-5 flex flex-col')}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[13px] font-medium text-[var(--ov-muted)]">Programările de azi</p>
                  <span className={cx(styles.mono, 'text-[11px] text-[var(--ov-muted)]')}>
                    {todayConfirmed} / {data.today.length} confirmate
                  </span>
                </div>
                <div className="h-1 rounded-full bg-[var(--ov-border)] mt-3 overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--ov-success)] transition-[width]"
                       style={{ width: `${data.today.length ? (todayConfirmed / data.today.length) * 100 : 0}%` }} />
                </div>

                {data.today.length === 0 ? (
                  <p className="text-[13px] text-[var(--ov-muted)] m-auto py-8">Nicio programare azi.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-[var(--ov-border)]">
                    {data.today.map(b => {
                      const done = b.status === 'confirmed' || b.status === 'completed';
                      return (
                        <li key={b.id} className="flex items-center gap-3 py-2.5">
                          <span className={cx(
                            'w-5 h-5 shrink-0 rounded-full grid place-items-center',
                            done ? 'bg-[var(--ov-success)] text-white' : 'border-[1.5px] border-dashed border-[var(--ov-muted)]'
                          )}>
                            {done && <Check className="w-3 h-3" strokeWidth={3} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-medium truncate">{b.name}</p>
                            <p className={cx(styles.mono, 'text-[11px] text-[var(--ov-muted)] truncate')}>{b.service ?? b.email}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={cx(styles.mono, styles.num, 'text-[13px] font-medium')}>{fmtTime(b.time)}</p>
                            <p className={cx('text-[11px]', done ? 'text-[var(--ov-success)]' : 'text-[var(--ov-warning)]')}>
                              {STATUS[b.status]?.label ?? b.status}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* ── Programări recente ──────────────────────────────── */}
            <div className={cx(card, 'p-5')}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-baseline gap-2">
                  <h2 className={cx(styles.serif, 'text-[22px] leading-none')}>Programări recente</h2>
                  <span className={cx(styles.mono, 'text-[11px] text-[var(--ov-muted)]')}>{recent.length} afișate</span>
                </div>
                <div className="flex rounded-full border border-[var(--ov-border)] p-0.5 text-[12px]">
                  {FILTERS.map(f => (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      className={cx(
                        'rounded-full px-3 py-1 transition-colors',
                        filter === f.key ? 'bg-[var(--ov-ink)] text-[var(--ov-bg)]' : 'text-[var(--ov-muted)] hover:text-[var(--ov-ink)]'
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto -mx-5">
                <table className="w-full min-w-[620px] text-left">
                  <thead>
                    <tr className={cx(styles.mono, 'text-[10px] uppercase tracking-[.1em] text-[var(--ov-muted)]')}>
                      <th className="font-medium px-5 py-2">Client</th>
                      <th className="font-medium px-3 py-2">Data</th>
                      <th className="font-medium px-3 py-2 text-right">Ora</th>
                      <th className="font-medium px-3 py-2">Status</th>
                      <th className="px-5 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {recent.length === 0 ? (
                      <tr><td colSpan={5} className="px-5 py-10 text-center text-[13px] text-[var(--ov-muted)]">Nicio programare.</td></tr>
                    ) : recent.map(b => (
                      <tr key={b.id} className="group border-t border-[var(--ov-border)] hover:bg-[var(--ov-bg)] transition-colors">
                        <td className="px-5 py-3">
                          <p className="text-[14px] font-medium">{b.name}</p>
                          <p className={cx(styles.mono, 'text-[11px] text-[var(--ov-muted)]')}>
                            {b.email}{b.service && ` · ${b.service}`}
                          </p>
                        </td>
                        <td className={cx(styles.mono, 'px-3 py-3 text-[13px]')}>{b.meeting_date ? fmtDay(b.meeting_date) : '—'}</td>
                        <td className={cx(styles.mono, styles.num, 'px-3 py-3 text-[13px] font-medium text-right')}>{b.meeting_time ? fmtTime(b.meeting_time) : '—'}</td>
                        <td className="px-3 py-3"><StatusPill status={b.status} /></td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            href="/bookings"
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--ov-accent)] text-white px-2.5 py-1 text-[11px] font-medium opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                          >
                            Deschide <ArrowUpRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
