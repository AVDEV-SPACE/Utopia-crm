'use client';

import { Mail, Phone, Instagram, Check } from 'lucide-react';
import type { PipelineLeadRow } from '@/services/pipeline/types';
import { StageBadge } from './StageBadge';
import { ScoreBadge, StatusPill, displayDomain, websiteHref } from '@/components/leads/badges';
import { TableSkeleton } from '@/components/ui/skeleton';

/**
 * Tabelul de leaduri din /pipeline. Click pe rând deschide fișa lead-ului.
 * Coloanele secundare apar doar pe ecrane late (Nișă/Oraș trec sub nume),
 * deci tabelul nu are scroll orizontal pe tabletă; pe mobil devine listă de carduri.
 */
interface PipelineTableProps<T extends PipelineLeadRow> {
  leads: T[];
  loading: boolean;
  onOpen: (lead: T) => void;
  emptyMessage?: string;
  /** Coloana „Website”, după firmă */
  showWebsite?: boolean;
}

const dateFormatter = new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });

function Stage({ lead }: { lead: PipelineLeadRow }) {
  // Leadurile din afara pipeline-ului (Sheet, site, apeluri) n-au etapă: arătăm statusul CRM
  return lead.pipeline_stage ? <StageBadge stage={lead.pipeline_stage} /> : <StatusPill status={lead.status} />;
}

function ContactIcons({ lead }: { lead: PipelineLeadRow }) {
  return (
    <div className="flex items-center gap-2 text-stone-500">
      {lead.contact_email && <span title={lead.contact_email}><Mail size={14} className="text-stone-300" /></span>}
      {lead.contact_phone && <span title={lead.contact_phone}><Phone size={14} className="text-stone-300" /></span>}
      {lead.contact_instagram && <span title={lead.contact_instagram}><Instagram size={14} className="text-stone-300" /></span>}
      {!lead.contact_email && !lead.contact_phone && !lead.contact_instagram && '—'}
    </div>
  );
}

export function PipelineTable<T extends PipelineLeadRow>({ leads, loading, onOpen, emptyMessage, showWebsite = false }: PipelineTableProps<T>) {
  if (loading && leads.length === 0) {
    return (
      <TableSkeleton rows={8} cols={6} label="Se încarcă lead-urile" />
    );
  }

  if (leads.length === 0) {
    return (
      <div className="table-shell text-center py-16 text-stone-500 text-sm">
        {emptyMessage ?? 'Niciun lead din pipeline încă.'}
      </div>
    );
  }

  return (
    <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
      {/* Mobil */}
      <ul className="md:hidden space-y-2">
        {leads.map((lead) => (
          <li key={lead.id} onClick={() => onOpen(lead)} className="glass-card p-3.5 cursor-pointer">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-stone-200 truncate">{lead.company_name}</p>
                <p className="text-xs text-stone-500 truncate">
                  {[lead.niche, lead.location].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <ScoreBadge score={lead.score} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Stage lead={lead} />
              <ContactIcons lead={lead} />
            </div>
          </li>
        ))}
      </ul>

      {/* Tabletă / desktop */}
      <div className="table-shell hidden md:block">
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500 text-[11px] uppercase tracking-[0.08em] border-b border-[var(--card-border)]">
                <th className="px-4 py-3 font-medium">Firmă</th>
                {showWebsite && <th className="px-4 py-3 font-medium hidden xl:table-cell">Website</th>}
                <th className="px-4 py-3 font-medium hidden xl:table-cell">Nișă</th>
                <th className="px-4 py-3 font-medium hidden xl:table-cell">Oraș</th>
                <th className="px-4 py-3 font-medium">Scor</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">ICP</th>
                <th className="px-4 py-3 font-medium">Etapă</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Contact</th>
                <th className="px-4 py-3 font-medium hidden xl:table-cell">Dată</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => onOpen(lead)}
                  title="Deschide fișa lead-ului"
                  className="border-b border-[var(--card-border)] last:border-0 cursor-pointer"
                >
                  <td className="px-4 py-3 max-w-[300px]">
                    <p className="font-medium text-stone-200 truncate">{lead.company_name}</p>
                    {/* Sub 1280px Nișă/Oraș/Website nu au coloană: apar aici */}
                    <p className="text-xs text-stone-500 truncate xl:hidden">
                      {[lead.niche, lead.location, lead.website && displayDomain(lead.website)].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <p className="text-xs text-stone-500 truncate hidden xl:block" title={lead.source_ref ?? undefined}>
                      {lead.source_ref ?? '—'}
                    </p>
                  </td>
                  {showWebsite && (
                    <td className="px-4 py-3 hidden xl:table-cell">
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
                          {displayDomain(lead.website)}
                        </a>
                      ) : (
                        <span className="text-stone-600">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-stone-400 hidden xl:table-cell">{lead.niche ?? '—'}</td>
                  <td className="px-4 py-3 text-stone-400 hidden xl:table-cell">{lead.location ?? '—'}</td>
                  <td className="px-4 py-3">
                    <ScoreBadge score={lead.score} />
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {lead.icp_match ? (
                      <Check size={15} className="text-emerald-400" aria-label="ICP match" />
                    ) : (
                      <span className="text-stone-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Stage lead={lead} />
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <ContactIcons lead={lead} />
                  </td>
                  <td className="px-4 py-3 text-xs text-stone-500 whitespace-nowrap hidden xl:table-cell">
                    {dateFormatter.format(new Date(lead.created_at))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
