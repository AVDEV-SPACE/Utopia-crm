/**
 * Import de lead-uri din spreadsheet — folosit de /leads.
 *
 * Două moduri, ambele pe POST:
 *   mode=preview → parsează sursa, întoarce antetul, maparea detectată și primele
 *                  rânduri, ca utilizatorul să confirme/ajusteze maparea
 *   mode=commit  → aplică maparea confirmată și scrie în DB
 *
 * Sursa poate fi un link de Google Sheets public (JSON) sau un fișier .csv/.xlsx
 * (multipart/form-data). Sheet-urile publice se citesc prin export CSV, deci
 * importul nu are nevoie de niciun fel de credențiale Google.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import {
  detectMapping,
  fetchSheetCsv,
  importRows,
  parseSpreadsheet,
  validateMapping,
  type ParsedSpreadsheet,
} from '@/services/leads/import';
import { IMPORTABLE_FIELDS, ImportMapping } from '@/services/leads/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/** Vercel respinge request-urile serverless peste ~4.5 MB. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

const mappingSchema = z.record(
  z.string().regex(/^\d+$/),
  z.enum(IMPORTABLE_FIELDS).nullable()
);

const bodySchema = z.object({
  mode: z.enum(['preview', 'commit']),
  url: z.string().trim().url().optional(),
  mapping: mappingSchema.optional(),
});

/** Cheile din JSON sunt string-uri; maparea e indexată pe număr. */
function toMapping(raw: Record<string, string | null>): ImportMapping {
  const mapping: ImportMapping = {};
  for (const [key, value] of Object.entries(raw)) {
    mapping[Number(key)] = value as ImportMapping[number];
  }
  return mapping;
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

    const contentType = req.headers.get('content-type') ?? '';
    let parsed: ParsedSpreadsheet;
    let mode: 'preview' | 'commit';
    let rawMapping: Record<string, string | null> | undefined;

    if (contentType.includes('multipart/form-data')) {
      // ── Fișier urcat de pe disc ──────────────────────────────────────────
      const form = await req.formData();
      const file = form.get('file');
      mode = form.get('mode') === 'commit' ? 'commit' : 'preview';

      const mappingRaw = form.get('mapping');
      if (typeof mappingRaw === 'string') {
        rawMapping = JSON.parse(mappingRaw) as Record<string, string | null>;
      }

      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Lipsește fișierul.' }, { status: 400 });
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: `Fișierul depășește ${MAX_FILE_BYTES / 1024 / 1024} MB. Împarte-l sau exportă doar coloanele necesare.` },
          { status: 413 }
        );
      }
      if (!/\.(csv|xlsx?|tsv|txt)$/i.test(file.name)) {
        return NextResponse.json(
          { error: 'Format nesuportat. Acceptăm .csv și .xlsx.' },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      parsed = await parseSpreadsheet({ buffer, filename: file.name });
    } else {
      // ── Link Google Sheets ───────────────────────────────────────────────
      const json = bodySchema.safeParse(await req.json().catch(() => null));
      if (!json.success) {
        return NextResponse.json(
          { error: json.error.issues[0]?.message ?? 'Date invalide' },
          { status: 400 }
        );
      }
      if (!json.data.url) {
        return NextResponse.json({ error: 'Lipsește linkul către spreadsheet.' }, { status: 400 });
      }

      mode = json.data.mode;
      rawMapping = json.data.mapping as Record<string, string | null> | undefined;
      parsed = await parseSpreadsheet({ text: await fetchSheetCsv(json.data.url) });
    }

    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { error: 'Fișierul conține doar antetul, fără rânduri de date.' },
        { status: 400 }
      );
    }

    if (mode === 'preview') {
      return NextResponse.json({
        headers: parsed.headers,
        mapping: detectMapping(parsed.headers),
        sampleRows: parsed.rows.slice(0, 5),
        totalRows: parsed.rows.length,
      });
    }

    // ── commit ────────────────────────────────────────────────────────────
    if (!rawMapping) {
      return NextResponse.json({ error: 'Lipsește maparea coloanelor.' }, { status: 400 });
    }

    const mapping = toMapping(rawMapping);
    const mappingError = validateMapping(mapping);
    if (mappingError) return NextResponse.json({ error: mappingError }, { status: 400 });

    const result = await importRows(parsed.rows, mapping, randomUUID());
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error importing leads:', error);
    // Erorile din parsare/descărcare sunt scrise pentru utilizator (ex. „sheet-ul
    // nu e public”), deci le trimitem ca atare în loc de un 500 opac.
    const message = error instanceof Error ? error.message : 'Eroare la import';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
