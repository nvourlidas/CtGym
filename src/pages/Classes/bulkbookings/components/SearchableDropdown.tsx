import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

export default function SearchableDropdown({ options, value, onChange, placeholder, disabled }: {
  options: { id: string; label: string; sublabel?: string }[];
  value: string; onChange: (v: string) => void;
  placeholder: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);

  const filtered = options.filter((o) => !search || o.label.toLowerCase().includes(search.toLowerCase()) || (o.sublabel ?? '').toLowerCase().includes(search.toLowerCase()));
  const selected = options.find((o) => o.id === value);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => !disabled && setOpen((v) => !v)} disabled={disabled}
        className="w-full h-9 flex items-center justify-between gap-2 pl-3.5 pr-3 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary hover:border-primary/30 disabled:opacity-50 transition-all cursor-pointer"
      >
        <span className={selected ? 'text-text-primary truncate' : 'text-text-secondary truncate'}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={['h-3.5 w-3.5 text-text-secondary transition-transform shrink-0', open ? 'rotate-180' : ''].join(' ')} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-border/15 bg-secondary-background shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border/10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary pointer-events-none" />
              <input autoFocus className="w-full h-8 pl-7 pr-3 rounded-lg border border-border/15 bg-secondary/10 text-sm text-text-primary outline-none focus:border-primary/40 transition-all" placeholder="Αναζήτηση…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && <div className="px-3 py-3 text-xs text-text-secondary">Δεν βρέθηκαν αποτελέσματα</div>}
            {filtered.map((o) => (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false); setSearch(''); }}
                className={['w-full flex items-start gap-2 px-3.5 py-2.5 text-sm text-left hover:bg-secondary/20 transition-colors', o.id === value ? 'bg-primary/8' : ''].join(' ')}
              >
                {o.id === value && <Check className="h-3 w-3 text-primary mt-0.5 shrink-0" />}
                <div className={o.id === value ? '' : 'pl-5'}>
                  <div className={o.id === value ? 'text-primary font-semibold' : 'text-text-primary'}>{o.label}</div>
                  {o.sublabel && <div className="text-[11px] text-text-secondary">{o.sublabel}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
