import { Loader2, Dumbbell, Check, Pencil, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import type { GymClass } from '../types';
import IconButton from './IconButton';
import DeleteButton from './DeleteButton';

type Props = {
  loading: boolean;
  rows: GymClass[];
  totalCount: number;
  page: number;
  pageCount: number;
  pageSize: number;
  startIdx: number;
  endIdx: number;
  setPage: (fn: (p: number) => number) => void;
  setPageSize: (n: number) => void;
  onEdit: (c: GymClass) => void;
  onDeleteGuard: () => boolean;
  onDeleted: () => void;
};

export default function ClassesTable({
  loading, rows, totalCount,
  page, pageCount, pageSize, startIdx, endIdx,
  setPage, setPageSize, onEdit, onDeleteGuard, onDeleted,
}: Props) {
  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background overflow-hidden shadow-sm">

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-180 text-sm">
          <thead>
            <tr className="border-b border-border/10 bg-secondary/5">
              {['Τίτλος', 'Κατηγορία', 'Προπονητής', 'Drop-in', ''].map((h, i) => (
                <th
                  key={i}
                  className={['px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary', i === 4 ? 'text-right' : 'text-left'].join(' ')}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-10">
                <div className="flex items-center justify-center gap-2 text-text-secondary text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…
                </div>
              </td></tr>
            )}
            {!loading && totalCount === 0 && (
              <tr><td colSpan={5} className="px-4 py-12">
                <div className="flex flex-col items-center gap-3 text-text-secondary">
                  <Dumbbell className="h-8 w-8 opacity-25" />
                  <span className="text-sm">Δεν υπάρχουν τμήματα</span>
                </div>
              </td></tr>
            )}
            {!loading && rows.map((c) => (
              <tr key={c.id} className="border-t border-border/5 hover:bg-secondary/5 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-semibold text-text-primary">{c.title}</div>
                  {c.description && (
                    <div className="text-xs text-text-secondary mt-0.5 line-clamp-1 max-w-xs">{c.description}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {c.class_categories ? (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-border/15 bg-secondary/20">
                      {c.class_categories.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.class_categories.color }} />}
                      {c.class_categories.name}
                    </span>
                  ) : <span className="text-xs text-text-secondary opacity-40">—</span>}
                </td>
                <td className="px-4 py-3">
                  {c.coach
                    ? <span className="text-xs text-text-primary">{c.coach.full_name}</span>
                    : <span className="text-xs text-text-secondary opacity-40">—</span>}
                </td>
                <td className="px-4 py-3">
                  {c.drop_in_enabled ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg border border-success/25 bg-success/10 text-success w-fit">
                        <Check className="h-2.5 w-2.5" />Ενεργό
                      </span>
                      {c.drop_in_price != null && (
                        <span className="text-[11px] text-text-secondary">
                          {c.drop_in_price.toFixed(2)}€ · Μέλος: {c.member_drop_in_price?.toFixed(2) ?? '—'}€
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-text-secondary opacity-40">Όχι</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => onEdit(c)} />
                    <DeleteButton id={c.id} onDeleted={onDeleted} guard={onDeleteGuard} />
                  </div>
                </td>
              </tr>
            ))}
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
        {!loading && totalCount === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-text-secondary">
            <Dumbbell className="h-8 w-8 opacity-25" />
            <span className="text-sm">Δεν υπάρχουν τμήματα</span>
          </div>
        )}
        {!loading && rows.map((c) => (
          <div key={c.id} className="px-4 py-4 hover:bg-secondary/5 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-sm text-text-primary">{c.title}</div>
                {c.coach && <div className="text-xs text-text-secondary mt-0.5">{c.coach.full_name}</div>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => onEdit(c)} />
                <DeleteButton id={c.id} onDeleted={onDeleted} guard={onDeleteGuard} />
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {c.class_categories && (
                <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border border-border/15 bg-secondary/20">
                  {c.class_categories.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.class_categories.color }} />}
                  {c.class_categories.name}
                </span>
              )}
              {c.drop_in_enabled && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-success/25 bg-success/10 text-success font-semibold">
                  Drop-in {c.drop_in_price != null ? `${c.drop_in_price.toFixed(2)}€` : ''}
                </span>
              )}
            </div>
            {c.description && (
              <div className="mt-2 text-xs text-text-secondary line-clamp-2 leading-relaxed">{c.description}</div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination footer */}
      {!loading && totalCount > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/10 text-xs text-text-secondary">
          <span>
            <span className="font-bold text-text-primary">{startIdx}–{endIdx}</span>
            {' '}από{' '}
            <span className="font-bold text-text-primary">{totalCount}</span>
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="hidden sm:inline">Ανά σελίδα:</span>
              <div className="relative">
                <select
                  className="h-7 pl-2 pr-7 rounded-lg border border-border/15 bg-secondary-background text-xs appearance-none outline-none focus:border-primary/40 cursor-pointer"
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(() => 1); }}
                >
                  {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none" />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 transition-all cursor-pointer disabled:cursor-not-allowed"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="px-2">
                <span className="font-bold text-text-primary">{page}</span> / {pageCount}
              </span>
              <button
                className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 transition-all cursor-pointer disabled:cursor-not-allowed"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page === pageCount}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
