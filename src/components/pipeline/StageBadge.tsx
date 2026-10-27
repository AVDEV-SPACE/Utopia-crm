import { STAGE_LABELS } from '@/services/pipeline/stages';

/** Culoarea etapei după poziția în pâlnie: gri → amber → verde; finale negative roșu. */
function stageClass(stage: string | null): string {
  switch (stage) {
    case 'WON':
      return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    case 'LOST':
    case 'DO_NOT_CONTACT':
    case 'AI_ERROR':
      return 'text-red-400 bg-red-500/10 border-red-500/20';
    case 'REPLIED':
    case 'INTERESTED':
    case 'CALL_BOOKED':
    case 'CALL_DONE':
    case 'PROPOSAL':
      return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    case 'CONTACTED':
    case 'OPENED':
    case 'QUEUED_EMAIL':
    case 'QUEUED_MANUAL':
      return 'text-sky-400 bg-sky-500/10 border-sky-500/20';
    default:
      return 'text-stone-400 bg-stone-800/50 border-stone-700/40';
  }
}

export function StageBadge({ stage }: { stage: string | null }) {
  return (
    <span
      title={stage ?? undefined}
      className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-md border text-[11px] font-medium ${stageClass(stage)}`}
    >
      {stage ? STAGE_LABELS[stage] ?? stage : '—'}
    </span>
  );
}
