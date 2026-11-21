import { LEAD_STATUS_LABELS } from '@/services/leads/types';

/** Scorul pe praguri: <40 roșu, <70 galben, altfel verde (culori semantice). */
export function ScoreBadge({ score, title }: { score: number | null; title?: string }) {
  const tone =
    score === null
      ? 'text-stone-500 bg-[var(--surface-2)]'
      : score < 40
      ? 'text-red-400 bg-red-500/10 ring-1 ring-inset ring-red-500/25'
      : score < 70
      ? 'text-yellow-400 bg-yellow-500/10 ring-1 ring-inset ring-yellow-500/25'
      : 'text-emerald-400 bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/25';
  return (
    <span
      title={title}
      className={`inline-flex items-center justify-center min-w-9 h-6 px-2 rounded-md text-xs font-semibold tabular-nums ${tone}`}
    >
      {score ?? '—'}
    </span>
  );
}

const STATUS_TONE: Record<string, string> = {
  new: 'text-stone-300 bg-[var(--surface-2)]',
  scored: 'text-violet-300 bg-violet-500/10',
  pitch_ready: 'text-amber-400 bg-amber-500/10',
  sent: 'text-sky-300 bg-sky-500/10',
  replied: 'text-emerald-400 bg-emerald-500/10',
  negotiating: 'text-emerald-400 bg-emerald-500/10',
  won: 'text-emerald-300 bg-emerald-500/15',
  lost: 'text-red-400 bg-red-500/10',
  MISSED_CALL: 'text-amber-400 bg-amber-500/10',
  WEB_FORM: 'text-amber-400 bg-amber-500/10',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[11px] font-medium whitespace-nowrap ${
        STATUS_TONE[status] ?? STATUS_TONE.new
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {LEAD_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** Domeniul afișat al unui website: fără schemă, `www.` și slash final. */
export function displayDomain(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[/?#].*$/, '');
}

/** Linkurile importate pot veni fără schemă. */
export const websiteHref = (value: string) => (/^https?:\/\//i.test(value) ? value : `https://${value}`);
