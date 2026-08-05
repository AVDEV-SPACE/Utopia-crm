'use client';

import { useState, useEffect, useCallback } from 'react';
import { DailyBarChart }   from '@/components/charts/DailyBarChart';
import { ServicePieChart } from '@/components/charts/ServicePieChart';

interface Metrics {
  bookingsTotal:         number;
  bookingsThisMonth:     number;
  bookingsToday:         number;
  chatSessionsTotal:     number;
  chatSessionsThisMonth: number;
}

interface OverviewData {
  metrics:     Metrics;
  dailyData:   { date: string;    count:   number }[];
  serviceData: { service: string; count:   number }[];
}

interface GAData {
  configured: boolean;
  pageviews:  number | null;
  sessions:   number | null;
}

// ─── Card simplu pentru metrici ────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label:    string;
  value:    string | number;
  sub?:     string;
  accent?:  boolean;
}) {
  return (
    <div className="bg-neutral-800/60 border border-neutral-700/50 rounded-2xl p-5 hover:border-orange-500/20 transition-colors">
      {sub && (
        <p className="text-xs text-neutral-500 uppercase tracking-widest mb-3">{sub}</p>
      )}
      <p className={`text-3xl font-light mb-1 ${accent ? 'text-orange-400' : 'text-white'}`}>
        {value}
      </p>
      <p className="text-xs text-neutral-400 uppercase tracking-wider">{label}</p>
    </div>
  );
}

// ─── Card vizualizări site (GA4) ───────────────────────────────────────────
function SiteViewsCard({ ga }: { ga: GAData | null }) {
  if (!ga) {
    return (
      <div className="bg-neutral-800/60 border border-neutral-700/50 rounded-2xl p-5 animate-pulse">
        <p className="text-xs text-neutral-500 uppercase tracking-widest mb-3">Site Analytics</p>
        <p className="text-3xl font-light text-neutral-600 mb-1">—</p>
        <p className="text-xs text-neutral-500 uppercase tracking-wider">Se încarcă...</p>
      </div>
    );
  }

  if (!ga.configured) {
    return (
      <div className="bg-neutral-800/60 border border-dashed border-neutral-600 rounded-2xl p-5">
        <p className="text-xs text-neutral-500 uppercase tracking-widest mb-3">Site Analytics</p>
        <p className="text-3xl font-light text-neutral-600 mb-1">—</p>
        <p className="text-xs text-neutral-500 uppercase tracking-wider">
          Vizualizări site
        </p>
        <p className="text-xs text-neutral-600 mt-2 leading-relaxed">
          Adaugă{' '}
          <span className="text-orange-500/70 font-mono">GA4_PROPERTY_ID</span> în{' '}
          <span className="font-mono">.env</span> pentru a activa
        </p>
      </div>
    );
  }

  return (
    <div className="bg-neutral-800/60 border border-neutral-700/50 rounded-2xl p-5 hover:border-orange-500/20 transition-colors">
      <p className="text-xs text-neutral-500 uppercase tracking-widest mb-3">Site — 30 zile</p>
      <p className="text-3xl font-light text-white mb-1">
        {ga.pageviews?.toLocaleString('ro-RO') ?? '—'}
      </p>
      <p className="text-xs text-neutral-400 uppercase tracking-wider">Vizualizări pagini</p>
      {ga.sessions != null && (
        <p className="text-xs text-neutral-600 mt-2">
          {ga.sessions.toLocaleString('ro-RO')} sesiuni
        </p>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [data,    setData]    = useState<OverviewData | null>(null);
  const [ga,      setGA]      = useState<GAData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/overview');
      if (!res.ok) return;
      const json = await res.json();
      setData({
        metrics: json.metrics ?? {
          bookingsTotal: 0, bookingsThisMonth: 0, bookingsToday: 0,
          chatSessionsTotal: 0, chatSessionsThisMonth: 0,
        },
        dailyData:   json.dailyData   ?? [],
        serviceData: json.serviceData ?? [],
      });
    } catch (err) {
      console.error('Overview fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGA = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics/pageviews');
      if (res.ok) setGA(await res.json());
    } catch {
      // GA opțional — nu blochează pagina
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    fetchGA();
    const interval = setInterval(fetchOverview, 30_000);
    return () => clearInterval(interval);
  }, [fetchOverview, fetchGA]);

  const m = data?.metrics;
  // Ultimele 7 zile pentru graficul zilnic
  const last7 = data?.dailyData?.slice(-7) ?? [];

  return (
    <div className="p-6 space-y-8 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Overview</h1>
        <p className="text-neutral-400 text-sm mt-1">
          Metrici în timp real · Utopia Systems
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-neutral-500 py-16">
          <div className="w-5 h-5 border-2 border-neutral-700 border-t-orange-500 rounded-full animate-spin" />
          <span>Se încarcă datele...</span>
        </div>
      ) : (
        <>
          {/* ── Stat cards ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard
              label="Bookings astăzi"
              value={m?.bookingsToday ?? 0}
              sub="Azi"
              accent
            />
            <StatCard
              label="Bookings luna aceasta"
              value={m?.bookingsThisMonth ?? 0}
              sub="Luna aceasta"
            />
            <StatCard
              label="Total bookings"
              value={m?.bookingsTotal ?? 0}
              sub="All time"
            />
            <StatCard
              label="Sesiuni chat — luna aceasta"
              value={m?.chatSessionsThisMonth ?? 0}
              sub="ChatWidget"
            />
            <StatCard
              label="Total sesiuni chat"
              value={m?.chatSessionsTotal ?? 0}
              sub="All time"
            />
            <SiteViewsCard ga={ga} />
          </div>

          {/* ── Grafice ───────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DailyBarChart data={last7} />
            <ServicePieChart data={data?.serviceData ?? []} />
          </div>
        </>
      )}
    </div>
  );
}
