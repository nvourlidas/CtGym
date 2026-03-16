import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import type { GymClass } from '../types';

type Props = { classes: GymClass[]; value: string; onChange: (v: string) => void };

export default function ClassDropdown({ classes, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);

  const filtered = classes.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));
  const selected = classes.find((c) => c.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-9 flex items-center justify-between gap-2 pl-3.5 pr-3 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary hover:border-primary/30 transition-all cursor-pointer"
      >
        <span className={selected ? '' : 'text-text-secondary'}>{selected ? selected.title : 'Επιλέξτε τμήμα…'}</span>
        <ChevronDown className={['h-3.5 w-3.5 text-text-secondary transition-transform', open ? 'rotate-180' : ''].join(' ')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-border/15 bg-secondary-background shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border/10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary pointer-events-none" />
              <input
                autoFocus
                className="w-full h-8 pl-7 pr-3 rounded-lg border border-border/15 bg-secondary/10 text-sm text-text-primary outline-none focus:border-primary/40 transition-all"
                placeholder="Αναζήτηση τμήματος…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && <div className="px-3 py-3 text-xs text-text-secondary">Δεν βρέθηκαν τμήματα</div>}
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onChange(c.id); setOpen(false); setSearch(''); }}
                className={['w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left hover:bg-secondary/20 transition-colors', c.id === value ? 'bg-primary/8 text-primary' : 'text-text-primary'].join(' ')}
              >
                {c.id === value && <Check className="h-3 w-3 shrink-0" />}
                {c.class_categories?.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.class_categories.color }} />}
                {c.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
