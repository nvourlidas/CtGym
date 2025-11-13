import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';

type PlanKind = 'duration' | 'sessions' | 'hybrid';

type Plan = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  price: number | null;           // if you store cents, adjust formatMoney()
  plan_kind: PlanKind;
  duration_days: number | null;   // days of access
  session_credits: number | null; // number of sessions
  created_at: string;
};

export default function Plans() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  // NEW: pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('membership_plans')
      .select('id, tenant_id, name, description, price, plan_kind, duration_days, session_credits, created_at')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    setRows((data as Plan[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter(r =>
      (r.name ?? '').toLowerCase().includes(needle) ||
      (r.description ?? '').toLowerCase().includes(needle)
    );
  }, [rows, q]);

  // Reset page when search or page size changes
  useEffect(() => {
    setPage(1);
  }, [q, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const startIdx = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(filtered.length, page * pageSize);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <input
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
          placeholder="Αναζήτηση Πλάνων…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white"
          onClick={() => setShowCreate(true)}
        >
          Νέο Πλάνο
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
              <Th>Ονομασία</Th>
              <Th>Περιγραφή</Th>
              <Th>Τιμή</Th>
              <Th>Τύπος</Th>
              <Th>Οφέλοι</Th>
              <Th>Δημιουργήθηκε</Th>
              <Th className="text-right pr-3">Ενέργειες</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={6}>Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={6}>Κανένα Πλάνο</td></tr>
            )}
            {!loading && filtered.length > 0 && paginated.map(p => (
              <tr key={p.id} className="border-t border-white/10 hover:bg-secondary/10">
                <Td className="font-medium">{p.name}</Td>
                <Td className="font-medium">{p.description}</Td>
                <Td>{p.price != null ? formatMoney(p.price) : '—'}</Td>
                <Td className="uppercase">{p.plan_kind}</Td>
                <Td>
                  {[
                    p.duration_days ? `${p.duration_days} μέρες` : null,
                    p.session_credits ? `${p.session_credits} υπόλοιπο` : null,
                  ].filter(Boolean).join(' • ') || '—'}
                </Td>
                <Td>{new Date(p.created_at).toLocaleString()}</Td>
                <Td className="text-right">
                  <button
                    className="px-2 py-1 text-sm rounded hover:bg-secondary/10"
                    onClick={() => setEditRow(p)}
                  >
                    Επεξεργασία
                  </button>
                  <DeleteButton id={p.id} onDeleted={load} />
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
        <CreatePlanModal
          tenantId={profile?.tenant_id!}
          onClose={() => { setShowCreate(false); load(); }}
        />
      )}
      {editRow && (
        <EditPlanModal
          row={editRow}
          onClose={() => { setEditRow(null); load(); }}
        />
      )}
    </div>
  );
}

function Th({ children, className = '' }: any) {
  return <th className={`px-3 py-2 font-semibold ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: any) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}

function DeleteButton({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (!confirm('Διαγραφή αυτού του πλάνου; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί..')) return;
    setBusy(true);
    const res = await supabase.functions.invoke('plan-delete', { body: { id } });
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

/* ── Create ───────────────────────────────────────────────────────────── */
function CreatePlanModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [planKind, setPlanKind] = useState<PlanKind>('duration');
  const [durationDays, setDurationDays] = useState<number>(0);
  const [sessionCredits, setSessionCredits] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name) return;
    // ensure at least one benefit
    if ((durationDays || 0) <= 0 && (sessionCredits || 0) <= 0) {
      alert('Παρέχετε ημέρες διάρκειας ή/και αριθμό συνεδριών.');
      return;
    }
    setBusy(true);
    const res = await supabase.functions.invoke('plan-create', {
      body: {
        tenant_id: tenantId,
        name,
        price,
        plan_kind: planKind,
        duration_days: durationDays || null,
        session_credits: sessionCredits || null,
        description,
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
    <Modal onClose={onClose} title="Νέο Πλάνο Συνδρομής">
      <FormRow label="Ονομασία *">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </FormRow>
      <FormRow label="Τιμή">
        <input
          className="input"
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
      </FormRow>
      <FormRow label="Τύπος Πλάνου">
        <select
          className="input"
          value={planKind}
          onChange={(e)=>setPlanKind(e.target.value as PlanKind)}
        >
          <option value="duration">Διάρκεια (Μέρες)</option>
          <option value="sessions">Αριθμός συνεδριών</option>
          <option value="hybrid">Και τα δύο (Μέρες + Αριθμός)</option>
        </select>
      </FormRow>

      {(planKind === 'duration' || planKind === 'hybrid') && (
        <FormRow label="Διάρκεια (Μέρες)">
          <input
            className="input"
            type="number"
            min={0}
            value={durationDays}
            onChange={(e)=>setDurationDays(Number(e.target.value))}
          />
        </FormRow>
      )}

      {(planKind === 'sessions' || planKind === 'hybrid') && (
        <FormRow label="Αριθμός συνεδριών">
          <input
            className="input"
            type="number"
            min={0}
            value={sessionCredits}
            onChange={(e)=>setSessionCredits(Number(e.target.value))}
          />
        </FormRow>
      )}

      <FormRow label="Περιγραφή">
        <textarea
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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
function EditPlanModal({ row, onClose }: { row: Plan; onClose: () => void }) {
  const [name, setName] = useState(row.name);
  const [price, setPrice] = useState<number>(row.price ?? 0);
  const [planKind, setPlanKind] = useState<PlanKind>(row.plan_kind);
  const [durationDays, setDurationDays] = useState<number>(row.duration_days ?? 0);
  const [sessionCredits, setSessionCredits] = useState<number>(row.session_credits ?? 0);
  const [description, setDescription] = useState(row.description ?? '');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name) return;
    if ((durationDays || 0) <= 0 && (sessionCredits || 0) <= 0) {
      alert('Παρέχετε ημέρες διάρκειας ή/και αριθμό συνεδριών.');
      return;
    }
    setBusy(true);
    const res = await supabase.functions.invoke('plan-update', {
      body: {
        id: row.id,
        name,
        price,
        plan_kind: planKind,
        duration_days: durationDays,
        session_credits: sessionCredits,
        description,
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
    <Modal onClose={onClose} title="Επεξεργασία Πλάνου συνδρομής">
      <FormRow label="Ονομασία *">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </FormRow>
      <FormRow label="Τιμή">
        <input
          className="input"
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
      </FormRow>
      <FormRow label="Τύπος Πλάνου">
        <select
          className="input"
          value={planKind}
          onChange={(e)=>setPlanKind(e.target.value as PlanKind)}
        >
          <option value="duration">Διάρκεια (Μέρες)</option>
          <option value="sessions">Αριθμός Συνεδριών</option>
          <option value="hybrid">Και τα δύο (Μέρες + Αριθμός)</option>
        </select>
      </FormRow>

      {(planKind === 'duration' || planKind === 'hybrid') && (
        <FormRow label="Διάρκεια (Μέρες)">
          <input
            className="input"
            type="number"
            min={0}
            value={durationDays}
            onChange={(e)=>setDurationDays(Number(e.target.value))}
          />
        </FormRow>
      )}

      {(planKind === 'sessions' || planKind === 'hybrid') && (
        <FormRow label="Αριθμός Συνεδριών">
          <input
            className="input"
            type="number"
            min={0}
            value={sessionCredits}
            onChange={(e)=>setSessionCredits(Number(e.target.value))}
          />
        </FormRow>
      )}

      <FormRow label="Περιγραφή">
        <textarea
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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

/* UI helpers */
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
