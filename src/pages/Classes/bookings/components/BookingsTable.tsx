import { Loader2, BookOpen, Pencil, User, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Booking } from '../types';
import { formatDateDMY, formatDateTime } from '../bookingUtils';
import StatusBadge from './StatusBadge';
import IconButton from './IconButton';
import DeleteButton from './DeleteButton';

interface BookingsTableProps {
  loading: boolean;
  rows: Booking[];
  totalCount: number;
  page: number;
  pageCount: number;
  pageSize: number;
  startIdx: number;
  endIdx: number;
  subscriptionInactive: boolean;
  onEdit: (b: Booking) => void;
  onDeleted: () => void;
  onError: (title: string, message: string) => void;
  onShowSubModal: () => void;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  setPageSize: React.Dispatch<React.SetStateAction<number>>;
}

export default function BookingsTable({
  loading, rows, totalCount, page, pageCount, pageSize, startIdx, endIdx,
  subscriptionInactive, onEdit, onDeleted, onError, onShowSubModal, setPage, setPageSize,
}: BookingsTableProps) {
  const guard = () => { if (subscriptionInactive) { onShowSubModal(); return false; } return true; };

  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background overflow-hidden shadow-sm">
      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-text-secondary text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-14 text-text-secondary">
          <BookOpen className="h-8 w-8 opacity-25" />
          <span className="text-sm">Δεν υπάρχουν κρατήσεις</span>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border/5">
            {rows.map((b) => {
              const isDropIn = (b.booking_type ?? 'membership') === 'drop_in';
              return (
                <div key={b.id} className="p-4 hover:bg-secondary/5 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-text-primary truncate">{b.profile?.full_name ?? b.user_id}</div>
                      <div className="text-xs text-text-secondary mt-0.5 truncate">
                        {b.session?.classes?.title ?? '—'} · {b.session?.starts_at ? formatDateTime(b.session.starts_at) : '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => onEdit(b)} />
                      <DeleteButton id={b.id} onDeleted={onDeleted} onError={onError} guard={guard} />
                    </div>
                  </div>

                  {b.session?.classes?.class_categories && (
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-1.5 text-[10.5px] px-2 py-0.5 rounded-full border border-border/15 bg-secondary/20">
                        {b.session.classes.class_categories.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: b.session.classes.class_categories.color }} />}
                        {b.session.classes.class_categories.name}
                      </span>
                    </div>
                  )}

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={b.status} />
                    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-lg border ${isDropIn ? 'border-warning/40 bg-warning/10 text-warning' : 'border-success/40 bg-success/10 text-success'}`}>
                      {isDropIn ? 'Drop-in' : 'Μέλος'}
                    </span>
                    {isDropIn && b.drop_in_price != null && <span className="text-[11px] text-text-secondary">{b.drop_in_price.toFixed(2)}€</span>}
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-text-secondary">
                    <span>Δημιουργία:</span>
                    <span className="font-medium text-text-primary">{formatDateDMY(b.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-225 text-sm">
              <thead>
                <tr className="border-b border-border/10 bg-secondary/5">
                  {['Μέλος', 'Τμήμα / Συνεδρία', 'Κατηγορία', 'Κατάσταση / Τύπος', 'Ημ. Δημιουργίας', ''].map((h, i) => (
                    <th key={i} className={['px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary', i === 5 ? 'text-right' : 'text-left'].join(' ')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const isDropIn = (b.booking_type ?? 'membership') === 'drop_in';
                  return (
                    <tr key={b.id} className="border-t border-border/5 hover:bg-secondary/5 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-secondary/20 border border-border/10 flex items-center justify-center shrink-0">
                            <User className="h-3.5 w-3.5 text-text-secondary opacity-60" />
                          </div>
                          <span className="font-semibold text-text-primary truncate max-w-36">{b.profile?.full_name ?? b.user_id}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-text-primary">{b.session?.classes?.title ?? '—'}</div>
                        <div className="text-xs text-text-secondary mt-0.5">
                          {b.session?.starts_at ? formatDateTime(b.session.starts_at) : '—'}
                          {b.session?.ends_at && <span className="opacity-60"> – {formatDateTime(b.session.ends_at)}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {b.session?.classes?.class_categories ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border border-border/15 bg-secondary/20">
                            {b.session.classes.class_categories.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: b.session.classes.class_categories.color }} />}
                            {b.session.classes.class_categories.name}
                          </span>
                        ) : <span className="text-xs text-text-secondary opacity-40">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <StatusBadge status={b.status} />
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-flex items-center text-[10.5px] font-semibold px-2 py-0.5 rounded-lg border ${isDropIn ? 'border-warning/40 bg-warning/10 text-warning' : 'border-success/40 bg-success/10 text-success'}`}>
                              {isDropIn ? 'Drop-in' : 'Μέλος'}
                            </span>
                            {isDropIn && b.drop_in_price != null && <span className="text-[11px] text-text-secondary">{b.drop_in_price.toFixed(2)}€</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{formatDateDMY(b.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => onEdit(b)} />
                          <DeleteButton id={b.id} onDeleted={onDeleted} onError={onError} guard={guard} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/10 text-xs text-text-secondary">
            <span><span className="font-bold text-text-primary">{startIdx}–{endIdx}</span> από <span className="font-bold text-text-primary">{totalCount}</span></span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="hidden sm:inline">Ανά σελίδα:</span>
                <div className="relative">
                  <select className="h-7 pl-2 pr-7 rounded-lg border border-border/15 bg-secondary-background text-xs appearance-none outline-none cursor-pointer" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none" />
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-all"><ChevronLeft className="h-3.5 w-3.5" /></button>
                <span className="px-2"><span className="font-bold text-text-primary">{page}</span> / {pageCount}</span>
                <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount} className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-all"><ChevronRight className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
