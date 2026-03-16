import { Pencil, Trash2, Loader2, ClipboardList, EyeOff, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Questionnaire } from '../types';
import { STATUS_META } from '../types';
import ActionBtn from './ActionBtn';

export default function QuestionnairesTable({
  loading, paginated, filtered, page, setPage, pageCount, pageSize, setPageSize, startIdx, endIdx,
  questionCounts, publishBusy, onTogglePublish, onEdit, onDelete,
}: {
  loading: boolean; paginated: Questionnaire[]; filtered: Questionnaire[];
  page: number; setPage: (fn: (p: number) => number) => void;
  pageCount: number; pageSize: number; setPageSize: (n: number) => void;
  startIdx: number; endIdx: number;
  questionCounts: Record<string, number>;
  publishBusy: Record<string, boolean>;
  onTogglePublish: (row: Questionnaire) => void;
  onEdit: (row: Questionnaire) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/10 bg-secondary-background/80">
              {['Τίτλος', 'Περιγραφή', 'Ερωτήσεις', 'Κατάσταση', ''].map((h, i) => (
                <th key={i} className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary ${i === 4 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-text-secondary">
                <div className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…</div>
              </td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center">
                <div className="flex flex-col items-center gap-2 text-text-secondary">
                  <ClipboardList className="h-7 w-7 opacity-20" />
                  <span className="text-sm">Δεν υπάρχουν ερωτηματολόγια</span>
                </div>
              </td></tr>
            )}
            {!loading && paginated.map((qq) => {
              const count = questionCounts[qq.id] ?? 0;
              const isPublished = qq.status === 'published';
              const busy = !!publishBusy[qq.id];
              const publishDisabled = !isPublished && count === 0;
              const meta = STATUS_META[qq.status] ?? STATUS_META.draft;
              return (
                <tr key={qq.id} className="border-t border-border/5 hover:bg-secondary/5 transition-colors">
                  <td className="px-4 py-3 font-bold text-text-primary">{qq.title}</td>
                  <td className="px-4 py-3 text-xs text-text-secondary max-w-xs">
                    <div className="line-clamp-2">{qq.description ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-lg border border-primary/25 bg-primary/10 text-primary">{count} ερωτ.</span>
                      {count === 0 && <span className="text-[10px] text-danger opacity-80">+1 για publish</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-lg border transition-all ${meta.cls} ${busy ? 'opacity-60' : ''}`}>{meta.label}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <ActionBtn
                        icon={busy ? Loader2 : (isPublished ? EyeOff : CheckCircle2)}
                        label={isPublished ? 'Απόσυρση' : 'Δημοσίευση'}
                        onClick={() => onTogglePublish(qq)}
                        disabled={busy || publishDisabled}
                        spin={busy}
                        titleOverride={publishDisabled ? 'Πρέπει να έχει τουλάχιστον 1 ερώτηση' : undefined}
                      />
                      <ActionBtn icon={Pencil} label="Επεξεργασία" onClick={() => onEdit(qq)} disabled={busy} />
                      <button type="button" onClick={() => onDelete(qq.id)} disabled={busy} title="Διαγραφή" aria-label="Διαγραφή"
                        className="h-7 w-7 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all disabled:opacity-40 cursor-pointer"
                      ><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden divide-y divide-border/5">
        {loading && <div className="flex items-center justify-center gap-2 py-10 text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Φόρτωση…</span></div>}
        {!loading && filtered.length === 0 && <div className="flex flex-col items-center gap-2 py-10 text-text-secondary"><ClipboardList className="h-7 w-7 opacity-20" /><span className="text-sm">Δεν υπάρχουν ερωτηματολόγια</span></div>}
        {!loading && paginated.map((qq) => {
          const count = questionCounts[qq.id] ?? 0;
          const isPublished = qq.status === 'published';
          const busy = !!publishBusy[qq.id];
          const publishDisabled = !isPublished && count === 0;
          const meta = STATUS_META[qq.status] ?? STATUS_META.draft;
          return (
            <div key={qq.id} className="px-4 py-3 hover:bg-secondary/5 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-text-primary text-sm truncate">{qq.title}</div>
                  {qq.description && <div className="text-xs text-text-secondary mt-0.5 line-clamp-2">{qq.description}</div>}
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-lg border border-primary/25 bg-primary/10 text-primary">{count} ερωτ.</span>
                    <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-lg border ${meta.cls}`}>{meta.label}</span>
                    {publishDisabled && <span className="text-[10px] text-danger">+1 ερώτηση για publish</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <ActionBtn icon={busy ? Loader2 : (isPublished ? EyeOff : CheckCircle2)} label={isPublished ? 'Απόσυρση' : 'Δημοσίευση'} onClick={() => onTogglePublish(qq)} disabled={busy || publishDisabled} spin={busy} />
                  <ActionBtn icon={Pencil} label="Επεξεργασία" onClick={() => onEdit(qq)} disabled={busy} />
                  <button type="button" onClick={() => onDelete(qq.id)} disabled={busy} className="h-7 w-7 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all disabled:opacity-40 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/10 text-xs text-text-secondary flex-wrap gap-2">
          <span>Εμφάνιση <span className="font-bold text-text-primary">{startIdx}–{endIdx}</span> από <span className="font-bold text-text-primary">{filtered.length}</span></span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span>Ανά σελίδα:</span>
              <div className="relative">
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-7 pl-2.5 pr-6 rounded-xl border border-border/15 bg-secondary-background text-xs appearance-none outline-none focus:border-primary/40 cursor-pointer">
                  {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary pointer-events-none" />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-40 cursor-pointer transition-all"><ChevronLeft className="h-3.5 w-3.5" /></button>
              <span className="px-2">Σελίδα <span className="font-bold text-text-primary">{page}</span> / {pageCount}</span>
              <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount} className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-40 cursor-pointer transition-all"><ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
