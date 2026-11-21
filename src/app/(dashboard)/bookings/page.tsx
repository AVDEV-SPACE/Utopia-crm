// src/app/(dashboard)/bookings/page.tsx
'use client';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useLiveRefresh } from '@/hooks/use-live-refresh';
import { TableSkeleton } from '@/components/ui/skeleton';
import { fetchJson, peek } from '@/lib/data-cache';
import { PAGE_DATA } from '@/lib/navConfig';
import { Button } from '@/components/ui/button';
import { ALL, FilterSelect, SearchField, type FilterOption } from '@/components/filters/FilterControls';
import {
  BOOKING_STATUS_LABELS,
  BookingDetailSheet,
  toDateInput,
  type BookingRow,
} from '@/components/bookings/BookingDetailSheet';

export const dynamic = 'force-dynamic';

const REFRESH_MS = 15_000;
const ITEMS_PER_PAGE = 10;

const STATUS_OPTIONS: FilterOption[] = Object.entries(BOOKING_STATUS_LABELS).map(([value, label]) => ({ value, label }));

const STATUS_TONE: Record<string, string> = {
  pending: 'text-yellow-400 bg-yellow-500/10',
  confirmed: 'text-emerald-400 bg-emerald-500/10',
  completed: 'text-sky-300 bg-sky-500/10',
  cancelled: 'text-red-400 bg-red-500/10',
};

function BookingStatus({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[11px] font-medium whitespace-nowrap ${
        STATUS_TONE[status] ?? 'text-stone-300 bg-[var(--surface-2)]'
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {BOOKING_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatWhen(b: BookingRow) {
  const [y, m, d] = toDateInput(b.meeting_date).split('-').map(Number);
  return `${new Date(y, m - 1, d).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' })} · ${b.meeting_time.slice(0, 5)}`;
}

export default function BookingsPage() {
  // Din cache (vizită anterioară / preload la hover): tabelul apare instant, apoi se reîmprospătează
  const [bookings, setBookings] = useState<BookingRow[]>(() => peek<BookingRow[]>(PAGE_DATA.bookings) ?? []);
  const [loading, setLoading] = useState(() => !peek(PAGE_DATA.bookings));
  const [search, setSearch] = useState('');
  const [filterService, setFilterService] = useState(ALL);
  const [filterStatus, setFilterStatus] = useState(ALL);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeId, setActiveId] = useState<string | null>(null);

  // `quiet`: reîncărcare în fundal — fără spinner și fără să golească tabelul la o eroare
  const fetchBookings = useCallback(async (quiet = false) => {
    try {
      const data = await fetchJson<BookingRow[]>(PAGE_DATA.bookings);
      setBookings(data || []);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      if (!quiet && !peek(PAGE_DATA.bookings)) setBookings([]);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Skeleton-ul rămâne doar dacă nu există date în cache; altfel e o reîmprospătare
    fetchBookings();
  }, [fetchBookings]);

  // Programările făcute de agentul de pe site apar fără refresh
  useLiveRefresh(useCallback(() => fetchBookings(true), [fetchBookings]), REFRESH_MS);

  const services = useMemo(() => {
    const unique = new Set<string>();
    bookings.forEach((b) => {
      if (b.service?.trim()) unique.add(b.service.trim());
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'ro'));
  }, [bookings]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return bookings
      .filter((b) => filterService === ALL || b.service?.trim() === filterService)
      .filter((b) => filterStatus === ALL || b.status === filterStatus)
      .filter(
        (b) =>
          !q ||
          b.name?.toLowerCase().includes(q) ||
          b.email?.toLowerCase().includes(q) ||
          b.phone?.includes(q) ||
          b.service?.toLowerCase().includes(q)
      )
      // Cele mai noi primele
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [bookings, filterService, filterStatus, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  // Fișa citește rândul din listă, deci rămâne la zi după live refresh
  const activeBooking = bookings.find((b) => b.id === activeId) ?? null;

  const resetPageAnd = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setCurrentPage(1);
  };

  function handleUpdated(updated: BookingRow) {
    setBookings((prev) => prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title text-stone-100">Bookings</h1>
        <p className="text-sm text-stone-500">
          Programările făcute pe site și din CRM. Deschide un rând ca să editezi detaliile, data sau statusul.
        </p>
      </div>

      <section className="filter-bar sticky top-0 z-20 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchField
            value={search}
            onChange={resetPageAnd(setSearch)}
            placeholder="Caută după nume, email, telefon sau serviciu..."
            className="flex-1 min-w-[220px]"
          />
          <FilterSelect
            label="Serviciu"
            value={filterService}
            options={services.map((s) => ({ value: s, label: s }))}
            onChange={resetPageAnd(setFilterService)}
            allLabel="Toate"
          />
          <FilterSelect label="Status" value={filterStatus} options={STATUS_OPTIONS} onChange={resetPageAnd(setFilterStatus)} />
          {!loading && (
            <span className="ml-auto text-xs text-stone-500 tabular-nums">
              {filtered.length} {filtered.length === 1 ? 'programare' : 'programări'}
            </span>
          )}
        </div>
      </section>

      {loading ? (
        <TableSkeleton rows={ITEMS_PER_PAGE} cols={5} label="Se încarcă programările" />
      ) : filtered.length === 0 ? (
        <div className="table-shell text-center py-16 text-stone-500 text-sm">
          {bookings.length ? 'Nicio programare pentru filtrele curente.' : 'Nicio programare încă.'}
        </div>
      ) : (
        <>
          {/* Mobil */}
          <ul className="md:hidden space-y-2">
            {paginated.map((b) => (
              <li key={b.id} onClick={() => setActiveId(b.id)} className="glass-card p-3.5 cursor-pointer">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-stone-200 truncate">{b.name}</p>
                    <p className="text-xs text-stone-500 truncate">{b.service || b.email}</p>
                  </div>
                  <BookingStatus status={b.status} />
                </div>
                <p className="mt-2 text-xs text-stone-400 tabular-nums">{formatWhen(b)}</p>
              </li>
            ))}
          </ul>

          {/* Tabletă / desktop — click pe rând deschide fișa de editare */}
          <div className="table-shell hidden md:block">
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-stone-500 text-[11px] uppercase tracking-[0.08em] border-b border-[var(--card-border)]">
                    <th className="px-4 py-3 font-medium">Nume</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Telefon</th>
                    <th className="px-4 py-3 font-medium">Serviciu</th>
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((b) => (
                    <tr
                      key={b.id}
                      onClick={() => setActiveId(b.id)}
                      title="Deschide programarea"
                      className="border-b border-[var(--card-border)] last:border-0 cursor-pointer"
                    >
                      <td className="px-4 py-3 max-w-[280px]">
                        <p className="font-medium text-stone-200 truncate">{b.name}</p>
                        <p className="text-xs text-stone-500 truncate">{b.email}</p>
                      </td>
                      <td className="px-4 py-3 text-stone-400 tabular-nums hidden lg:table-cell">{b.phone || '—'}</td>
                      <td className="px-4 py-3">
                        {b.service ? (
                          <span className="inline-flex items-center h-6 px-2 rounded-md text-xs font-medium text-amber-400 bg-amber-500/10 max-w-[200px] truncate">
                            {b.service}
                          </span>
                        ) : (
                          <span className="text-stone-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-stone-300 whitespace-nowrap tabular-nums">{formatWhen(b)}</td>
                      <td className="px-4 py-3">
                        <BookingStatus status={b.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setCurrentPage(page - 1)}>
                Înapoi
              </Button>
              <span className="text-xs text-stone-500 tabular-nums">
                Pagina {page} din {totalPages} · {paginated.length} din {filtered.length}
              </span>
              <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setCurrentPage(page + 1)}>
                Înainte
              </Button>
            </div>
          )}
        </>
      )}

      <BookingDetailSheet
        booking={activeBooking}
        services={services}
        onClose={() => setActiveId(null)}
        onUpdated={handleUpdated}
      />
    </div>
  );
}
