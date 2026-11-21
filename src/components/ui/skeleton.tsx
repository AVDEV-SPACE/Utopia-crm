// Skeleton-uri cu forma layout-ului final (carduri, rânduri de tabel), ca la
// sosirea datelor să nu se miște nimic. Shimmer-ul se oprește cu reduced-motion.
import type { CSSProperties } from 'react';

export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={`skeleton ${className}`} style={style} />;
}

/** Lățimi variate pe rânduri, ca lista să nu arate ca o grilă perfectă. */
const WIDTHS = ['72%', '58%', '84%', '64%', '76%', '52%', '68%', '80%'];

/** Tabel: același container (`table-shell`), același header și aceeași înălțime de rând. */
export function TableSkeleton({ rows = 8, cols = 5, label = 'Se încarcă' }: { rows?: number; cols?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true">
      {/* Mobil: carduri */}
      <ul className="md:hidden space-y-2">
        {Array.from({ length: Math.min(rows, 5) }, (_, i) => (
          <li key={i} className="glass-card p-3.5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5" style={{ width: WIDTHS[i % WIDTHS.length] }} />
                <Skeleton className="h-3 w-2/5" />
              </div>
              <Skeleton className="h-6 w-9 rounded-md" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </li>
        ))}
      </ul>

      <div className="table-shell hidden md:block">
        <div className="flex gap-6 px-4 py-3.5 border-b border-[var(--card-border)]">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-2.5" style={{ width: c === 0 ? '18%' : '9%' }} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-6 px-4 h-[61px] border-b border-[var(--card-border)] last:border-0">
            <div className="w-[28%] space-y-2">
              <Skeleton className="h-3.5" style={{ width: WIDTHS[r % WIDTHS.length] }} />
              <Skeleton className="h-3 w-1/2" />
            </div>
            {Array.from({ length: cols - 1 }, (_, c) => (
              <Skeleton
                key={c}
                className={c === cols - 2 ? 'h-8 w-32 ml-auto rounded-[10px]' : 'h-6 rounded-md'}
                style={c === cols - 2 ? undefined : { width: c % 2 ? '7%' : '11%' }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Card generic: titlu, cifră mare, două rânduri de text. */
export function CardSkeleton({ className = '', height }: { className?: string; height?: number }) {
  return (
    <div className={`glass-card p-5 flex flex-col gap-3 ${className}`} style={height ? { height } : undefined} aria-hidden>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <Skeleton className="h-10 w-32 mt-1" />
      <Skeleton className="h-2 w-full rounded-full" />
      <Skeleton className="h-3 w-3/5" />
      <div className="mt-auto">
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
  );
}

/** Listă (inbox, conversații, notițe): avatar + două rânduri. */
export function ListSkeleton({ rows = 6, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-busy="true" aria-label="Se încarcă">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--surface-1)]">
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5" style={{ width: WIDTHS[i % WIDTHS.length] }} />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Pagina generică (folosită de `loading.tsx` la navigare): titlu, KPI-uri, tabel. */
export function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Se încarcă pagina">
      <div className="space-y-3">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-3.5 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="glass-card px-4 py-3 space-y-2.5">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-7 w-14" />
          </div>
        ))}
      </div>
      <TableSkeleton rows={6} />
    </div>
  );
}

/** Firul unei conversații: bule alternante stânga/dreapta. */
export function MessagesSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-1" role="status" aria-busy="true" aria-label="Se încarcă mesajele">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`flex ${i % 2 ? 'justify-end' : 'justify-start'}`}>
          <Skeleton className="h-12 rounded-2xl" style={{ width: ['58%', '42%', '66%', '36%', '50%'][i % 5] }} />
        </div>
      ))}
    </div>
  );
}

/** Pagină de chat: lista de conversații + firul deschis. */
export function ChatSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Se încarcă conversațiile">
      <Skeleton className="h-10 w-56 rounded-lg" />
      <div className="grid md:grid-cols-[320px_1fr] gap-4">
        <ListSkeleton rows={7} />
        <div className="glass-card hidden md:block p-4 h-[520px]">
          <MessagesSkeleton rows={6} />
        </div>
      </div>
    </div>
  );
}

/** Fișă laterală: câmpuri de formular în două coloane. */
export function SheetSkeleton() {
  return (
    <div className="p-4 space-y-6" role="status" aria-busy="true" aria-label="Se încarcă">
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-7 w-24 rounded-full" />)}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}

/** Grilă de imagini (biblioteca media). */
export function MediaGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2" role="status" aria-busy="true" aria-label="Se încarcă">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className="aspect-square w-full rounded-lg" />)}
    </div>
  );
}
