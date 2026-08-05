'use client';

import { Loader2, Sparkles, Eye, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatWhatsAppLink } from '@/lib/utils';
import { Lead } from '@/services/leads/types';

interface LeadsTableProps {
  leads: Lead[];
  loading: boolean;
  generatingId: string | null;
  onGeneratePitch: (lead: Lead) => void;
  onOpenPitch: (lead: Lead) => void;
  emptyMessage?: string;
}

function scoreColorClass(score: number | null): string {
  if (score === null) return 'text-stone-500 bg-stone-800/50';
  if (score < 40) return 'text-red-400 bg-red-500/10 border border-red-500/20';
  if (score < 70) return 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20';
  return 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20';
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Nou',
  scored: 'Scorat',
  pitch_ready: 'Pitch gata',
  sent: 'Trimis',
  replied: 'A răspuns',
  negotiating: 'Negociere',
  won: 'Câștigat',
  lost: 'Pierdut',
};

export function LeadsTable({
  leads,
  loading,
  generatingId,
  onGeneratePitch,
  onOpenPitch,
  emptyMessage,
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

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-800/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-800/60 text-left text-stone-500 text-xs uppercase tracking-wide">
            <th className="px-4 py-3 font-medium">Nume</th>
            <th className="px-4 py-3 font-medium">Website</th>
            <th className="px-4 py-3 font-medium">Scor</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium text-right">Acțiuni</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className="border-b border-stone-800/40 last:border-0 hover:bg-stone-800/20">
              <td className="px-4 py-3">
                <p className="font-medium text-stone-200">{lead.company_name}</p>
                <p className="text-xs text-stone-500">
                  {lead.niche} · {lead.location}
                </p>
              </td>

              <td className="px-4 py-3">
                {lead.website ? (
                  <a
                    href={lead.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:underline break-all"
                  >
                    {lead.website.replace(/^https?:\/\//, '')}
                  </a>
                ) : (
                  <span className="text-stone-600">—</span>
                )}
              </td>

              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center justify-center min-w-9 px-2 py-1 rounded-lg text-xs font-semibold ${scoreColorClass(
                    lead.score
                  )}`}
                >
                  {lead.score ?? '—'}
                </span>
              </td>

              <td className="px-4 py-3">
                <span className="text-xs text-stone-400">
                  {STATUS_LABELS[lead.status] ?? lead.status}
                </span>
              </td>

              <td className="px-4 py-3 text-right space-x-2">
                {lead.contact_phone && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      window.open(
                        formatWhatsAppLink(
                          lead.contact_phone as string,
                          lead.pitch_generated ??
                            `Bună, sunt de la Utopia Systems și aș vrea să vă prezint o oportunitate pentru ${lead.company_name}.`
                        ),
                        '_blank'
                      )
                    }
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}