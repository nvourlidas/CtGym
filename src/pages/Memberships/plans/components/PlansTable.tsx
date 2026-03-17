import { Pencil, Loader2, CreditCard, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Plan } from '../types';
import { formatMoney, formatDateDMY, renderBenefits, PLAN_KIND_LABEL, PLAN_KIND_COLOR } from '../planUtils';
import CategoryChip from './CategoryChip';
import IconButton from './IconButton';
import DeleteButton from './DeleteButton';

export default function PlansTable({
  loading, paginated, filtered, page, setPage, pageCount, pageSize, setPageSize, startIdx, endIdx,
  tenantId, subscriptionInactive, onShowSubModal, onEdit, onDeleted,
}: {
  loading: boolean; paginated: Plan[]; filtered: Plan[];
  page: number; setPage: (fn: (p: number) => number) => void;
  pageCount: number; pageSize: number; setPageSize: (n: number) => void;
  startIdx: number; endIdx: number;
  tenantId: string; subscriptionInactive: boolean;
  onShowSubModal: () => void; onEdit: (p: Plan) => void; onDeleted: () => void;
}) {
  const guard = () => { if (subscriptionInactive) { onShowSubModal(); return false; } return true; };

  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background overflow-hidden shadow-sm">
      {loading && <div className="flex items-center justify-center gap-2 py-10 text-text-secondary text-sm"><Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…</div>}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-14 text-text-secondary">
          <CreditCard className="h-8 w-8 opacity-25" />
          <span className="text-sm">Κανένα πλάνο</span>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border/5">
            {paginated.map((p) => (
              <div key={p.id} className="p-4 hover:bg-secondary/5 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-text-primary truncate">{p.name}</div>
                    {p.price != null && <div className="text-sm font-bold text-primary mt-0.5">{formatMoney(p.price)}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-lg border ${PLAN_KIND_COLOR[p.plan_kind]}`}>{PLAN_KIND_LABEL[p.plan_kind]}</span>
                    <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => { if (guard()) onEdit(p); }} />
                    <DeleteButton tenantId={tenantId} id={p.id} onDeleted={onDeleted} guard={guard} />
                  </div>
                </div>
                {p.description && <p className="mt-2 text-xs text-text-secondary line-clamp-2">{p.description}</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.categories.length > 0 ? p.categories.map((cat) => <CategoryChip key={cat.id} cat={cat} />) : <span className="text-[11px] text-text-secondary opacity-50">Χωρίς κατηγορία</span>}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-text-secondary">
                  <span>Οφέλη: <span className="text-text-primary font-medium">{renderBenefits(p)}</span></span>
                  <span>{formatDateDMY(p.created_at)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/10 bg-secondary/5">
                  {['Ονομασία', 'Κατηγορίες', 'Τιμή', 'Τύπος', 'Οφέλη', 'Δημιουργήθηκε', ''].map((h, i) => (
                    <th key={i} className={['px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary', i === 6 ? 'text-right' : 'text-left'].join(' ')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((p) => (
                  <tr key={p.id} className="border-t border-border/5 hover:bg-secondary/5 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-text-primary">{p.name}</div>
                      {p.description && <div className="text-xs text-text-secondary mt-0.5 line-clamp-1 max-w-48">{p.description}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {p.categories.length > 0 ? (
                        <div className="flex flex-wrap gap-1">{p.categories.map((cat) => <CategoryChip key={cat.id} cat={cat} />)}</div>
                      ) : <span className="text-xs text-text-secondary opacity-40">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {p.price != null ? <span className="font-bold text-primary">{formatMoney(p.price)}</span> : <span className="text-xs text-text-secondary opacity-40">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${PLAN_KIND_COLOR[p.plan_kind]}`}>{PLAN_KIND_LABEL[p.plan_kind]}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{renderBenefits(p)}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{formatDateDMY(p.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => { if (guard()) onEdit(p); }} />
                        <DeleteButton tenantId={tenantId} id={p.id} onDeleted={onDeleted} guard={guard} />
                      </div>
                    </td>
                  </tr>
                ))}
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
