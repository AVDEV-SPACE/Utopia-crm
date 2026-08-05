'use client';

interface CategoryFilterProps {
  categories: string[];
  selected: string;
  onSelect: (category: string) => void;
}

export function CategoryFilter({ categories, selected, onSelect }: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => onSelect('all')}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
          selected === 'all'
            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
            : 'bg-stone-900/60 text-stone-500 border border-stone-800/60 hover:border-stone-700 hover:text-stone-400'
        }`}
      >
        Toate
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
            selected === cat
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              : 'bg-stone-900/60 text-stone-500 border border-stone-800/60 hover:border-stone-700 hover:text-stone-400'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
