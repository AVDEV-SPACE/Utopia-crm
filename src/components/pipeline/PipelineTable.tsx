'use client';

import { Loader2, Mail, Phone, Instagram, Check } from 'lucide-react';
import { LEAD_STATUS_LABELS } from '@/services/leads/types';
import type { PipelineLeadRow } from '@/services/pipeline/types';
import { StageBadge } from './StageBadge';

/**
 * Tabelul de leaduri din /pipeline, folosit și de /leads (cu `showWebsite`).
 * Click pe rând deschide fișa lead-ului.
 */
interface PipelineTableProps<T extends PipelineLeadRow> {
  leads: T[];
  loading: boolean;
  onOpen: (lead: T) => void;
  emptyMessage?: string;
  /** Coloana „Website”, după firmă */
  showWebsite?: boolean;
}

function scoreColorClass(score: number | null): string {
  if (score === null) return 'text-stone-500 bg-stone-800/50';
  if (score < 40) return 'text-red-400 bg-red-500/10 border border-red-500/20';
  if (score < 70) return 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20';
  return 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20';
}

const dateFormatter = new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });

/** Linkurile importate pot veni fără schemă. */
const websiteHref = (value: string) => (/^https?:\/\//i.test(value) ? value : `https://${value}`);

export function PipelineTable<T extends PipelineLeadRow>({ leads, loading, onOpen, emptyMessage, showWebsite = false }: PipelineTableProps<T>) {
  if (loading && leads.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-stone-500">
        <Loader2 className="animate-spin mr-2" size={16} />
        <span className="text-sm">Se încarcă lead-urile...</span>
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="text-center py-16 text-stone-500 text-sm">
        {emptyMessage ?? 'Niciun lead din pipeline încă.'}
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto rounded-xl border border-stone-800/60 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-800/60 text-left text-stone-500 text-xs uppercase tracking-wide">
            <th className="px-4 py-3 font-medium">Firmă</th>
            {showWebsite && <th className="px-4 py-3 font-medium">Website</th>}
            <th className="px-4 py-3 font-medium">Nișă</th>
            <th className="px-4 py-3 font-medium">Oraș</th>
            <th className="px-4 py-3 font-medium">Scor</th>
            <th className="px-4 py-3 font-medium">ICP</th>
            <th className="px-4 py-3 font-medium">Etapă</th>
            <th className="px-4 py-3 font-medium">Contact</th>
            <th className="px-4 py-3 font-medium">Dată</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr
              key={lead.id}
              onClick={() => onOpen(lead)}
              className="border-b border-stone-800/40 last:border-0 hover:bg-stone-800/20 cursor-pointer"
            >
              <td className="px-4 py-3">
                <p className="font-medium text-stone-200">{lead.company_name}</p>
                <p className="text-xs text-stone-500 max-w-[220px] truncate" title={lead.source_ref ?? undefined}>
                  {lead.source_ref ?? '—'}
                </p>
              </td>
              {showWebsite && (
                <td className="px-4 py-3">
                  {lead.website ? (
                    // Linkul se deschide fără să deschidă și fișa rândului
                    <a
                      href={websiteHref(lead.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={lead.website}
                      onClick={(e) => e.stopPropagation()}
                      className="block max-w-[180px] truncate text-amber-400 hover:underline"
                    >
                      {lead.website.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')}
                    </a>
                  ) : (
                    <span className="text-stone-600">—</span>
                  )}
                </td>
              )}
              <td className="px-4 py-3 text-stone-400">{lead.niche ?? '—'}</td>
              <td className="px-4 py-3 text-stone-400">{lead.location ?? '—'}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center justify-center min-w-9 px-2 py-1 rounded-lg text-xs font-semibold ${scoreColorClass(lead.score)}`}
                >
                  {lead.score ?? '—'}
                </span>
              </td>
              <td className="px-4 py-3">
                {lead.icp_match ? (
                  <Check size={15} className="text-emerald-400" aria-label="ICP match" />
                ) : (
                  <span className="text-stone-600">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                {/* Leadurile din afara pipeline-ului (Sheet, site, apeluri) n-au etapă: arătăm statusul CRM */}
                {lead.pipeline_stage ? (
                  <StageBadge stage={lead.pipeline_stage} />
                ) : (
                  <span className="text-xs text-stone-400">{LEAD_STATUS_LABELS[lead.status] ?? lead.status}</span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2 text-stone-500">
                  {lead.contact_email && <span title={lead.contact_email}><Mail size={14} className="text-stone-300" /></span>}
                  {lead.contact_phone && <span title={lead.contact_phone}><Phone size={14} className="text-stone-300" /></span>}
                  {lead.contact_instagram && <span title={lead.contact_instagram}><Instagram size={14} className="text-stone-300" /></span>}
                  {!lead.contact_email && !lead.contact_phone && !lead.contact_instagram && '—'}
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-stone-500 whitespace-nowrap">
                {dateFormatter.format(new Date(lead.created_at))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
