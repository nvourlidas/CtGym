import { Loader2, Pencil, Trash2, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { FinanceCategoryRow, FinanceTransactionRow } from '../types';
import { formatCurrency, formatDateDMY } from '../financeUtils';

export default function TransactionsTable({
  loading, paginated, total, page, setPage, pageCount, pageSize, setPageSize,
  startIdx, endIdx, categories, tenantId, onEdit, onDeleted,
}: {
  loading: boolean;
  paginated: FinanceTransactionRow[];
  total: number;
  page: number; setPage: (p: number | ((prev: number) => number)) => void;
  pageCount: number;
  pageSize: number; setPageSize: (s: number) => void;
  startIdx: number; endIdx: number;
  categories: FinanceCategoryRow[];
  tenantId: string | null;
  onEdit: (tx: FinanceTransactionRow) => void;
  onDeleted: (id: string) => void;
}) {
  const getCategory = (id: string | null) => id ? (categories.find((c) => c.id === id) ?? null) : null;

  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background overflow-hidden shadow-sm">
      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-text-secondary text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />Φόρτωση δεδομένων…
        </div>
      )}
      {!loading && (
        <>
          <div className="overflow-x-auto max-h-128 overflow-y-auto no-scrollbar">
            <table className="w-full text-sm no-scrollbar">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border/10 bg-secondary-background/95 backdrop-blur-sm">
                  {['Ημερομηνία', 'Τίτλος', 'Κατηγορία', 'Τύπος', 'Ποσό', 'Σημειώσεις', ''].map((h, i) => (
                    <th key={i} className={['px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary', i === 4 || i === 6 ? 'text-right' : 'text-left'].join(' ')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-text-secondary">Δεν βρέθηκαν κινήσεις για τα επιλεγμένα φίλτρα.</td></tr>
                )}
                {paginated.map((tx) => {
                  const cat = getCategory(tx.category_id);
                  const isIncome = tx.kind === 'income';
                  return (
                    <tr key={tx.id} className="border-t border-border/5 hover:bg-secondary/5 transition-colors">
                      <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">{formatDateDMY(tx.tx_date)}</td>
                      <td className="px-4 py-3 font-semibold text-text-primary max-w-36 truncate">{tx.title}</td>
                      <td className="px-4 py-3">
                        {cat ? (
                          <div className="flex items-center gap-1.5">
                            {cat.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />}
                            <span className="text-xs text-text-secondary truncate">{cat.name}</span>
                          </div>
                        ) : <span className="text-xs text-text-secondary opacity-40">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-lg border ${isIncome ? 'border-success/35 bg-success/10 text-success' : 'border-danger/35 bg-danger/10 text-danger'}`}>
                          {isIncome ? 'Έσοδο' : 'Έξοδο'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-black text-sm ${isIncome ? 'text-success' : 'text-danger'}`}>
                          {isIncome ? '+' : '-'}{formatCurrency(tx.amount ?? 0)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary max-w-40 truncate">{tx.notes ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button type="button" onClick={() => onEdit(tx)}
                            className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
                          ><Pencil className="h-3 w-3" /></button>
                          <button type="button" onClick={async () => {
                            if (!tenantId || !confirm('Σίγουρα θέλεις να διαγράψεις αυτή την κίνηση;')) return;
                            const { error } = await supabase.from('finance_transactions').delete().eq('id', tx.id).eq('tenant_id', tenantId);
                            if (!error) onDeleted(tx.id);
                          }}
                            className="h-7 w-7 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all cursor-pointer"
                          ><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/10 text-xs text-text-secondary">
              <span><span className="font-bold text-text-primary">{startIdx}–{endIdx}</span> από <span className="font-bold text-text-primary">{total}</span></span>
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
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 cursor-pointer transition-all"
                  ><ChevronLeft className="h-3.5 w-3.5" /></button>
                  <span className="px-2"><span className="font-bold text-text-primary">{page}</span> / {pageCount}</span>
                  <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount}
                    className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 cursor-pointer transition-all"
                  ><ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
