'use client';

import { useId, useState } from 'react';
import { X } from 'lucide-react';

/**
 * Mai multe valori ca etichete: Enter, virgulă sau alegerea unei sugestii
 * adaugă; Backspace pe câmpul gol șterge ultima.
 */
export function MultiValueInput({
  label,
  values,
  onChange,
  suggestions,
  placeholder,
  disabled,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions: string[];
  placeholder: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const listId = useId();

  function add(raw: string) {
    const value = raw.trim().slice(0, 80);
    if (value && !values.some((v) => v.toLowerCase() === value.toLowerCase())) onChange([...values, value]);
    setDraft('');
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 rounded-lg border border-stone-800/60 bg-stone-950/60 px-2 py-1.5 focus-within:border-amber-500/40 ${disabled ? 'opacity-60' : ''}`}
    >
      <span className="px-1 text-[10px] text-stone-500 uppercase tracking-[0.15em] font-medium">{label}</span>
      {values.map((value) => (
        <span key={value} className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
          {value}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(values.filter((v) => v !== value))}
            className="text-amber-400/70 hover:text-amber-200"
            aria-label={`Scoate ${value}`}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        disabled={disabled}
        list={listId}
        aria-label={`${label} pentru discover`}
        placeholder={values.length === 0 ? placeholder : ''}
        maxLength={80}
        onChange={(e) => {
          const value = e.target.value;
          // O sugestie aleasă din listă (nu tastată) se adaugă direct; virgula separă valori scrise
          const native = e.nativeEvent;
          const picked = !(native instanceof InputEvent) || native.inputType === 'insertReplacementText';
          if (picked && suggestions.some((s) => s.toLowerCase() === value.trim().toLowerCase())) {
            add(value);
          } else if (value.includes(',')) {
            value.split(',').slice(0, -1).forEach(add);
            setDraft(value.split(',').pop() ?? '');
          } else {
            setDraft(value);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-xs text-stone-200 placeholder-stone-600 focus:outline-none"
      />
      <datalist id={listId}>
        {suggestions.filter((s) => !values.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

