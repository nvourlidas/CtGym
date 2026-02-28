import { useEffect, useMemo, useState } from 'react';
import { Search, X, CalendarDays, Layers, Check, Clock, Users, SlidersHorizontal } from 'lucide-react';

export type SessionRow = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  classes?: {
    id: string;
    title: string;
    class_categories?: { name: string; color: string | null } | null;
  } | null;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SelectField({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        className="w-full h-9 pl-3 pr-8 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary appearance-none outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary">
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
      </div>
    </div>
  );
}

export default function SessionPickerModal({
  title, sessions, selectedSessionId,
  initialSearch, initialDate,
  onClose, onPick, onChangeFilters,
}: {
  title: string;
  sessions: SessionRow[];
  selectedSessionId: string;
  initialSearch: string;
  initialDate: string;
  onClose: () => void;
  onPick: (s: SessionRow) => void;
  onChangeFilters: (v: { search: string; date: string }) => void;
}) {
  const [search, setSearch]         = useState(initialSearch ?? '');
  const todayIso                    = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate]             = useState<string>(() => initialDate || todayIso);
  const [category, setCategory]     = useState('');
  const [classId, setClassId]       = useState('');
  const [onlyFuture, setOnlyFuture] = useState(true);

  useEffect(() => { onChangeFilters({ search, date }); }, [search, date]);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach((s) => { const c = s.classes; if (c?.id && c.title) map.set(c.id, c.title); });
    return Array.from(map.entries()).map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  }, [sessions]);

  const categoryOptions = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null }>();
    sessions.forEach((s) => { const cat = s.classes?.class_categories; if (cat?.name) map.set(cat.name, { name: cat.name, color: cat.color ?? null }); });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const needle = (search ?? '').toLowerCase().trim();
    const now    = Date.now();

    return sessions.filter((s) => {
      const title    = (s.classes?.title ?? '').toLowerCase();
      const catName  = (s.classes?.class_categories?.name ?? '').toLowerCase();
      const dateLabel = formatDateTime(s.starts_at).toLowerCase();

      if (needle && !title.includes(needle) && !dateLabel.includes(needle) && !catName.includes(needle)) return false;
      if (date) {
        const d = new Date(s.starts_at);
        if (Number.isNaN(d.getTime()) || d.toISOString().slice(0,10) !== date) return false;
      }
      if (classId && s.classes?.id !== classId) return false;
      if (category && (s.classes?.class_categories?.name ?? '') !== category) return false;
      if (onlyFuture) {
        const d = new Date(s.starts_at);
        if (Number.isNaN(d.getTime()) || d.getTime() < now) return false;
      }
      return true;
    });
  }, [sessions, search, date, classId, category, onlyFuture]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ animation: 'sessionPickerIn 0.2s ease' }}
      >
        {/* Top accent bar */}
        <div className="h-[3px] w-full bg-gradient-to-r from-primary/0 via-primary to-primary/0 shrink-0" />

        {/* Header */}
        <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
              <CalendarDays className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-black text-text-primary tracking-tight">{title}</h2>
              <p className="text-[11px] text-text-secondary mt-px">
                {filteredSessions.length} αποτελέσματα
              </p>
            </div>
          </div>
          <button
            type="button"
            className="p-1.5 rounded-xl border border-border/10 hover:bg-secondary/30 text-text-secondary hover:text-text-primary transition-all cursor-pointer shrink-0"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3.5 border-b border-border/10 space-y-3 shrink-0 bg-secondary/5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
              <input
                className="w-full h-9 pl-9 pr-3 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                placeholder="Αναζήτηση τμήματος, κατηγορίας…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Date */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
                <input
                  type="date"
                  className="w-full h-9 pl-9 pr-3 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              {date && (
                <button
                  type="button"
                  onClick={() => setDate('')}
                  className="h-9 px-2.5 rounded-xl border border-border/15 text-xs text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                className="h-9 px-2.5 rounded-xl border border-border/15 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer whitespace-nowrap"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setDate(todayIso); }}
              >
                Σήμερα
              </button>
            </div>

            {/* Class filter */}
            <SelectField value={classId} onChange={setClassId}>
              <option value="">Όλα τα τμήματα</option>
              {classOptions.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </SelectField>

            {/* Category filter */}
            <SelectField value={category} onChange={setCategory}>
              <option value="">Όλες οι κατηγορίες</option>
              {categoryOptions.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </SelectField>
          </div>

          {/* Only future toggle */}
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setOnlyFuture((v) => !v)}
              className={[
                'w-4 h-4 rounded-md border flex items-center justify-center transition-all cursor-pointer',
                onlyFuture ? 'bg-primary border-primary' : 'border-border/30 hover:border-primary/50',
              ].join(' ')}
            >
              {onlyFuture && <Check className="h-2.5 w-2.5 text-white" />}
            </div>
            <input type="checkbox" className="sr-only" checked={onlyFuture} onChange={(e) => setOnlyFuture(e.target.checked)} />
            <span className="text-xs text-text-secondary">Εμφάνιση μόνο μελλοντικών συνεδριών</span>
          </label>
        </div>

        {/* Sessions grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-text-secondary">
              <SlidersHorizontal className="h-7 w-7 opacity-30" />
              <span className="text-sm">Δεν βρέθηκαν συνεδρίες με αυτά τα φίλτρα.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredSessions.map((s) => {
                const isActive  = s.id === selectedSessionId;
                const catName   = s.classes?.class_categories?.name ?? null;
                const catColor  = s.classes?.class_categories?.color ?? null;

                return (
                  <button
                    key={s.id}
                    type="button"
                    className={[
                      'text-left rounded-xl border p-3.5 transition-all duration-150 cursor-pointer group',
                      isActive
                        ? 'border-primary/50 bg-primary/10 shadow-sm shadow-primary/10'
                        : 'border-border/10 bg-secondary-background/60 hover:border-primary/25 hover:bg-secondary/10',
                    ].join(' ')}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onPick(s); }}
                  >
                    {/* Title + color dot */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={['text-sm font-bold leading-snug line-clamp-2', isActive ? 'text-primary' : 'text-text-primary'].join(' ')}>
                        {s.classes?.title ?? '—'}
                      </span>
                      {catColor && (
                        <span className="shrink-0 h-2.5 w-2.5 rounded-full border border-border/20 mt-0.5" style={{ backgroundColor: catColor }} />
                      )}
                    </div>

                    {/* Times */}
                    <div className="space-y-0.5 mb-2.5">
                      <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                        <Clock className="h-3 w-3 opacity-50 shrink-0" />
                        {formatDateTime(s.starts_at)}
                      </div>
                      {s.ends_at && (
                        <div className="flex items-center gap-1.5 text-xs text-text-secondary opacity-70">
                          <Clock className="h-3 w-3 opacity-50 shrink-0" />
                          Λήξη: {formatDateTime(s.ends_at)}
                        </div>
                      )}
                    </div>

                    {/* Badges */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {catName ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] border border-border/15 bg-secondary/20">
                          {catColor && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: catColor }} />}
                          {catName}
                        </span>
                      ) : (
                        <span className="text-[10.5px] text-text-secondary opacity-50 flex items-center gap-1">
                          <Layers className="h-3 w-3" />Χωρίς κατηγορία
                        </span>
                      )}

                      {s.capacity != null && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] border border-border/15 bg-secondary/20">
                          <Users className="h-2.5 w-2.5 opacity-60" />
                          {s.capacity}
                        </span>
                      )}

                      {isActive && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] border border-primary/30 bg-primary/10 text-primary font-semibold">
                          <Check className="h-2.5 w-2.5" />
                          Επιλεγμένο
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border/10 flex items-center justify-between gap-3 shrink-0 bg-secondary/5">
          <p className="text-xs text-text-secondary">
            <span className="font-bold text-text-primary">{filteredSessions.length}</span> συνεδρίες
          </p>
          <button
            type="button"
            className="h-8 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
          >
            Κλείσιμο
          </button>
        </div>
      </div>

      <style>{`
        @keyframes sessionPickerIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
}