'use client';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

/** Switch accesibil, fără dependențe noi (nu avem @radix-ui/react-switch). */
export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-stone-200">{label}</p>
        {description && <p className="mt-1 text-xs leading-relaxed text-stone-500">{description}</p>}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'bg-amber-500' : 'bg-stone-700'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
