import { NextRequest, NextResponse } from 'next/server';
import { requirePipelineOwner } from '@/lib/pipeline-auth';
import { detectMapping, normalizeRow, parseSpreadsheet } from '@/services/leads/import';
import { finishRun, insertCandidates, startRun } from '@/services/engine/repository';
import { normalizeEmail, normalizeWebsite } from '@/services/engine/normalize';
import { engineOrgId } from '@/services/engine/run';
import type { EngineCandidate } from '@/services/engine/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_FILE_BYTES = 4 * 1024 * 1024; // sub limita de 4.5 MB a body-ului pe Vercel
const MAX_ROWS = 2000;

/**
 * Import CSV / XLSX (ex. export LinkedIn Sales Navigator) în coada motorului:
 * rândurile devin lead-uri `source='linkedin'`, etapa SOURCED, și trec prin
 * aceeași îmbogățire + scor ca lead-urile descoperite. Fără plafon zilnic —
 * importul e o acțiune deliberată.
 */
export async function POST(req: NextRequest) {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  let orgId: string;
  try {
    orgId = engineOrgId();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Lipsește fișierul (câmpul „file”)' }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'Fișier prea mare (max 4 MB)' }, { status: 400 });

  try {
    const sheet = await parseSpreadsheet({ buffer: Buffer.from(await file.arrayBuffer()), filename: file.name });
    const mapping = detectMapping(sheet.headers);
    // Coloane specifice exporturilor LinkedIn, pe care importul din sheet nu le mapează
    const column = (pattern: RegExp) => sheet.headers.findIndex((h) => pattern.test(h));
    const linkedinCol = column(/linkedin/i);
    const instagramCol = column(/instagram/i);
    const facebookCol = column(/facebook/i);

    const candidates: EngineCandidate[] = [];
    let skipped = 0;
    for (const row of sheet.rows.slice(0, MAX_ROWS)) {
      const lead = normalizeRow(row, mapping);
      if (!lead) {
        skipped++;
        continue;
      }
      const cell = (index: number) => (index >= 0 ? row[index]?.trim() || null : null);
      candidates.push({
        name: lead.company_name,
        website: normalizeWebsite(lead.website),
        email: normalizeEmail(lead.contact_email),
        phone: lead.contact_phone,
        address: lead.address,
        niche: lead.niche ?? lead.category,
        city: lead.location,
        discovery: {
          source: 'csv',
          externalId: null,
          hasActiveMetaAds: false,
          metaPageId: null,
          facebook: cell(facebookCol),
          instagram: cell(instagramCol),
          linkedin: cell(linkedinCol),
        },
      });
    }

    const runId = await startRun('import', 'manual', { file: file.name.slice(0, 200) });
    const result = await insertCandidates(candidates, { orgId, source: 'linkedin', limit: MAX_ROWS });
    await finishRun(runId, { found: candidates.length, inserted: result.inserted });

    return NextResponse.json({
      runId,
      rows: sheet.rows.length,
      inserted: result.inserted,
      duplicates: result.duplicates,
      skipped: skipped + Math.max(sheet.rows.length - MAX_ROWS, 0),
    });
  } catch (error) {
    console.error('Motor: importul CSV a eșuat:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
