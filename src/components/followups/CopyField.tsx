'use client';

import { useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface CopyFieldProps {
  label: string;
  value: string;
  hint?: string;
  /** Ascunde valoarea până la click pe ochi (pentru API key) */
  secret?: boolean;
}

export function CopyField({ label, value, hint, secret = false }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(!secret);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard e blocat pe origini non-HTTPS sau fără permisiune
      toast.error('Nu am putut copia — selectează manual textul.');
    }
  };

  const shown = revealed ? value : '•'.repeat(Math.min(value.length, 40));

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-stone-500">{label}</p>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-stone-800 bg-stone-950/60 px-3 py-2 font-mono text-xs text-stone-300">
          {shown}
        </code>

        {secret && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Ascunde' : 'Arată'}
            className="flex items-center justify-center rounded-lg border border-stone-800 bg-stone-900 px-3 text-stone-400 transition-colors hover:border-stone-700 hover:text-stone-200"
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}

        <button
          type="button"
          onClick={copy}
          aria-label={`Copiază ${label}`}
          className="flex items-center justify-center rounded-lg border border-stone-800 bg-stone-900 px-3 text-stone-400 transition-colors hover:border-stone-700 hover:text-stone-200"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-stone-600">{hint}</p>}
    </div>
  );
}
