'use client';

import {
  Loader2, Sparkles, Eye, MessageCircle, Pencil, Mail, Smartphone, Instagram, Send, Trash2,
  MoreHorizontal, Copy, Inbox,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatWhatsAppLink } from '@/lib/utils';
import { logWhatsAppSend } from '@/lib/sent-messages-client';
import { Lead } from '@/services/leads/types';
import type { PitchSummary } from '@/services/messages/repository';
import { ScoreBadge, StatusPill, displayDomain, websiteHref } from './badges';
import { TableSkeleton } from '@/components/ui/skeleton';

interface LeadsTableProps {
  leads: Lead[];
  loading: boolean;
  generatingId: string | null;
  onGeneratePitch: (lead: Lead) => void;
  onOpenPitch: (lead: Lead) => void;
  /** Deschide fișa lead-ului pe tab-ul de detalii/editare (și click pe rând). */
  onOpenDetails: (lead: Lead) => void;
  /** Apelat după jurnalizarea unui mesaj WhatsApp (statusul lead-ului s-a schimbat). */
  onWhatsAppOpened?: () => void;
  emptyMessage?: string;
  /**
   * Arată rating-ul Google alături de scor. Lead-urile importate din spreadsheet
   * n-au trecut prin PageSpeed, deci scorul lor e gol, în timp ce rating-ul
   * chiar spune ceva despre firmă — iar cele scanate au exact invers.
   */
  showRating?: boolean;
  /** Afișează coloana „Sursă" (de unde a intrat lead-ul în CRM). */
  showSource?: boolean;
  /** Sumarul trimiterilor, pe id de lead. Prezența lui adaugă coloana „Pitched". */
  pitched?: Record<string, PitchSummary>;
  /** Deschide mesajele trimise către lead (fișa, tab-ul „Mesaje"). */
  onOpenMessages?: (lead: Lead) => void;
  /** Șterge definitiv lead-ul. Apelantul cere confirmarea. */
  onDelete?: (lead: Lead) => void;
  /** Id-ul lead-ului aflat în curs de ștergere. */
  deletingId?: string | null;
  /** Lead-urile care au același domeniu sau telefon cu altul din listă. */
  duplicateIds?: Set<string>;
}

/** Statusuri care înseamnă că pitch-ul a plecat deja. */
const PITCHED_STATUSES = new Set(['sent', 'replied', 'negotiating', 'won', 'lost']);

const SOURCE_LABELS: Record<string, string> = {
  sheet: 'Google Sheet',
  crm: 'Lead Generation',
  missed_call: 'Apel pierdut',
  website: 'Site',
  engine: 'Motor leaduri',
  linkedin: 'Import CSV',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

const CHANNEL_META: Record<string, { label: string; icon: typeof Mail }> = {
  email: { label: 'Email', icon: Mail },
  sms: { label: 'SMS', icon: Smartphone },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  instagram: { label: 'Instagram', icon: Instagram },
};

async function copy(value: string, what: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${what} copiat.`);
  } catch {
    toast.error('Nu am putut copia în clipboard.');
  }
}

export function LeadsTable(props: LeadsTableProps) {
  const { leads, loading, emptyMessage, showRating = false, showSource = false, pitched, duplicateIds, onOpenDetails } = props;

  if (loading) {
    return (
      <TableSkeleton rows={8} cols={5} label="Se încarcă lead-urile" />
    );
  }

  if (leads.length === 0) {
    return (
      <div className="table-shell text-center py-16 text-stone-500 text-sm">
        {emptyMessage ?? 'Niciun lead încă. Scanează o nișă și o locație pentru a începe.'}
      </div>
    );
  }

  const showPitched = Boolean(pitched);

  return (
    <>
      {/* Mobil: carduri cu numele, scorul, statusul și acțiunea primară */}
      <ul className="md:hidden space-y-2">
        {leads.map((lead) => (
          <li
            key={lead.id}
            onClick={() => onOpenDetails(lead)}
            className="glass-card p-3.5 cursor-pointer"
          >
            <div className="flex items-start justify-between gap-3">
              <LeadName lead={lead} duplicate={duplicateIds?.has(lead.id)} />
              <ScoreBadge score={lead.score} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
              <StatusPill status={lead.status} />
              <RowActions {...props} lead={lead} />
            </div>
          </li>
        ))}
      </ul>

      {/* Tabletă/desktop: o singură acțiune primară pe rând, restul în meniul ⋯ —
          coloanele secundare apar doar pe ecrane late, deci nu există scroll orizontal */}
      <div className="table-shell hidden md:block">
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500 text-[11px] uppercase tracking-[0.08em] border-b border-[var(--card-border)]">
                <th className="px-4 py-3 font-medium">Nume</th>
                <th className="px-4 py-3 font-medium hidden xl:table-cell">Website</th>
                <th className="px-4 py-3 font-medium">{showRating ? 'Rating / Scor' : 'Scor'}</th>
                {showSource && <th className="px-4 py-3 font-medium hidden xl:table-cell">Sursă</th>}
                {showPitched && <th className="px-4 py-3 font-medium hidden xl:table-cell">Pitched</th>}
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const summary = pitched?.[lead.id];
                // Fără linie în jurnal, dar marcat ca trimis: canalul e dedus din
                // `pitch_channel`, deci îl arătăm estompat, nu ca fapt confirmat.
                const inferredChannel = !summary && PITCHED_STATUSES.has(lead.status) ? lead.pitch_channel : null;
                const InferredIcon = inferredChannel ? CHANNEL_META[inferredChannel]?.icon ?? Send : Send;

                return (
                  <tr
                    key={lead.id}
                    onClick={() => onOpenDetails(lead)}
                    title="Deschide fișa lead-ului"
                    className="border-b border-[var(--card-border)] last:border-0 cursor-pointer"
                  >
                    <td className="px-4 py-3 max-w-[280px]">
                      <LeadName lead={lead} duplicate={duplicateIds?.has(lead.id)} showDomain />
                    </td>

                    <td className="px-4 py-3 hidden xl:table-cell">
                      {lead.website ? (
                        <a
                          href={websiteHref(lead.website)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={lead.website}
                          onClick={(e) => e.stopPropagation()}
                          className="block max-w-[180px] truncate text-amber-400 hover:underline"
                        >
                          {displayDomain(lead.website)}
                        </a>
                      ) : (
                        <span className="text-stone-600">—</span>
                      )}
                    </td>

                    {/* Rating (Google) și scor (PageSpeed) sunt metrici diferite:
                        fiecare lead o are de regulă doar pe una dintre ele. */}
                    <td className="px-4 py-3">
                      {showRating ? (
                        <div className="flex items-center gap-2">
                          {lead.rating !== null && (
                            <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap">
                              <span className="text-amber-400 font-semibold">★ {Number(lead.rating).toFixed(1)}</span>
                              {lead.reviews_count !== null && <span className="text-stone-600">({lead.reviews_count})</span>}
                            </span>
                          )}
                          {lead.score !== null && <ScoreBadge score={lead.score} title="Scor PageSpeed" />}
                          {lead.rating === null && lead.score === null && <span className="text-stone-600 text-xs">—</span>}
                        </div>
                      ) : (
                        <ScoreBadge score={lead.score} />
                      )}
                    </td>

                    {showSource && (
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <span className="text-xs text-stone-400 whitespace-nowrap">
                          {SOURCE_LABELS[lead.source] ?? lead.source ?? '—'}
                        </span>
                      </td>
                    )}

                    {showPitched && (
                      <td className="px-4 py-3 hidden xl:table-cell" onClick={(e) => e.stopPropagation()}>
                        {summary ? (
                          <button
                            onClick={() => props.onOpenMessages?.(lead)}
                            title={`Vezi mesajele trimise (${summary.count})`}
                            className="inline-flex items-center gap-1.5 flex-wrap hover:opacity-80 transition-opacity"
                          >
                            {summary.channels.map((channel) => {
                              const meta = CHANNEL_META[channel] ?? { label: channel, icon: Send };
                              const Icon = meta.icon;
                              return (
                                <span
                                  key={channel}
                                  className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs font-medium text-emerald-400 bg-emerald-500/10"
                                >
                                  <Icon size={11} />
                                  {meta.label}
                                </span>
                              );
                            })}
                            {summary.count > summary.channels.length && (
                              <span className="text-[10px] text-stone-600">×{summary.count}</span>
                            )}
                          </button>
                        ) : inferredChannel ? (
                          <span
                            title="Marcat ca trimis înainte de jurnalizare — canal dedus, mesajul nu a fost salvat"
                            className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs text-stone-500 bg-[var(--surface-2)]"
                          >
                            <InferredIcon size={11} />
                            {CHANNEL_META[inferredChannel]?.label ?? inferredChannel}
                            <span className="text-[10px] opacity-70">?</span>
                          </span>
                        ) : (
                          <span className="text-stone-600 text-xs">—</span>
                        )}
                      </td>
                    )}

                    <td className="px-4 py-3">
                      <StatusPill status={lead.status} />
                    </td>

                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <RowActions {...props} lead={lead} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function LeadName({ lead, duplicate, showDomain = false }: { lead: Lead; duplicate?: boolean; showDomain?: boolean }) {
  const meta = [lead.niche, lead.location].filter(Boolean).join(' · ');
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2 font-medium text-stone-200">
        <span className="truncate">{lead.company_name}</span>
        {duplicate && (
          <span
            title="Același domeniu sau telefon ca alt lead din listă"
            className="shrink-0 h-5 px-1.5 inline-flex items-center rounded text-[10px] font-medium text-yellow-400 bg-yellow-500/10"
          >
            Duplicat
          </span>
        )}
      </p>
      <p className="text-xs text-stone-500 truncate">
        {meta || '—'}
        {/* Sub 1280px coloana Website e ascunsă: domeniul apare aici */}
        {showDomain && lead.website && <span className="xl:hidden"> · {displayDomain(lead.website)}</span>}
      </p>
    </div>
  );
}

/** Acțiunea primară depinde de status; restul stau în meniul ⋯. */
function RowActions({
  lead,
  generatingId,
  onGeneratePitch,
  onOpenPitch,
  onOpenDetails,
  onWhatsAppOpened,
  onOpenMessages,
  onDelete,
  deletingId,
}: LeadsTableProps & { lead: Lead }) {
  const generating = generatingId === lead.id;
  const alreadySent = PITCHED_STATUSES.has(lead.status);

  let primary: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean };
  if (!lead.pitch_generated) {
    primary = {
      label: 'Generează pitch',
      icon: generating ? <Loader2 className="animate-spin" /> : <Sparkles />,
      onClick: () => onGeneratePitch(lead),
      disabled: generating,
    };
  } else if (alreadySent) {
    primary = { label: 'Follow-up', icon: <Send />, onClick: () => onOpenPitch(lead) };
  } else {
    primary = { label: 'Trimite', icon: <Send />, onClick: () => onOpenPitch(lead) };
  }

  async function openWhatsApp() {
    if (!lead.contact_phone) return;
    const message =
      lead.pitch_generated ??
      `Bună, sunt de la Utopia Systems și aș vrea să vă prezint o oportunitate pentru ${lead.company_name}.`;
    window.open(formatWhatsAppLink(lead.contact_phone, message), '_blank');
    await logWhatsAppSend(lead, message);
    onWhatsAppOpened?.();
  }

  return (
    <>
      <Button size="sm" variant="accent" disabled={primary.disabled} onClick={primary.onClick} className="h-8">
        {primary.icon}
        {primary.label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="outline" title="Mai multe acțiuni" aria-label="Mai multe acțiuni">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[190px] rounded-[12px] border-[var(--card-border)]">
          <DropdownMenuItem onSelect={() => onOpenDetails(lead)}>
            <Pencil /> Detalii și editare
          </DropdownMenuItem>
          {lead.pitch_generated && (
            <DropdownMenuItem onSelect={() => onOpenPitch(lead)}>
              <Eye /> Vezi pitch
            </DropdownMenuItem>
          )}
          {lead.contact_phone && (
            <DropdownMenuItem onSelect={openWhatsApp}>
              <MessageCircle /> WhatsApp
            </DropdownMenuItem>
          )}
          {onOpenMessages && (
            <DropdownMenuItem onSelect={() => onOpenMessages(lead)}>
              <Inbox /> Mesaje trimise
            </DropdownMenuItem>
          )}
          {(lead.contact_email || lead.contact_phone) && <DropdownMenuSeparator />}
          {lead.contact_email && (
            <DropdownMenuItem onSelect={() => copy(lead.contact_email as string, 'Emailul')}>
              <Copy /> Copiază emailul
            </DropdownMenuItem>
          )}
          {lead.contact_phone && (
            <DropdownMenuItem onSelect={() => copy(lead.contact_phone as string, 'Telefonul')}>
              <Copy /> Copiază telefonul
            </DropdownMenuItem>
          )}
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={deletingId === lead.id}
                onSelect={() => onDelete(lead)}
              >
                <Trash2 /> Șterge lead-ul
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
