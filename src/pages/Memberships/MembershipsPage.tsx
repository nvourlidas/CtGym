import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';

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
  plan_price: number | null;// snapshot
  days_remaining: number | null;
  debt: number | null;
  plan_category?: PlanCategory | null; // κατηγορία πλάνου
  profile?: Member | null;            // joined για εμφάνιση
};

export default function MembershipsPage() {
  const { profile } = useAuth();
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

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);
    setError(null);

    // Join μέλος + κατηγορία πλάνου
    const { data, error } = await supabase
      .from('memberships')
      .select(`
        id, tenant_id, user_id, plan_id, starts_at, ends_at, status, created_at,
        remaining_sessions, plan_kind, plan_name, plan_price,
        days_remaining, debt,
        profiles!inner(id, full_name),
        membership_plans(
          class_categories(id, name, color)
        )
      `)
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false });

    if (error) {
      // fallback χωρίς joins
      const { data: bare, error: e2 } = await supabase
        .from('memberships')
        .select(
          'id, tenant_id, user_id, plan_id, starts_at, ends_at, status, created_at,' +
          'remaining_sessions, plan_kind, plan_name, plan_price, days_remaining, debt'
        )
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false });

      if (e2) setError(e2.message);
      setRows(
        (bare as any[] | null)?.map(r => ({
          ...r,
          profile: null,
          plan_category: null,
        })) ?? []
      );
    } else {
      const withName = (data as any[]).map(r => {
        const mp = r.membership_plans;
        const cat: PlanCategory | null =
          mp && mp.class_categories
            ? {
              id: mp.class_categories.id as string,
              name: mp.class_categories.name as string,
              color: mp.class_categories.color ?? null,
            }
            : null;

        return {
          ...r,
          profile: r.profiles
            ? { id: r.profiles.id, full_name: r.profiles.full_name }
            : null,
          plan_category: cat,
        } as MembershipRow;
      });
      setRows(withName);
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id]);

  // options για τα dropdowns
  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach(r => {
      if (r.plan_category?.id) {
        map.set(r.plan_category.id, r.plan_category.name);
      }
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
        (r.plan_category?.name ?? '').toLowerCase().includes(needle) ||
        (r.status ?? '').toLowerCase().includes(needle)
      );
    }

    // by category
    if (filterCategory) {
      list = list.filter(r => r.plan_category?.id === filterCategory);
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
    <div className="p-6">
      {/* search + filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
          placeholder="Αναζήτηση συνδρομών…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-2 text-sm"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="">Όλες οι κατηγορίες</option>
          {categoryOptions.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-2 text-sm"
          value={filterPlan}
          onChange={(e) => setFilterPlan(e.target.value)}
        >
          <option value="">Όλα τα πλάνα</option>
          {planOptions.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-2 text-sm"
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
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-2 text-sm"
          value={filterDebt}
          onChange={(e) => setFilterDebt(e.target.value as any)}
        >
          <option value="all">Όλες (οφειλή / μη)</option>
          <option value="with">Μόνο με οφειλή</option>
          <option value="without">Μόνο εξοφλημένες</option>
        </select>

        <button
          className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white ml-auto"
          onClick={() => setShowCreate(true)}
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
        <table className="w-full text-sm">
          <thead className="bg-secondary-background/60">
            <tr className="text-left">
              <Th>Μέλος</Th>
              <Th>Πλάνο</Th>
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
            {loading && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={10}>Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={10}>Καμία Συνδρομή</td></tr>
            )}
            {!loading && filtered.length > 0 && paginated.map(m => (
              <tr key={m.id} className="border-t border-white/10 hover:bg-secondary/10">
                <Td>{m.profile?.full_name ?? m.user_id}</Td>
                <Td>{m.plan_name ?? '—'}</Td>
                <Td>
                  {m.plan_category ? (
                    <span className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-white/5">
                      {m.plan_category.color && (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full border border-white/20"
                          style={{ backgroundColor: m.plan_category.color }}
                        />
                      )}
                      <span>{m.plan_category.name}</span>
                    </span>
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
                    ? <span className="text-amber-300 font-medium">{formatMoney(m.debt)}</span>
                    : <span className="text-emerald-300 text-xs uppercase tracking-wide">Εξοφλημένη</span>}
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

                <Td className="text-right">
                  <button
                    className="px-2 py-1 text-sm rounded hover:bg-secondary/10"
                    onClick={() => setEditRow(m)}
                  >
                    Επεξεργασία
                  </button>
                  <DeleteButton id={m.id} onDeleted={load} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination footer */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-3 py-2 text-xs text-text-secondary border-t border-white/10">
            <div>
              Εμφάνιση <span className="font-semibold">{startIdx}</span>
              {filtered.length > 0 && <>–<span className="font-semibold">{endIdx}</span></>} από{' '}
              <span className="font-semibold">{filtered.length}</span>
            </div>
            <div className="flex items-center gap-3">
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
                  Σελίδα <span className="font-semibold">{page}</span> of{' '}
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

/* Delete button stays ίδιο */
function DeleteButton({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
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
      className="ml-2 px-2 py-1 text-sm rounded text-danger hover:bg-danger/10 disabled:opacity-50"
      onClick={onClick}
      disabled={busy}
    >
      {busy ? 'Διαγραφή...' : 'Διαγραφή'}
    </button>
  );
}

/* ── Create / Edit modals παραμένουν όπως πριν ──
   (δεν χρειάζεται αλλαγή για την μορφή ημερομηνίας, γιατί τα <input type="date">
   δουλεύουν με yyyy-mm-dd). 
   Κράτα τα όπως τα έχεις ήδη στο project σου.
*/

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
function CreateMembershipModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [userId, setUserId] = useState('');
  const [planId, setPlanId] = useState('');
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 10)); // yyyy-mm-dd
  const [debt, setDebt] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: m } = await supabase
        .from('profiles')
        .select('id, full_name')
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

  const submit = async () => {
    if (!userId || !planId) return;
    setBusy(true);
    const res = await supabase.functions.invoke('membership-create', {
      body: {
        tenant_id: tenantId,
        user_id: userId,
        plan_id: planId,
        starts_at: startsAt,
        debt: Number.isFinite(debt) ? debt : 0,
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
      <FormRow label="Μέλος *">
        <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">— επιλογή μέλους —</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.full_name ?? m.id}</option>)}
        </select>
      </FormRow>
      <FormRow label="Πλάνο *">
        <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">— επιλογή πλάνου —</option>
          {plans.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} · {[
                p.duration_days ? `${p.duration_days}μ` : null,
                p.session_credits ? `${p.session_credits} υπόλοιπο` : null,
              ].filter(Boolean).join(' • ')} {p.price != null ? `· ${formatMoney(p.price)}` : ''}
            </option>
          ))}
        </select>
      </FormRow>
      <FormRow label="Έναρξη">
        <input
          className="input"
          type="date"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
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
        <button className="btn-secondary" onClick={onClose}>Κλείσιμο</button>
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
  const [startsAt, setStartsAt] = useState(row.starts_at?.slice(0, 10) ?? '');
  const [endsAt, setEndsAt] = useState(row.ends_at?.slice(0, 10) ?? '');
  const [remaining, setRemaining] = useState<number>(row.remaining_sessions ?? 0);
  const [planId, setPlanId] = useState<string>(row.plan_id ?? '');
  const [debt, setDebt] = useState<number>(row.debt ?? 0);
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

  const submit = async () => {
    setBusy(true);
    const res = await supabase.functions.invoke('membership-update', {
      body: {
        id: row.id,
        status,
        starts_at: startsAt || null,
        ends_at: endsAt || null,
        remaining_sessions: Number.isFinite(remaining) ? remaining : null,
        plan_id: planId || null, // server will resnapshot if plan changes
        debt: Number.isFinite(debt) ? debt : null,
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
          {plans.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} · {[
                p.duration_days ? `${p.duration_days}μ` : null,
                p.session_credits ? `${p.session_credits} υπόλοιπο` : null,
              ].filter(Boolean).join(' • ')}
            </option>
          ))}
        </select>
      </FormRow>
      <FormRow label="Κατάσταση">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">ενεργή</option>
          <option value="paused">σε παύση</option>
          <option value="cancelled">ακυρωμένη</option>
          <option value="expired">έληξε</option>
        </select>
      </FormRow>
      <FormRow label="Έναρξη">
        <input
          className="input"
          type="date"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
      </FormRow>
      <FormRow label="Λήξη">
        <input
          className="input"
          type="date"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
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
        <button className="btn-secondary" onClick={onClose}>Κλείσιμο</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Αποθήκευση...' : 'Αποθήκευση'}
        </button>
      </div>
    </Modal>
  );
}

