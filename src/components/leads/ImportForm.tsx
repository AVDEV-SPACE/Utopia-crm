'use client';

import { useRef, useState } from 'react';
import { Loader2, FileSpreadsheet, Link2, Upload, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  IMPORTABLE_FIELDS,
  IMPORTABLE_FIELD_LABELS,
  ImportableField,
  ImportMapping,
  ImportPreview,
  ImportResult,
} from '@/services/leads/types';

interface ImportFormProps {
  /** Apelat după un import reușit, ca lista să se reîncarce. */
  onImported: (result: ImportResult) => void;
}

type Tab = 'url' | 'file';

export function ImportForm({ onImported }: ImportFormProps) {
  const [tab, setTab] = useState<Tab>('url');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const hasSource = tab === 'url' ? url.trim() !== '' : file !== null;

  /** Trimite fie JSON (link), fie multipart (fișier) — sursa e aceeași în ambele pași. */
  async function post(mode: 'preview' | 'commit', currentMapping?: ImportMapping) {
    if (tab === 'file' && file) {
      const form = new FormData();
      form.append('file', file);
      form.append('mode', mode);
      if (currentMapping) form.append('mapping', JSON.stringify(currentMapping));
      return fetch('/api/leads/import', { method: 'POST', body: form });
    }

    return fetch('/api/leads/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, url: url.trim(), mapping: currentMapping }),
    });
  }

  async function handlePreview() {
    if (!hasSource || busy) return;
    setBusy(true);
    try {
      const res = await post('preview');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Eroare la citirea fișierului');

      const result = data as ImportPreview;
      setPreview(result);
      setMapping(result.mapping);

      const detected = Object.values(result.mapping).filter(Boolean).length;
      toast.success(`${result.totalRows} rânduri citite, ${detected} coloane recunoscute.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la citirea fișierului');
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (busy) return;
    if (!Object.values(mapping).includes('company_name')) {
      toast.error('Mapează o coloană pe „Nume firmă” înainte de import.');
      return;
    }

    setBusy(true);
    try {
      const res = await post('commit', mapping);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Eroare la import');

      const result = data as ImportResult;
      const parts = [`${result.inserted} adăugate`, `${result.updated} actualizate`];
      if (result.skipped > 0) parts.push(`${result.skipped} sărite`);
      toast.success(`Import finalizat: ${parts.join(', ')}.`);

      reset();
      onImported(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la import');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPreview(null);
    setMapping({});
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  /** Un câmp poate fi mapat pe o singură coloană — îl eliberăm din cea veche. */
  function assign(columnIndex: number, field: ImportableField | null) {
    setMapping((prev) => {
      const next: ImportMapping = { ...prev };
      if (field) {
        for (const key of Object.keys(next)) {
          if (next[Number(key)] === field) next[Number(key)] = null;
        }
      }
      next[columnIndex] = field;
      return next;
    });
  }

  const selectClass =
    'w-full h-8 rounded-md border border-stone-800 bg-stone-950/60 px-2 text-xs text-stone-200';

  return (
    <div className="bg-stone-900/60 border border-stone-800/60 rounded-xl p-4 space-y-4">
      {/* Selectorul de sursă */}
      <div className="flex items-center gap-1.5">
        {(['url', 'file'] as Tab[]).map((value) => (
          <button
            key={value}
            onClick={() => { setTab(value); reset(); }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
              tab === value
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-stone-900/60 text-stone-500 border border-stone-800/60 hover:border-stone-700 hover:text-stone-400'
            }`}
          >
            {value === 'url' ? <Link2 size={12} /> : <Upload size={12} />}
            {value === 'url' ? 'Link Google Sheets' : 'Fișier .csv / .xlsx'}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-end gap-3">
        <div className="flex-1 w-full">
          {tab === 'url' ? (
            <>
              <Label className="text-xs text-stone-500 mb-1.5 block">
                Link către spreadsheet
                <span className="text-stone-600"> — sheet-ul trebuie partajat „Anyone with the link”</span>
              </Label>
              <Input
                value={url}
                onChange={(e) => { setUrl(e.target.value); setPreview(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handlePreview(); } }}
                placeholder="https://docs.google.com/spreadsheets/d/..."
              />
            </>
          ) : (
            <>
              <Label className="text-xs text-stone-500 mb-1.5 block">Fișier de pe disc</Label>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.xlsx,.xls,.tsv"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }}
                className="w-full text-xs text-stone-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-stone-800 file:text-stone-300 file:text-xs hover:file:bg-stone-700"
              />
            </>
          )}
        </div>

        <Button disabled={!hasSource || busy} onClick={handlePreview}>
          {busy && !preview ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
          Citește coloanele
        </Button>
      </div>

      {/* Maparea coloanelor + eșantion */}
      {preview && (
        <div className="border-t border-stone-800/60 pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-stone-300">
              {preview.totalRows} rânduri gata de import
              <span className="text-stone-600"> — verifică maparea coloanelor</span>
            </p>
            <button onClick={reset} title="Anulează" className="text-stone-600 hover:text-stone-300">
              <X size={15} />
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-stone-800/60">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-800/60 text-left text-stone-500 uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Coloană în fișier</th>
                  <th className="px-3 py-2 font-medium">Se importă în</th>
                  <th className="px-3 py-2 font-medium">Exemple</th>
                </tr>
              </thead>
              <tbody>
                {preview.headers.map((header, index) => (
                  <tr key={index} className="border-b border-stone-800/40 last:border-0">
                    <td className="px-3 py-2 font-medium text-stone-300 whitespace-nowrap">
                      {header || <span className="text-stone-600">(fără antet)</span>}
                    </td>
                    <td className="px-3 py-2 w-48">
                      <select
                        value={mapping[index] ?? ''}
                        onChange={(e) =>
                          assign(index, (e.target.value || null) as ImportableField | null)
                        }
                        className={selectClass}
                      >
                        <option value="">— ignoră —</option>
                        {IMPORTABLE_FIELDS.map((field) => (
                          <option key={field} value={field}>
                            {IMPORTABLE_FIELD_LABELS[field]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-stone-500 max-w-xs truncate">
                      {preview.sampleRows
                        .map((row) => row[index])
                        .filter((v) => v && v.trim())
                        .slice(0, 2)
                        .join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-stone-600">
              Firmele deja existente (același nume și oraș) se actualizează. Statusul,
              pitch-ul și notițele lor rămân neatinse.
            </p>
            <Button disabled={busy} onClick={handleCommit}>
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              Importă {preview.totalRows} lead-uri
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
