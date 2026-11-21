'use client';

// Controalele comune ale barelor de filtre (Lead Generation, Pipeline): căutare,
// dropdown compact per filtru, chip-uri pentru filtrele active și „Resetează”.
// Înlocuiesc rândurile lungi de chip-uri: fiecare filtru ocupă un singur control.
import { Check, ChevronDown, Search, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export const ALL = 'all';

export function SearchField({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`ui-control relative flex items-center min-w-0 ${className}`}>
      <Search className="absolute left-2.5 text-stone-500 pointer-events-none" size={14} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-full bg-transparent pl-8 pr-7 text-[13px] text-stone-200 placeholder-stone-600 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          title="Golește căutarea"
          className="absolute right-2 text-stone-500 hover:text-stone-200"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

/**
 * Un filtru = un buton „Etichetă: valoare ▾” cu lista de opțiuni.
 * `ALL` înseamnă nefiltrat; atunci butonul e neutru, altfel e accentuat.
 */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
  allLabel = 'Toate',
  hideAll = false,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  allLabel?: string;
  /** Pentru sortare: nu există „toate”, doar opțiunile. */
  hideAll?: boolean;
}) {
  const active = !hideAll && value !== ALL;
  const current = options.find((o) => o.value === value)?.label ?? (value === ALL ? allLabel : value);
  const list = hideAll ? options : [{ value: ALL, label: allLabel }, ...options];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-active={active}
          className="ui-control inline-flex items-center gap-1.5 px-2.5 text-[12px] font-medium whitespace-nowrap max-w-[220px]"
        >
          <span className="text-stone-500">{label}</span>
          <span className={`truncate ${active ? 'text-amber-400' : 'text-stone-200'}`}>{current}</span>
          <ChevronDown size={12} className="text-stone-500 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px] max-h-80 rounded-[12px] border-[var(--card-border)]">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.12em] text-stone-500 font-medium">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {list.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
            className="text-[13px] justify-between gap-3"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Check size={13} className={option.value === value ? 'text-amber-400' : 'opacity-0'} />
              <span className="truncate">{option.label}</span>
            </span>
            {option.count !== undefined && <span className="text-[11px] text-stone-500 tabular-nums">{option.count}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface ActiveChip {
  key: string;
  label: string;
  onRemove: () => void;
}

/** Filtrele active, fiecare cu ×, plus „Resetează” (doar când există cel puțin unul). */
export function ActiveFilterChips({ chips, onReset }: { chips: ActiveChip[]; onReset: () => void }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 h-6 pl-2.5 pr-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            title="Elimină filtrul"
            className="w-4 h-4 inline-flex items-center justify-center rounded-full hover:bg-amber-500/20"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <button type="button" onClick={onReset} className="text-[11px] text-stone-500 hover:text-stone-200 px-1.5">
        Resetează
      </button>
    </div>
  );
}
