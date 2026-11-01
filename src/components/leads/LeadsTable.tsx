'use client';

import {
  Loader2, Sparkles, Eye, MessageCircle, Pencil, Mail, Smartphone, Instagram, Send, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatWhatsAppLink } from '@/lib/utils';
import { logWhatsAppSend } from '@/lib/sent-messages-client';
import { LEAD_STATUS_LABELS as STATUS_LABELS, Lead } from '@/services/leads/types';
import type { PitchSummary } from '@/services/messages/repository';

interface LeadsTableProps {
  leads: Lead[];
  loading: boolean;
  generatingId: string | null;
  onGeneratePitch: (lead: Lead) => void;
  onOpenPitch: (lead: Lead) => void;
  /** Deschide fișa lead-ului pe tab-ul de detalii/editare. */
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
}

function scoreColorClass(score: number | null): string {
  if (score === null) return 'text-stone-500 bg-stone-800/50';
  if (score < 40) return 'text-red-400 bg-red-500/10 border border-red-500/20';
  if (score < 70) return 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20';
  return 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20';
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
};

const CHANNEL_META: Record<string, { label: string; icon: typeof Mail }> = {
  email: { label: 'Email', icon: Mail },
  sms: { label: 'SMS', icon: Smartphone },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  instagram: { label: 'Instagram', icon: Instagram },
};

export function LeadsTable({
  leads,
  loading,
  generatingId,
  onGeneratePitch,
  onOpenPitch,
  onOpenDetails,
  onWhatsAppOpened,
  emptyMessage,
  showRating = false,
  showSource = false,
  pitched,
  onOpenMessages,
  onDelete,
  deletingId,
}: LeadsTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-stone-500">
        <Loader2 className="animate-spin mr-2" size={18} /> Se încarcă lead-urile...
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="text-center py-16 text-stone-500 text-sm">
        {emptyMessage ?? 'Niciun lead încă. Scanează o nișă și o locație pentru a începe.'}
      </div>
    );
  }

  const showPitched = Boolean(pitched);

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-800/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-800/60 text-left text-stone-500 text-xs uppercase tracking-wide">
            <th className="px-4 py-3 font-medium">Nume</th>
            <th className="px-4 py-3 font-medium">Website</th>
            <th className="px-4 py-3 font-medium">{showRating ? 'Rating / Scor' : 'Scor'}</th>
            {showSource && <th className="px-4 py-3 font-medium">Sursă</th>}
            {showPitched && <th className="px-4 py-3 font-medium">Pitched</th>}
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium text-right">Acțiuni</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const summary = pitched?.[lead.id];
            // Fără linie în jurnal, dar marcat ca trimis: canalul e dedus din
            // `pitch_channel`, deci îl arătăm estompat, nu ca fapt confirmat.
            const inferredChannel =
              !summary && PITCHED_STATUSES.has(lead.status) ? lead.pitch_channel : null;
            const InferredIcon = inferredChannel
              ? CHANNEL_META[inferredChannel]?.icon ?? Send
              : Send;

            return (
              <tr key={lead.id} className="border-b border-stone-800/40 last:border-0 hover:bg-stone-800/20">
                <td className="px-4 py-3">
                  <button
                    onClick={() => onOpenDetails(lead)}
                    className="text-left hover:underline"
                    title="Deschide fișa lead-ului"
                  >
                    <p className="font-medium text-stone-200">{lead.company_name}</p>
                    <p className="text-xs text-stone-500">
                      {[lead.niche, lead.location].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </button>
                </td>

                <td className="px-4 py-3">
                  {lead.website ? (
                    // Un singur rând trunchiat: URL-urile lungi (query-uri de tracking)
                    // nu mai întind rândul; adresa completă rămâne în tooltip.
                    <a
                      href={lead.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={lead.website}
                      className="block max-w-[180px] truncate text-amber-400 hover:underline"
                    >
                      {lead.website.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')}
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
                          <span className="text-amber-400 font-semibold">
                            ★ {Number(lead.rating).toFixed(1)}
                          </span>
                          {lead.reviews_count !== null && (
                            <span className="text-stone-600">({lead.reviews_count})</span>
                          )}
                        </span>
                      )}
                      {lead.score !== null && (
                        <span
                          title="Scor PageSpeed"
                          className={`inline-flex items-center justify-center min-w-9 px-2 py-1 rounded-lg text-xs font-semibold ${scoreColorClass(lead.score)}`}
                        >
                          {lead.score}
                        </span>
                      )}
                      {lead.rating === null && lead.score === null && (
                        <span className="text-stone-600 text-xs">—</span>
                      )}
                    </div>
                  ) : (
                    <span
                      className={`inline-flex items-center justify-center min-w-9 px-2 py-1 rounded-lg text-xs font-semibold ${scoreColorClass(lead.score)}`}
                    >
                      {lead.score ?? '—'}
                    </span>
                  )}
                </td>

                {showSource && (
                  <td className="px-4 py-3">
                    <span className="text-xs text-stone-400 whitespace-nowrap">
                      {SOURCE_LABELS[lead.source] ?? lead.source ?? '—'}
                    </span>
                  </td>
                )}

                {showPitched && (
                  <td className="px-4 py-3">
                    {summary ? (
                      <button
                        onClick={() => onOpenMessages?.(lead)}
                        title={`Vezi mesajele trimise (${summary.count})`}
                        className="inline-flex items-center gap-1.5 flex-wrap hover:opacity-80 transition-opacity"
                      >
                        {summary.channels.map((channel) => {
                          const meta = CHANNEL_META[channel] ?? { label: channel, icon: Send };
                          const Icon = meta.icon;
                          return (
                            <span
                              key={channel}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
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
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-stone-500 bg-stone-800/40 border border-stone-700/40"
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
                  <span className="text-xs text-stone-400">
                    {STATUS_LABELS[lead.status] ?? lead.status}
                  </span>
                </td>

                <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                  <Button size="sm" variant="outline" onClick={() => onOpenDetails(lead)}>
                    <Pencil />
                    Detalii
                  </Button>

                  {lead.contact_phone && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const message =
                          lead.pitch_generated ??
                          `Bună, sunt de la Utopia Systems și aș vrea să vă prezint o oportunitate pentru ${lead.company_name}.`;
                        window.open(formatWhatsAppLink(lead.contact_phone as string, message), '_blank');
                        await logWhatsAppSend(lead, message);
                        onWhatsAppOpened?.();
                      }}
                    >
                      <MessageCircle />
                      WhatsApp
                    </Button>
                  )}

                  {lead.pitch_generated ? (
                    <Button size="sm" variant="outline" onClick={() => onOpenPitch(lead)}>
                      <Eye />
                      Vezi pitch
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={generatingId === lead.id}
                      onClick={() => onGeneratePitch(lead)}
                    >
                      {generatingId === lead.id ? <Loader2 className="animate-spin" /> : <Sparkles />}
                      Generează pitch
                    </Button>
                  )}

                  {onDelete && (
                    <Button
                      size="sm"
                      variant="outline"
                      title="Șterge lead-ul"
                      disabled={deletingId === lead.id}
                      onClick={() => onDelete(lead)}
                      className="text-red-400 hover:text-red-300 hover:border-red-500/40"
                    >
                      {deletingId === lead.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
