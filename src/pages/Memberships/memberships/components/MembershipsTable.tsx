import { Pencil, Loader2, Users, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { MembershipRow } from '../types';
import { formatMoney, formatDateDMY, getStatus } from '../membershipUtils';
import CategoryChip from './CategoryChip';
import IconButton from './IconButton';
import DeleteButton from './DeleteButton';

export default function MembershipsTable({
  loading, paginated, filtered, page, setPage, pageCount, pageSize, setPageSize, startIdx, endIdx,
  tenantId, subscriptionInactive, onShowSubModal, onEdit, onDeleted,
}: {
  loading: boolean; paginated: MembershipRow[]; filtered: MembershipRow[];
  page: number; setPage: (fn: (p: number) => number) => void;
  pageCount: number; pageSize: number; setPageSize: (n: number) => void;
  startIdx: number; endIdx: number;
  tenantId: string; subscriptionInactive: boolean;
  onShowSubModal: () => void; onEdit: (m: MembershipRow) => void; onDeleted: () => void;
}) {
  const guard = () => { if (subscriptionInactive) { onShowSubModal(); return false; } return true; };

  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background overflow-hidden shadow-sm">
      {loading && <div className="flex items-center justify-center gap-2 py-10 text-text-secondary text-sm"><Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…</div>}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-14 text-text-secondary">
          <Users className="h-8 w-8 opacity-25" />
          <span className="text-sm">Καμία συνδρομή</span>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border/5">
            {paginated.map((m) => {
              const basePrice = m.plan_price;
              const effectivePrice = m.custom_price != null ? m.custom_price : basePrice;
              const { label: sLabel, cls: sCls } = getStatus(m.status);
              const hasDebt = m.debt != null && m.debt !== 0;
              return (
                <div key={m.id} className="p-4 hover:bg-secondary/5 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-text-primary truncate">{m.profile?.full_name ?? m.user_id}</div>
                      <div className="text-xs text-text-secondary mt-0.5">{m.plan_name ?? 'Χωρίς πλάνο'}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-lg border ${sCls}`}>{sLabel}</span>
                      <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => { if (guard()) onEdit(m); }} />
                      <DeleteButton id={m.id} tenantId={tenantId} onDeleted={onDeleted} guard={guard} />
                    </div>
                  </div>

                  {effectivePrice != null && (
                    <div className="mt-2 text-sm font-bold text-primary">
                      {formatMoney(effectivePrice)}
                      {basePrice != null && m.custom_price != null && m.custom_price !== basePrice && (
                        <span className="ml-2 text-[11px] text-warning font-normal">κανονική: {formatMoney(basePrice)}</span>
                      )}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1">
                    {(m.plan_categories ?? []).length > 0 ? (m.plan_categories ?? []).map((cat) => <CategoryChip key={cat.id} cat={cat} />) : <span className="text-[11px] text-text-secondary opacity-50">Χωρίς κατηγορία</span>}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-text-secondary">
                    {[['Έναρξη', formatDateDMY(m.starts_at)], ['Λήξη', formatDateDMY(m.ends_at)], ['Μέρες υπολοίπου', m.days_remaining ?? '—'], ['Υπολ. συνεδρίες', m.remaining_sessions ?? '—']].map(([label, val]) => (
                      <div key={String(label)} className="flex flex-col gap-0.5"><span>{label}</span><span className="text-text-primary font-medium">{String(val)}</span></div>
                    ))}
                  </div>

                  <div className="mt-2 text-[11px]">
                    {hasDebt ? <span className="font-bold text-warning">Οφειλή: {formatMoney(m.debt!)}</span> : <span className="text-success font-semibold">Εξοφλημένη</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/10 bg-secondary/5">
                  {['Μέλος', 'Πλάνο / Τιμή', 'Κατηγορία', 'Έναρξη', 'Λήξη', 'Μέρες', 'Συνεδρίες', 'Οφειλή', 'Κατάσταση', ''].map((h, i) => (
                    <th key={i} className={['px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary', i === 9 ? 'text-right' : 'text-left'].join(' ')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((m) => {
                  const basePrice = m.plan_price;
                  const effectivePrice = m.custom_price != null ? m.custom_price : basePrice;
                  const hasDebt = m.debt != null && m.debt !== 0;
                  const { label: sLabel, cls: sCls } = getStatus(m.status);
                  return (
                    <tr key={m.id} className="border-t border-border/5 hover:bg-secondary/5 transition-colors">
                      <td className="px-4 py-3 font-semibold text-text-primary">{m.profile?.full_name ?? m.user_id}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-text-primary">{m.plan_name ?? '—'}</div>
                        {effectivePrice != null && (
                          <div className="text-xs mt-0.5">
                            <span className="font-bold text-primary">{formatMoney(effectivePrice)}</span>
                            {basePrice != null && m.custom_price != null && m.custom_price !== basePrice && (
                              <span className="ml-1.5 text-warning opacity-80">κανονική: {formatMoney(basePrice)}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {(m.plan_categories ?? []).length > 0 ? (
                          <div className="flex flex-wrap gap-1">{(m.plan_categories ?? []).map((cat) => <CategoryChip key={cat.id} cat={cat} />)}</div>
                        ) : <span className="text-xs text-text-secondary opacity-40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">{formatDateDMY(m.starts_at)}</td>
                      <td className="px-4 py-3 text-xs text-text-secondary">{formatDateDMY(m.ends_at)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">{m.days_remaining ?? '—'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">{m.remaining_sessions ?? '—'}</td>
                      <td className="px-4 py-3">
                        {hasDebt ? <span className="text-xs font-bold text-warning">{formatMoney(m.debt!)}</span> : <span className="text-xs font-semibold text-success">Εξοφλημένη</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${sCls}`}>{sLabel}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => { if (guard()) onEdit(m); }} />
                          <DeleteButton id={m.id} tenantId={tenantId} onDeleted={onDeleted} guard={guard} />
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
            <span><span className="font-bold text-text-primary">{startIdx}–{endIdx}</span> από <span className="font-bold text-text-primary">{filtered.length}</span></span>
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
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 cursor-pointer transition-all"><ChevronLeft className="h-3.5 w-3.5" /></button>
                <span className="px-2"><span className="font-bold text-text-primary">{page}</span> / {pageCount}</span>
                <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount} className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 cursor-pointer transition-all"><ChevronRight className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
