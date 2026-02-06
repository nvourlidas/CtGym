import { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import { Pencil, Trash2, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';

type Member = { id: string; full_name: string | null; email?: string | null };
type Plan = {
  id: string;
  name: string;
  plan_kind: 'duration' | 'sessions' | 'hybrid';
  duration_days: number | null;
  session_credits: number | null;
  price: number | null;
};

type PlanCategory = {
  id: string;
  name: string;
  color: string | null;
};

type MembershipRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  plan_id: string | null;
  starts_at: string | null; // ISO date
  ends_at: string | null;   // ISO date
  status: string | null;
  created_at: string;
  remaining_sessions: number | null;
  plan_kind: string | null; // snapshot
  plan_name: string | null; // snapshot
  plan_price: number | null;// snapshot βασική τιμή πλάνου
  custom_price: number | null; // τελική τιμή για αυτό το μέλος (αν υπάρχει έκπτωση)
  discount_reason?: string | null;
  days_remaining: number | null;
  debt: number | null;
  plan_categories?: PlanCategory[]; // κατηγορίες πλάνου
  profile?: Member | null;          // joined για εμφάνιση
};

export default function MembershipsPage() {
  const { profile, subscription } = useAuth();
  const [showSubModal, setShowSubModal] = useState(false);
  const [rows, setRows] = useState<MembershipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<MembershipRow | null>(null);

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // filters
  const [filterCategory, setFilterCategory] = useState<string>(''); // category_id
  const [filterPlan, setFilterPlan] = useState<string>('');         // plan_id
  const [filterStatus, setFilterStatus] = useState<string>('');     // active/paused/...
  const [filterDebt, setFilterDebt] = useState<'all' | 'with' | 'without'>('all');


  const subscriptionInactive = !subscription?.is_active;

  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) {
      setShowSubModal(true);
      return;
    }
    action();
  }

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);
    setError(null);

    // 1) memberships + plan + categories (via membership_plan_categories)
    const { data, error } = await supabase
      .from('memberships')
      .select(`
        id, tenant_id, user_id, plan_id, starts_at, ends_at, status, created_at,
        remaining_sessions, plan_kind, plan_name, plan_price,
        custom_price, discount_reason,
        days_remaining, debt,
        membership_plans (
          membership_plan_categories (
            class_categories ( id, name, color )
          )
        )
      `)
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false });

    if (error) {
      setError(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    // 2) Load member profiles for names
    const { data: members, error: mErr } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('tenant_id', profile.tenant_id)
      .eq('role', 'member');

    if (mErr) {
      console.error('load members error', mErr);
    }

    const memberMap = new Map<string, Member>();
    (members as any[] | null)?.forEach((m) => {
      memberMap.set(m.id, { id: m.id, full_name: m.full_name });
    });

    // 3) Normalize rows: attach profile + ALL categories from the plan
    const normalized: MembershipRow[] = (data as any[]).map((r) => {
      const plan = r.membership_plans;

      let cats: PlanCategory[] = [];
      if (plan && Array.isArray(plan.membership_plan_categories)) {
        const links = plan.membership_plan_categories as any[];
        cats = links
          .map((link) => link.class_categories)
          .filter((c: any) => !!c)
          .map((c: any) => ({
            id: c.id as string,
            name: c.name as string,
            color: c.color ?? null,
          }));
      }

      const member = memberMap.get(r.user_id) ?? null;

      return {
        ...r,
        profile: member,
        plan_categories: cats,
      } as MembershipRow;
    });

    setRows(normalized);
    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id]);

  // options για τα dropdowns
  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      (r.plan_categories ?? []).forEach((cat) => {
        if (cat.id) {
          map.set(cat.id, cat.name);
        }
      });
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const planOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach(r => {
      if (r.plan_id && r.plan_name) {
        map.set(r.plan_id, r.plan_name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    let list = [...rows];

    // search
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter(r =>
        (r.profile?.full_name ?? '').toLowerCase().includes(needle) ||
        (r.plan_name ?? '').toLowerCase().includes(needle) ||
        (r.plan_categories ?? []).some((c) =>
          (c.name ?? '').toLowerCase().includes(needle),
        ) ||
        (r.status ?? '').toLowerCase().includes(needle)
      );
    }

    // by category
    if (filterCategory) {
      list = list.filter((r) =>
        (r.plan_categories ?? []).some((c) => c.id === filterCategory),
      );
    }

    // by plan
    if (filterPlan) {
      list = list.filter(r => r.plan_id === filterPlan);
    }

    // by status
    if (filterStatus) {
      list = list.filter(r => (r.status ?? 'active') === filterStatus);
    }

    // by debt
    if (filterDebt === 'with') {
      list = list.filter(r => (r.debt ?? 0) > 0);
    } else if (filterDebt === 'without') {
      list = list.filter(r => !r.debt || r.debt === 0);
    }

    return list;
  }, [rows, q, filterCategory, filterPlan, filterStatus, filterDebt]);

  // reset σελίδας όταν αλλάζει κάτι στα φίλτρα
  useEffect(() => {
    setPage(1);
  }, [q, pageSize, filterCategory, filterPlan, filterStatus, filterDebt]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const startIdx = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(filtered.length, page * pageSize);

  return (
    <div className="p-4 md:p-6">
      {/* search + filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          className="h-9 w-full sm:w-64 rounded-md border border-white/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
          placeholder="Αναζήτηση συνδρομών…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select
          className="h-9 w-full sm:w-auto rounded-md border border-white/10 bg-secondary-background px-2 text-sm"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="">Όλες οι κατηγορίες</option>
          {categoryOptions.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          className="h-9 w-full sm:w-auto rounded-md border border-white/10 bg-secondary-background px-2 text-sm"
          value={filterPlan}
          onChange={(e) => setFilterPlan(e.target.value)}
        >
          <option value="">Όλα τα πλάνα</option>
          {planOptions.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select
          className="h-9 w-full sm:w-auto rounded-md border border-white/10 bg-secondary-background px-2 text-sm"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">Όλες οι καταστάσεις</option>
          <option value="active">ενεργή</option>
          <option value="paused">σε παύση</option>
          <option value="cancelled">ακυρωμένη</option>
          <option value="expired">έληξε</option>
        </select>

        <select
          className="h-9 w-full sm:w-auto rounded-md border border-white/10 bg-secondary-background px-2 text-sm"
          value={filterDebt}
          onChange={(e) => setFilterDebt(e.target.value as any)}
        >
          <option value="all">Όλες (οφειλή / μη)</option>
          <option value="with">Μόνο με οφειλή</option>
          <option value="without">Μόνο εξοφλημένες</option>
        </select>

        <button
          className="h-9 w-full sm:w-auto rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white sm:ml-auto"
          onClick={() => requireActiveSubscription(() => setShowCreate(true))}
        >
          Νέα Συνδρομή
        </button>
      </div>

      {error && (
        <div className="mb-4 text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">
          {error}
        </div>
      )}

      <div className="rounded-md border border-white/10 overflow-hidden">
        {/* Loading / empty */}
        {loading && (
          <div className="px-3 py-4 text-sm opacity-60">Loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="px-3 py-4 text-sm opacity-60">Καμία Συνδρομή</div>
        )}

        {/* Content when we have rows */}
        {!loading && filtered.length > 0 && (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/10">
              {paginated.map((m) => {
                const basePrice = m.plan_price ?? null;
                const effectivePrice =
                  m.custom_price != null
                    ? m.custom_price
                    : basePrice != null
                      ? basePrice
                      : null;

                const { label: statusLabel, className: statusClass } =
                  getStatusDisplay(m.status);

                return (
                  <div key={m.id} className="p-3 bg-secondary-background/60">
                    {/* Top: member + status */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">
                          {m.profile?.full_name ?? m.user_id}
                        </div>
                        <div className="mt-1 text-[12px] text-text-secondary">
                          {m.plan_name ?? 'Χωρίς πλάνο'}
                        </div>
                      </div>
                      <span
                        className={
                          'inline-flex items-center px-2 py-0.5 text-[11px] rounded-full font-medium ' +
                          statusClass
                        }
                      >
                        {statusLabel}
                      </span>
                    </div>

                    {/* Price */}
                    <div className="mt-2 text-[12px]">
                      {effectivePrice == null ? (
                        <span className="text-text-secondary">Τιμή: —</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">
                            Τιμή: {formatMoney(effectivePrice)}
                          </span>
                          {basePrice != null &&
                            m.custom_price != null &&
                            m.custom_price !== basePrice && (
                              <span className="text-[11px] text-amber-300">
                                κανονική: {formatMoney(basePrice)}
                              </span>
                            )}
                        </div>
                      )}
                    </div>

                    {/* Categories */}
                    <div className="mt-2">
                      {m.plan_categories && m.plan_categories.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {m.plan_categories.map((cat) => (
                            <span
                              key={cat.id}
                              className="inline-flex items-center gap-2 text-[11px] px-2 py-1 rounded-full bg-white/5"
                            >
                              {cat.color && (
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full border border-white/20"
                                  style={{ backgroundColor: cat.color }}
                                />
                              )}
                              <span>{cat.name}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-text-secondary">
                          Χωρίς κατηγορία
                        </span>
                      )}
                    </div>

                    {/* Dates & remaining */}
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-text-secondary">
                      <div className="flex flex-col gap-0.5">
                        <span>Έναρξη</span>
                        <span className="text-text-primary">
                          {formatDateDMY(m.starts_at)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span>Λήξη</span>
                        <span className="text-text-primary">
                          {formatDateDMY(m.ends_at)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span>Μέρες υπολοίπου</span>
                        <span className="text-text-primary">
                          {m.days_remaining ?? '—'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span>Υπολ. συνεδριών</span>
                        <span className="text-text-primary">
                          {m.remaining_sessions ?? '—'}
                        </span>
                      </div>
                    </div>

                    {/* Debt */}
                    <div className="mt-2 text-[11px]">
                      {m.debt != null && m.debt !== 0 ? (
                        <span className="text-amber-300 font-medium">
                          Οφειλή: {formatMoney(m.debt)}
                        </span>
                      ) : (
                        <span className="text-emerald-300 uppercase tracking-wide">
                          Εξοφλημένη
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-3 flex justify-end gap-2">
                      <IconButton
                        icon={Pencil}
                        label="Επεξεργασία πλάνου"
                        onClick={() => requireActiveSubscription(() => setEditRow(m))}
                      />
                      <DeleteButton id={m.id} onDeleted={load}
                        guard={() => {
                          if (subscriptionInactive) {
                            setShowSubModal(true);
                            return false;
                          }
                          return true;
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary-background/60">
                  <tr className="text-left">
                    <Th>Μέλος</Th>
                    <Th>Πλάνο</Th>
                    <Th>Τιμή</Th>
                    <Th>Κατηγορία</Th>
                    <Th>Έναρξη</Th>
                    <Th>Λήξη</Th>
                    <Th>Μέρες Υπολοίπου</Th>
                    <Th>Υπολ. Συνεδριών</Th>
                    <Th>Οφειλή</Th>
                    <Th>Κατάσταση</Th>
                    <Th className="text-right pr-3">Ενέργειες</Th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(m => {
                    const basePrice = m.plan_price ?? null;
                    const effectivePrice =
                      m.custom_price != null
                        ? m.custom_price
                        : basePrice != null
                          ? basePrice
                          : null;

                    return (
                      <tr
                        key={m.id}
                        className="border-t border-white/10 hover:bg-secondary/10"
                      >
                        <Td>{m.profile?.full_name ?? m.user_id}</Td>
                        <Td>{m.plan_name ?? '—'}</Td>

                        {/* Τιμή με τυχόν έκπτωση */}
                        <Td>
                          {effectivePrice == null ? (
                            <span className="text-xs text-text-secondary">—</span>
                          ) : (
                            <div className="flex flex-col text-xs">
                              <span className="font-medium">
                                {formatMoney(effectivePrice)}
                              </span>
                              {basePrice != null &&
                                m.custom_price != null &&
                                m.custom_price !== basePrice && (
                                  <span className="text-[11px] text-amber-300">
                                    κανονική: {formatMoney(basePrice)}
                                  </span>
                                )}
                            </div>
                          )}
                        </Td>

                        <Td>
                          {m.plan_categories && m.plan_categories.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {m.plan_categories.map((cat) => (
                                <span
                                  key={cat.id}
                                  className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-white/5"
                                >
                                  {cat.color && (
                                    <span
                                      className="inline-block h-2.5 w-2.5 rounded-full border border-white/20"
                                      style={{ backgroundColor: cat.color }}
                                    />
                                  )}
                                  <span>{cat.name}</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-text-secondary">—</span>
                          )}
                        </Td>

                        <Td>{formatDateDMY(m.starts_at)}</Td>
                        <Td>{formatDateDMY(m.ends_at)}</Td>
                        <Td>{m.days_remaining ?? '—'}</Td>
                        <Td>{m.remaining_sessions ?? '—'}</Td>
                        <Td>
                          {m.debt != null && m.debt !== 0
                            ? (
                              <span className="text-amber-300 font-medium">
                                {formatMoney(m.debt)}
                              </span>
                            ) : (
                              <span className="text-emerald-300 text-xs uppercase tracking-wide">
                                Εξοφλημένη
                              </span>
                            )}
                        </Td>
                        <Td>
                          {(() => {
                            const { label, className } = getStatusDisplay(m.status);
                            return (
                              <span
                                className={
                                  'inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium ' +
                                  className
                                }
                              >
                                {label}
                              </span>
                            );
                          })()}
                        </Td>

                        <Td className="text-right space-x-1 pr-3">
                          <IconButton
                            icon={Pencil}
                            label="Επεξεργασία πλάνου"
                            onClick={() => requireActiveSubscription(() => setEditRow(m))}
                          />
                          <DeleteButton id={m.id} onDeleted={load}
                            guard={() => {
                              if (subscriptionInactive) {
                                setShowSubModal(true);
                                return false;
                              }
                              return true;
                            }}
                          />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 py-2 text-xs text-text-secondary border-t border-white/10">
              <div>
                Εμφάνιση <span className="font-semibold">{startIdx}</span>
                {filtered.length > 0 && (
                  <>
                    –<span className="font-semibold">{endIdx}</span>
                  </>
                )}{' '}
                από <span className="font-semibold">{filtered.length}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <span>Γραμμές ανά Σελίδα:</span>
                  <select
                    className="bg-transparent border border-white/10 rounded px-1 py-0.5"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="px-2 py-1 rounded border border-white/10 disabled:opacity-40"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Προηγ.
                  </button>
                  <span>
                    Σελίδα <span className="font-semibold">{page}</span> από{' '}
                    <span className="font-semibold">{pageCount}</span>
                  </span>
                  <button
                    className="px-2 py-1 rounded border border-white/10 disabled:opacity-40"
                    onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                    disabled={page === pageCount}
                  >
                    Επόμενο
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <CreateMembershipModal
          tenantId={profile?.tenant_id!}
          onClose={() => { setShowCreate(false); load(); }}
        />
      )}
      {editRow && (
        <EditMembershipModal
          row={editRow}
          onClose={() => { setEditRow(null); load(); }}
        />
      )}

      <SubscriptionRequiredModal
        open={showSubModal}
        onClose={() => setShowSubModal(false)}
      />
    </div>
  );
}

/* small helpers */

function Th({ children, className = '' }: any) {
  return <th className={`px-3 py-2 font-semibold ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: any) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}

function formatDateDMY(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}


function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 hover:bg-secondary/20 disabled:opacity-50"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
      <span className="sr-only">{label}</span>
    </button>
  );
}

/* Delete button stays ίδιο */
function DeleteButton({ id, onDeleted, guard }: { id: string; onDeleted: () => void; guard: () => boolean; }) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
     if (guard && !guard()) return;
    if (!confirm('Ειστε σίγουρος για τη διαγραφή συνδρομής;')) return;
    setBusy(true);
    const res = await supabase.functions.invoke('membership-delete', { body: { id } });
    setBusy(false);
    if (res.error || (res.data as any)?.error) {
      alert(res.error?.message ?? (res.data as any)?.error ?? 'Delete failed');
    } else {
      onDeleted();
    }
  };

  return (
    <button
      type="button"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/60 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
      onClick={onClick}
      disabled={busy}
      aria-label="Διαγραφή πλάνου"
      title="Διαγραφή πλάνου"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
      <span className="sr-only">Διαγραφή</span>
    </button>
  );
}

function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-md border border-white/10 bg-secondary-background text-text-primary shadow-xl">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="rounded px-2 py-1 hover:bg-white/5">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
function FormRow({ label, children }: any) {
  return (
    <label className="block mb-3">
      <div className="mb-1 text-sm opacity-80">{label}</div>
      {children}
    </label>
  );
}
function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(n);
}

function getStatusDisplay(status?: string | null) {
  const s = (status ?? 'active').toLowerCase();

  switch (s) {
    case 'active':
      return {
        label: 'Ενεργή',
        className: 'text-emerald-300 bg-emerald-500/10',
      };
    case 'paused':
      return {
        label: 'Σε παύση',
        className: 'text-amber-300 bg-amber-500/10',
      };
    case 'cancelled':
      return {
        label: 'Ακυρωμένη',
        className: 'text-rose-300 bg-rose-500/10',
      };
    case 'expired':
      return {
        label: 'Έληξε',
        className: 'text-slate-300 bg-slate-500/10',
      };
    default:
      return {
        label: 'Άγνωστη',
        className: 'text-slate-300 bg-slate-500/10',
      };
  }
}

/* ── Create ───────────────────────────────────────────────────────────── */
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale/el';

/* ...rest of your imports... */

function CreateMembershipModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [userId, setUserId] = useState('');
  const [planId, setPlanId] = useState('');

  const [startsAt, setStartsAt] = useState<Date | null>(new Date()); // ✅ DatePicker
  const [debt, setDebt] = useState<number>(0);
  const [customPrice, setCustomPrice] = useState<number | null>(null);
  const [discountReason, setDiscountReason] = useState<string>('');
  const [busy, setBusy] = useState(false);

  // 🔍 MEMBER dropdown state
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const memberDropdownRef = useRef<HTMLDivElement | null>(null);

  // 🔍 PLAN dropdown state
  const [planDropdownOpen, setPlanDropdownOpen] = useState(false);
  const [planSearch, setPlanSearch] = useState('');
  const planDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data: m } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('tenant_id', tenantId)
        .eq('role', 'member')
        .order('full_name', { ascending: true });

      setMembers((m as any[]) ?? []);

      const { data: p } = await supabase
        .from('membership_plans')
        .select('id, name, plan_kind, duration_days, session_credits, price')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      setPlans((p as any[]) ?? []);
    })();
  }, [tenantId]);

  // 🔒 close member dropdown on outside click
  useEffect(() => {
    if (!memberDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (!memberDropdownRef.current) return;
      if (!memberDropdownRef.current.contains(e.target as Node)) {
        setMemberDropdownOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [memberDropdownOpen]);

  // 🔒 close plan dropdown on outside click
  useEffect(() => {
    if (!planDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (!planDropdownRef.current) return;
      if (!planDropdownRef.current.contains(e.target as Node)) {
        setPlanDropdownOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [planDropdownOpen]);

  // FILTERED MEMBERS
  const filteredMembers = useMemo(() => {
    const needle = memberSearch.toLowerCase();
    if (!needle) return members;
    return members.filter((m) => {
      const name = (m.full_name ?? '').toLowerCase();
      const id = m.id.toLowerCase();
      const email = (m.email ?? '').toLowerCase();
      return name.includes(needle) || id.includes(needle) || email.includes(needle);
    });
  }, [members, memberSearch]);

  const selectedMember = members.find((m) => m.id === userId);

  // FILTERED PLANS
  const filteredPlans = useMemo(() => {
    const needle = planSearch.toLowerCase();
    if (!needle) return plans;

    return plans.filter((p) => {
      const name = p.name.toLowerCase();
      const descParts: string[] = [];
      if (p.duration_days) descParts.push(`${p.duration_days} μέρες`);
      if (p.session_credits) descParts.push(`${p.session_credits} συνεδρίες`);
      if (p.price != null) descParts.push(`${p.price}€`);
      const desc = descParts.join(' · ').toLowerCase();

      return name.includes(needle) || desc.includes(needle);
    });
  }, [plans, planSearch]);

  const selectedPlan = useMemo(() => plans.find((p) => p.id === planId) ?? null, [plans, planId]);

  const basePrice = selectedPlan?.price ?? null;
  const effectivePrice = customPrice != null ? customPrice : basePrice != null ? basePrice : null;

  const discount =
    basePrice != null && effectivePrice != null ? basePrice - effectivePrice : null;

  const planLabel = (p: Plan) => {
    const parts: string[] = [];
    if (p.duration_days) parts.push(`${p.duration_days} μέρες`);
    if (p.session_credits) parts.push(`${p.session_credits} συνεδρίες`);
    if (p.price != null) parts.push(formatMoney(p.price));
    return `${p.name}${parts.length ? ' · ' + parts.join(' • ') : ''}`;
  };

  const submit = async () => {
    if (!userId || !planId) return;
    setBusy(true);
    const res = await supabase.functions.invoke('membership-create', {
      body: {
        tenant_id: tenantId,
        user_id: userId,
        plan_id: planId,
        starts_at: startsAt ? dateToISODate(startsAt) : null, // ✅ same payload format
        debt: Number.isFinite(debt) ? debt : 0,
        custom_price: customPrice,
        discount_reason: discountReason || null,
      },
    });
    setBusy(false);
    if (res.error || (res.data as any)?.error) {
      alert(res.error?.message ?? (res.data as any)?.error ?? 'Create failed');
      return;
    }
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Νέα Συνδρομή">
      {/* 🔍 Searchable MEMBER dropdown */}
      <FormRow label="Μέλος *">
        <div ref={memberDropdownRef} className="relative">
          <button
            type="button"
            className="input flex items-center justify-between"
            onClick={() => setMemberDropdownOpen((v) => !v)}
          >
            <span>
              {selectedMember
                ? selectedMember.full_name ?? selectedMember.id
                : '— επιλογή μέλους —'}
            </span>
            <span className="ml-2 text-xs opacity-70">
              {memberDropdownOpen ? '▲' : '▼'}
            </span>
          </button>

          {memberDropdownOpen && (
            <div className="absolute z-50 mt-1 w-full rounded-md border border-white/15 bg-secondary-background shadow-lg">
              <div className="p-2 border-b border-white/10">
                <input
                  autoFocus
                  className="input h-9! text-sm!"
                  placeholder="Αναζήτηση μέλους (όνομα, email)…"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>
              <div className="max-h-60 overflow-y-auto">
                {filteredMembers.length === 0 && (
                  <div className="px-3 py-2 text-xs text-text-secondary">
                    Δεν βρέθηκαν μέλη
                  </div>
                )}
                {filteredMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-white/5 ${m.id === userId ? 'bg-white/10' : ''
                      }`}
                    onClick={() => {
                      setUserId(m.id);
                      setMemberDropdownOpen(false);
                    }}
                  >
                    <div className="flex flex-col">
                      <span>{m.full_name ?? m.id}</span>
                      {m.email && (
                        <span className="text-[11px] text-text-secondary">
                          {m.email}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </FormRow>

      {/* 🔍 Searchable PLAN dropdown */}
      <FormRow label="Πλάνο *">
        <div ref={planDropdownRef} className="relative">
          <button
            type="button"
            className="input flex items-center justify-between"
            onClick={() => setPlanDropdownOpen((v) => !v)}
          >
            <span>{selectedPlan ? planLabel(selectedPlan) : '— επιλογή πλάνου —'}</span>
            <span className="ml-2 text-xs opacity-70">
              {planDropdownOpen ? '▲' : '▼'}
            </span>
          </button>

          {planDropdownOpen && (
            <div className="absolute z-50 mt-1 w-full rounded-md border border-white/15 bg-secondary-background shadow-lg">
              <div className="p-2 border-b border-white/10">
                <input
                  autoFocus
                  className="input h-9! text-sm!"
                  placeholder="Αναζήτηση πλάνου…"
                  value={planSearch}
                  onChange={(e) => setPlanSearch(e.target.value)}
                />
              </div>
              <div className="max-h-60 overflow-y-auto">
                {filteredPlans.length === 0 && (
                  <div className="px-3 py-2 text-xs text-text-secondary">
                    Δεν βρέθηκαν πλάνα
                  </div>
                )}
                {filteredPlans.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-white/5 ${p.id === planId ? 'bg-white/10' : ''
                      }`}
                    onClick={() => {
                      setPlanId(p.id);
                      setPlanDropdownOpen(false);
                    }}
                  >
                    {planLabel(p)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </FormRow>

      {basePrice != null && (
        <FormRow label="Τελική τιμή για αυτό το μέλος (€)">
          <div className="flex flex-col gap-1 text-sm">
            <input
              className="input max-w-40"
              type="number"
              min={0}
              step="0.50"
              value={customPrice ?? ''}
              placeholder={basePrice.toString()}
              onChange={(e) =>
                setCustomPrice(e.target.value === '' ? null : Number(e.target.value))
              }
            />
            <div className="text-xs text-text-secondary">
              Κανονική τιμή πλάνου: {formatMoney(basePrice)}
              {effectivePrice != null && discount != null && discount !== 0 && (
                <>
                  {' · Τελική: '}
                  <span className="text-emerald-300">{formatMoney(effectivePrice)}</span>
                  {' · Έκπτωση: '}
                  <span className="text-amber-300">{formatMoney(discount)}</span>
                </>
              )}
            </div>
          </div>
        </FormRow>
      )}

      <FormRow label="Λόγος έκπτωσης (προαιρετικό)">
        <input
          className="input"
          value={discountReason}
          onChange={(e) => setDiscountReason(e.target.value)}
          placeholder="π.χ. φίλος, παλιό μέλος, προσφορά κλπ."
        />
      </FormRow>

      {/* ✅ DatePicker for startsAt */}
      <FormRow label="Έναρξη">
        <DatePicker
          selected={startsAt}
          onChange={(d) => setStartsAt(d)}
          dateFormat="dd/MM/yyyy"
          locale={el}
          placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
          className="input"
          wrapperClassName="w-full"
          showMonthDropdown
          showYearDropdown
          dropdownMode="select"
          scrollableYearDropdown
          yearDropdownItemNumber={80}
        />
      </FormRow>

      <FormRow label="Οφειλή (€)">
        <input
          className="input"
          type="number"
          step="0.01"
          value={debt}
          onChange={(e) => setDebt(Number(e.target.value))}
        />
      </FormRow>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Κλείσιμο
        </button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Δημιουργία...' : 'Δημιουργία'}
        </button>
      </div>
    </Modal>
  );
}

/* ── Edit ─────────────────────────────────────────────────────────────── */
function EditMembershipModal({ row, onClose }: { row: MembershipRow; onClose: () => void }) {
  const [status, setStatus] = useState(row.status ?? 'active');

  const [startsAt, setStartsAt] = useState<Date | null>(
    row.starts_at ? new Date(row.starts_at) : null,
  );
  const [endsAt, setEndsAt] = useState<Date | null>(
    row.ends_at ? new Date(row.ends_at) : null,
  );

  const [remaining, setRemaining] = useState<number>(row.remaining_sessions ?? 0);
  const [planId, setPlanId] = useState<string>(row.plan_id ?? '');
  const [debt, setDebt] = useState<number>(row.debt ?? 0);
  const [customPrice, setCustomPrice] = useState<number | null>(row.custom_price ?? null);
  const [discountReason, setDiscountReason] = useState<string>(row.discount_reason ?? '');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase
        .from('membership_plans')
        .select('id, name, plan_kind, duration_days, session_credits, price')
        .eq('tenant_id', row.tenant_id)
        .order('created_at', { ascending: false });
      setPlans((p as any[]) ?? []);
    })();
  }, [row.tenant_id]);

  const selectedPlan = useMemo(() => plans.find((p) => p.id === planId) ?? null, [plans, planId]);

  const basePrice = selectedPlan?.price != null ? selectedPlan.price : row.plan_price ?? null;

  const effectivePrice = customPrice != null ? customPrice : basePrice != null ? basePrice : null;

  const discount =
    basePrice != null && effectivePrice != null ? basePrice - effectivePrice : null;

  const submit = async () => {
    setBusy(true);
    const res = await supabase.functions.invoke('membership-update', {
      body: {
        id: row.id,
        status,
        starts_at: startsAt ? dateToISODate(startsAt) : null,
        ends_at: endsAt ? dateToISODate(endsAt) : null,
        remaining_sessions: Number.isFinite(remaining) ? remaining : null,
        plan_id: planId || null, // server will resnapshot if plan changes
        debt: Number.isFinite(debt) ? debt : null,
        custom_price: customPrice,
        discount_reason: discountReason || null,
      },
    });
    setBusy(false);
    if (res.error || (res.data as any)?.error) {
      alert(res.error?.message ?? (res.data as any)?.error ?? 'Save failed');
      return;
    }
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Επεξεργασία Συνδρομής">
      <FormRow label="Πλάνο">
        <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">(διατηρήστε την τρέχουσα)</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {[p.duration_days ? `${p.duration_days}μ` : null, p.session_credits ? `${p.session_credits} υπόλοιπο` : null]
                .filter(Boolean)
                .join(' • ')}
            </option>
          ))}
        </select>
      </FormRow>

      {basePrice != null && (
        <FormRow label="Τελική τιμή για αυτό το μέλος (€)">
          <div className="flex flex-col gap-1 text-sm">
            <input
              className="input max-w-40"
              type="number"
              min={0}
              step="0.50"
              value={customPrice ?? ''}
              placeholder={basePrice.toString()}
              onChange={(e) => setCustomPrice(e.target.value === '' ? null : Number(e.target.value))}
            />
            <div className="text-xs text-text-secondary">
              Κανονική τιμή πλάνου: {formatMoney(basePrice)}
              {effectivePrice != null && discount != null && discount !== 0 && (
                <>
                  {' · Τελική: '}
                  <span className="text-emerald-300">{formatMoney(effectivePrice)}</span>
                  {' · Έκπτωση: '}
                  <span className="text-amber-300">{formatMoney(discount)}</span>
                </>
              )}
            </div>
          </div>
        </FormRow>
      )}

      <FormRow label="Λόγος έκπτωσης (προαιρετικό)">
        <input
          className="input"
          value={discountReason}
          onChange={(e) => setDiscountReason(e.target.value)}
          placeholder="π.χ. φίλος, παλιό μέλος, προσφορά κλπ."
        />
      </FormRow>

      <FormRow label="Κατάσταση">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">ενεργή</option>
          <option value="paused">σε παύση</option>
          <option value="cancelled">ακυρωμένη</option>
          <option value="expired">έληξε</option>
        </select>
      </FormRow>

      {/* ✅ DatePickers for startsAt/endsAt */}
      <FormRow label="Έναρξη">
        <DatePicker
          selected={startsAt}
          onChange={(d) => setStartsAt(d)}
          dateFormat="dd/MM/yyyy"
          locale={el}
          placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
          className="input"
          wrapperClassName="w-full"
          showMonthDropdown
          showYearDropdown
          dropdownMode="select"
          scrollableYearDropdown
          yearDropdownItemNumber={80}
          maxDate={endsAt ?? undefined}
        />
      </FormRow>

      <FormRow label="Λήξη">
        <DatePicker
          selected={endsAt}
          onChange={(d) => setEndsAt(d)}
          dateFormat="dd/MM/yyyy"
          locale={el}
          placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
          className="input"
          wrapperClassName="w-full"
          showMonthDropdown
          showYearDropdown
          dropdownMode="select"
          scrollableYearDropdown
          yearDropdownItemNumber={80}
          minDate={startsAt ?? undefined}
        />
      </FormRow>

      <FormRow label="Υπολοιπόμενες συνεδρίες">
        <input
          className="input"
          type="number"
          min={0}
          value={remaining}
          onChange={(e) => setRemaining(Number(e.target.value))}
        />
      </FormRow>

      <FormRow label="Οφειλή (€)">
        <input
          className="input"
          type="number"
          step="0.01"
          value={debt}
          onChange={(e) => setDebt(Number(e.target.value))}
        />
      </FormRow>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Κλείσιμο
        </button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Αποθήκευση...' : 'Αποθήκευση'}
        </button>
      </div>
    </Modal>
  );
}

function dateToISODate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
