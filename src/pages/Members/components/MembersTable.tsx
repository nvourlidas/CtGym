import { Loader2, Users, Check, Eye, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Member, ColumnKey } from '../types';
import { formatDateDMY, formatMoney } from '../memberUtils';
import IconButton from './IconButton';
import DeleteButton from './DeleteButton';

// ── Table cell primitives
function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-text-secondary ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

type Props = {
  loading: boolean;
  filtered: Member[];
  paginated: Member[];
  visibleCols: ColumnKey[];
  membershipDebts: Record<string, number>;
  dropinDebts: Record<string, number>;
  selectedIds: string[];
  toggleSelect: (id: string) => void;
  allPageSelected: boolean;
  toggleSelectPage: () => void;
  page: number;
  pageCount: number;
  pageSize: number;
  startIdx: number;
  endIdx: number;
  setPage: (fn: (p: number) => number) => void;
  setPageSize: (n: number) => void;
  onEdit: (m: Member) => void;
  onDeleteGuard: () => boolean;
  onDeleted: () => void;
  tenantId: string | undefined;
  subscriptionInactive: boolean;
};

const isColVisible = (visibleCols: ColumnKey[], key: ColumnKey) => visibleCols.includes(key);

export default function MembersTable({
  loading, filtered, paginated, visibleCols,
  membershipDebts, dropinDebts,
  selectedIds, toggleSelect, allPageSelected, toggleSelectPage,
  page, pageCount, pageSize, startIdx, endIdx, setPage, setPageSize,
  onEdit, onDeleteGuard, onDeleted, tenantId, subscriptionInactive,
}: Props) {
  const navigate = useNavigate();
  const desktopColCount = 3 + visibleCols.length + 1;

  return (
    <div className="rounded-2xl border border-border/10 overflow-hidden bg-secondary-background/40">

      {/* DESKTOP TABLE */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-180 text-sm">
          <thead>
            <tr className="border-b border-border/10 bg-secondary/10">
              <th className="px-4 py-3 w-10">
                <div
                  onClick={toggleSelectPage}
                  className={['w-4 h-4 rounded-md border flex items-center justify-center cursor-pointer transition-all',
                    allPageSelected ? 'bg-primary border-primary' : 'border-border/30 hover:border-primary/50',
                  ].join(' ')}
                >
                  {allPageSelected && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
              </th>
              {['Όνομα', 'Τηλέφωνο'].map((h) => <Th key={h}>{h}</Th>)}
              {isColVisible(visibleCols, 'email')           && <Th>Email</Th>}
              {isColVisible(visibleCols, 'birth_date')      && <Th>Ημ. Γέννησης</Th>}
              {isColVisible(visibleCols, 'address')         && <Th>Διεύθυνση</Th>}
              {isColVisible(visibleCols, 'afm')             && <Th>ΑΦΜ</Th>}
              {isColVisible(visibleCols, 'total_debt')      && <Th>Συνολική Οφειλή</Th>}
              {isColVisible(visibleCols, 'max_dropin_debt') && <Th>Max Drop-in</Th>}
              {isColVisible(visibleCols, 'notes')           && <Th>Σημειώσεις</Th>}
              {isColVisible(visibleCols, 'created_at')      && <Th>Εγγραφή</Th>}
              <Th className="text-right pr-4">Ενέργειες</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={desktopColCount} className="px-4 py-8 text-center">
                <div className="flex items-center justify-center gap-2 text-text-secondary text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…
                </div>
              </td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={desktopColCount} className="px-4 py-12 text-center">
                <div className="flex flex-col items-center gap-2 text-text-secondary">
                  <Users className="h-8 w-8 opacity-30" />
                  <span className="text-sm">Δεν βρέθηκαν μέλη</span>
                </div>
              </td></tr>
            )}
            {!loading && paginated.map((m) => {
              const totalDebt = (membershipDebts[m.id] ?? 0) + (dropinDebts[m.id] ?? 0);
              const isSelected = selectedIds.includes(m.id);
              return (
                <tr key={m.id} className={['border-t border-border/5 transition-colors', isSelected ? 'bg-primary/5' : 'hover:bg-secondary/10'].join(' ')}>
                  <td className="px-4 py-3">
                    <div
                      onClick={() => toggleSelect(m.id)}
                      className={['w-4 h-4 rounded-md border flex items-center justify-center cursor-pointer transition-all',
                        isSelected ? 'bg-primary border-primary' : 'border-border/30 hover:border-primary/50',
                      ].join(' ')}
                    >
                      {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                  </td>
                  <Td><span className="font-medium text-text-primary">{m.full_name ?? '—'}</span></Td>
                  <Td><span className="text-text-secondary">{m.phone ?? '—'}</span></Td>
                  {isColVisible(visibleCols, 'email')      && <Td><span className="text-text-secondary text-xs">{m.email ?? '—'}</span></Td>}
                  {isColVisible(visibleCols, 'birth_date') && <Td>{formatDateDMY(m.birth_date)}</Td>}
                  {isColVisible(visibleCols, 'address')    && <Td>{m.address ?? '—'}</Td>}
                  {isColVisible(visibleCols, 'afm')        && <Td>{m.afm ?? '—'}</Td>}
                  {isColVisible(visibleCols, 'total_debt') && (
                    <Td>
                      {totalDebt !== 0
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-warning/10 border border-warning/20 text-warning text-xs font-bold">{formatMoney(totalDebt)}</span>
                        : <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-success/10 border border-success/20 text-success text-xs font-bold">0 €</span>}
                    </Td>
                  )}
                  {isColVisible(visibleCols, 'max_dropin_debt') && <Td>{m.max_dropin_debt != null ? formatMoney(Number(m.max_dropin_debt)) : '—'}</Td>}
                  {isColVisible(visibleCols, 'notes')       && <Td><span className="max-w-50 truncate block text-text-secondary text-xs">{m.notes ?? '—'}</span></Td>}
                  {isColVisible(visibleCols, 'created_at')  && <Td><span className="text-text-secondary text-xs">{formatDateDMY(m.created_at)}</span></Td>}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton icon={Eye}    label="Λεπτομέρειες" onClick={() => navigate(`/members/${m.id}`, { state: { member: m, tenantId, subscriptionInactive } })} />
                      <IconButton icon={Pencil} label="Επεξεργασία"   onClick={() => onEdit(m)} />
                      <DeleteButton id={m.id} onDeleted={onDeleted} guard={onDeleteGuard} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MOBILE CARDS */}
      <div className="md:hidden divide-y divide-border/10">
        {loading && (
          <div className="px-4 py-8 text-center text-sm text-text-secondary flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="px-4 py-12 flex flex-col items-center gap-2 text-text-secondary">
            <Users className="h-8 w-8 opacity-30" />
            <span className="text-sm">Δεν βρέθηκαν μέλη</span>
          </div>
        )}
        {!loading && paginated.map((m) => {
          const totalDebt = (membershipDebts[m.id] ?? 0) + (dropinDebts[m.id] ?? 0);
          const isSelected = selectedIds.includes(m.id);
          return (
            <div key={m.id} className={['px-4 py-3.5 transition-colors', isSelected ? 'bg-primary/5' : 'hover:bg-secondary/5'].join(' ')}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    onClick={() => toggleSelect(m.id)}
                    className={['mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center cursor-pointer shrink-0 transition-all',
                      isSelected ? 'bg-primary border-primary' : 'border-border/30',
                    ].join(' ')}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-text-primary">{m.full_name ?? '—'}</div>
                    <div className="text-xs text-text-secondary mt-0.5">{m.phone ?? '—'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <IconButton icon={Eye}    label="Λεπτομέρειες" onClick={() => navigate(`/members/${m.id}`, { state: { member: m, tenantId, subscriptionInactive } })} />
                  <IconButton icon={Pencil} label="Επεξεργασία"   onClick={() => onEdit(m)} />
                  <DeleteButton id={m.id} onDeleted={onDeleted} guard={onDeleteGuard} />
                </div>
              </div>
              {(isColVisible(visibleCols, 'total_debt') || isColVisible(visibleCols, 'email') || isColVisible(visibleCols, 'created_at')) && (
                <div className="mt-2.5 ml-7 flex flex-wrap gap-2">
                  {isColVisible(visibleCols, 'total_debt') && (
                    totalDebt !== 0
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-warning/10 border border-warning/20 text-warning text-[11px] font-bold">{formatMoney(totalDebt)}</span>
                      : <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-success/10 border border-success/20 text-success text-[11px] font-bold">0 €</span>
                  )}
                  {isColVisible(visibleCols, 'email')      && m.email && <span className="text-[11px] text-text-secondary">{m.email}</span>}
                  {isColVisible(visibleCols, 'created_at') && <span className="text-[11px] text-text-secondary">{formatDateDMY(m.created_at)}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/10 bg-secondary/5 text-xs text-text-secondary flex-wrap gap-2">
          <span>
            <span className="font-semibold text-text-primary">{startIdx}–{endIdx}</span>
            {' '}από{' '}
            <span className="font-semibold text-text-primary">{filtered.length}</span>
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span>Ανά σελίδα:</span>
              <select
                className="bg-secondary-background border border-border/15 rounded-lg px-2 py-1 text-xs text-text-primary outline-none"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="px-2">Σελ. <span className="font-semibold text-text-primary">{page}</span>/{pageCount}</span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page === pageCount}
                className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 transition-all cursor-pointer disabled:cursor-not-allowed"
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
