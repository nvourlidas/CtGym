import { Loader2, Calendar, Check, QrCode, Clock, Pencil, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import type { GymClass, SessionRow } from '../types';
import { formatDateTime } from '../sessionUtils';
import IconButton from './IconButton';
import DeleteButton from './DeleteButton';

type Props = {
  loading: boolean;
  rows: SessionRow[];
  totalCount: number;
  classes: GymClass[];
  page: number; pageCount: number;
  pageSize: number; startIdx: number; endIdx: number;
  selectedIds: string[];
  allPageSelected: boolean;
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  setPageSize: (n: number) => void;
  onEdit: (s: SessionRow) => void;
  onDeleteGuard: () => boolean;
  onDeleted: () => void;
  setError: (s: string | null) => void;
  onAttendance: (s: SessionRow) => void;
  onQr: (s: SessionRow) => void;
};

export default function SessionsTable({
  loading, rows, totalCount, classes,
  page, pageCount, pageSize, startIdx, endIdx,
  selectedIds, allPageSelected, setSelectedIds,
  setPage, setPageSize,
  onEdit, onDeleteGuard, onDeleted, setError,
  onAttendance, onQr,
}: Props) {
  const pageIds = rows.map((s) => s.id);
  const getClass = (id: string) => classes.find((c) => c.id === id);

  const togglePage = () => setSelectedIds((prev) => {
    const allSel = pageIds.length > 0 && pageIds.every((id) => prev.includes(id));
    if (allSel) return prev.filter((id) => !pageIds.includes(id));
    const next = new Set(prev); pageIds.forEach((id) => next.add(id)); return Array.from(next);
  });

  const toggleOne = (id: string) => setSelectedIds((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  );

  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background overflow-hidden shadow-sm">

      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-205 text-sm">
          <thead>
            <tr className="border-b border-border/10 bg-secondary/5">
              <th className="px-4 py-3 w-10">
                <div
                  onClick={togglePage}
                  className={['w-4 h-4 rounded-md border flex items-center justify-center cursor-pointer transition-all', allPageSelected ? 'bg-primary border-primary' : 'border-border/30 hover:border-primary/50'].join(' ')}
                >
                  {allPageSelected && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
              </th>
              {['Τμήμα', 'Έναρξη', 'Λήξη', 'Χωρητ.', 'Ακύρωση (ώρες)', ''].map((h, i) => (
                <th key={i} className={['px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary', i === 5 ? 'text-right' : 'text-left'].join(' ')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-4 py-10">
                <div className="flex items-center justify-center gap-2 text-text-secondary text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…
                </div>
              </td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12">
                <div className="flex flex-col items-center gap-3 text-text-secondary">
                  <Calendar className="h-8 w-8 opacity-25" />
                  <span className="text-sm">Δεν υπάρχουν συνεδρίες</span>
                </div>
              </td></tr>
            )}
            {!loading && rows.map((s) => {
              const cls   = getClass(s.class_id);
              const hasQr = Boolean(s.checkin_token);
              const isSel = selectedIds.includes(s.id);
              return (
                <tr key={s.id} className={['border-t border-border/5 transition-colors', isSel ? 'bg-primary/4' : 'hover:bg-secondary/5'].join(' ')}>
                  <td className="px-4 py-3">
                    <div onClick={() => toggleOne(s.id)} className={['w-4 h-4 rounded-md border flex items-center justify-center cursor-pointer transition-all', isSel ? 'bg-primary border-primary' : 'border-border/30 hover:border-primary/50'].join(' ')}>
                      {isSel && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-text-primary">{cls?.title ?? '—'}</div>
                    {cls?.class_categories && (
                      <span className="inline-flex items-center gap-1.5 mt-1 text-[10.5px] px-2 py-0.5 rounded-full border border-border/15 bg-secondary/20">
                        {cls.class_categories.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: cls.class_categories.color }} />}
                        {cls.class_categories.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{formatDateTime(s.starts_at)}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{s.ends_at ? formatDateTime(s.ends_at) : '—'}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{s.capacity ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{s.cancel_before_hours != null ? s.cancel_before_hours : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <IconButton icon={QrCode} label="QR check-in" onClick={() => onQr(s)} disabled={!hasQr} />
                      <IconButton icon={Clock}  label="Ιστορικό"    onClick={() => onAttendance(s)} />
                      <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => onEdit(s)} />
                      <DeleteButton id={s.id} onDeleted={onDeleted} setError={setError} guard={onDeleteGuard} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-border/5">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-text-secondary text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-text-secondary">
            <Calendar className="h-8 w-8 opacity-25" />
            <span className="text-sm">Δεν υπάρχουν συνεδρίες</span>
          </div>
        )}
        {!loading && rows.map((s) => {
          const cls   = getClass(s.class_id);
          const hasQr = Boolean(s.checkin_token);
          const isSel = selectedIds.includes(s.id);
          return (
            <div key={s.id} className={['px-4 py-4 transition-colors', isSel ? 'bg-primary/4' : 'hover:bg-secondary/5'].join(' ')}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div onClick={() => toggleOne(s.id)} className={['w-4 h-4 rounded-md border flex items-center justify-center cursor-pointer transition-all mt-0.5 shrink-0', isSel ? 'bg-primary border-primary' : 'border-border/30 hover:border-primary/50'].join(' ')}>
                    {isSel && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-text-primary">{cls?.title ?? '—'}</div>
                    {cls?.class_categories && (
                      <span className="inline-flex items-center gap-1.5 mt-1 text-[10.5px] px-2 py-0.5 rounded-full border border-border/15 bg-secondary/20">
                        {cls.class_categories.color && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cls.class_categories.color }} />}
                        {cls.class_categories.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <IconButton icon={QrCode} label="QR" onClick={() => onQr(s)} disabled={!hasQr} />
                  <IconButton icon={Clock}  label="Ιστορικό" onClick={() => onAttendance(s)} />
                  <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => onEdit(s)} />
                  <DeleteButton id={s.id} onDeleted={onDeleted} setError={setError} guard={onDeleteGuard} />
                </div>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs pl-6">
                {([
                  ['Έναρξη', formatDateTime(s.starts_at)],
                  ['Λήξη', s.ends_at ? formatDateTime(s.ends_at) : '—'],
                  ['Χωρητικότητα', s.capacity ?? '—'],
                  ['Ακύρωση (ώρες)', s.cancel_before_hours != null ? s.cancel_before_hours : '—'],
                ] as [string, string | number][]).map(([label, val]) => (
                  <div key={label}>
                    <span className="text-text-secondary">{label}: </span>
                    <span className="text-text-primary font-medium">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {!loading && rows.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/10 text-xs text-text-secondary">
          <span>
            <span className="font-bold text-text-primary">{startIdx}–{endIdx}</span> από <span className="font-bold text-text-primary">{totalCount}</span>
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="hidden sm:inline">Ανά σελίδα:</span>
              <div className="relative">
                <select className="h-7 pl-2 pr-7 rounded-lg border border-border/15 bg-secondary-background text-xs appearance-none outline-none focus:border-primary/40 cursor-pointer" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                  {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none" />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-all">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="px-2"><span className="font-bold text-text-primary">{page}</span> / {pageCount}</span>
              <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount} className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-all">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
