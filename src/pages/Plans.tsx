import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

type Plan = {
  id: string;
  tenant_id: string;
  name: string;
  price: number | null;           // adjust if your column is price_cents / numeric
  period: 'day' | 'week' | 'month' | 'year';
  description: string | null;
  active: boolean | null;
  created_at: string;
};

export default function MembershipPlansPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('membership_plans')
      .select('id, tenant_id, name, price, period, description, active, created_at')
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

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <input
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
          placeholder="Search plans…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white"
          onClick={() => setShowCreate(true)}
        >
          New Plan
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
              <Th>Name</Th>
              <Th>Price</Th>
              <Th>Period</Th>
              <Th>Active</Th>
              <Th>Created</Th>
              <Th className="text-right pr-3">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="px-3 py-4 opacity-60" colSpan={6}>Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td className="px-3 py-4 opacity-60" colSpan={6}>No plans</td></tr>}
            {filtered.map(p => (
              <tr key={p.id} className="border-t border-white/10 hover:bg-secondary/10">
                <Td className="font-medium">{p.name}</Td>
                <Td>{p.price != null ? formatMoney(p.price) : '—'}</Td>
                <Td className="uppercase">{p.period}</Td>
                <Td>{p.active ? 'Yes' : 'No'}</Td>
                <Td>{new Date(p.created_at).toLocaleString()}</Td>
                <Td className="text-right">
                  <button className="px-2 py-1 text-sm rounded hover:bg-secondary/10"
                          onClick={() => setEditRow(p)}>Edit</button>
                  <DeleteButton id={p.id} onDeleted={load} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
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
    if (!confirm('Delete this plan? This cannot be undone.')) return;
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
    <button className="ml-2 px-2 py-1 text-sm rounded text-danger hover:bg-danger/10 disabled:opacity-50"
      onClick={onClick} disabled={busy}>
      {busy ? 'Deleting…' : 'Delete'}
    </button>
  );
}

function CreatePlanModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [period, setPeriod] = useState<'day'|'week'|'month'|'year'>('month');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name) return;
    setBusy(true);
    const res = await supabase.functions.invoke('plan-create', {
      body: { tenant_id: tenantId, name, price, period, description, active },
    });
    setBusy(false);
    if (res.error || (res.data as any)?.error) {
      alert(res.error?.message ?? (res.data as any)?.error ?? 'Create failed');
      return;
    }
    onClose();
  };

  return (
    <Modal onClose={onClose} title="New Membership Plan">
      <FormRow label="Name *">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </FormRow>
      <FormRow label="Price">
        <input className="input" type="number" step="0.01" value={price}
               onChange={(e) => setPrice(Number(e.target.value))} />
      </FormRow>
      <FormRow label="Period">
        <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as any)}>
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
        </select>
      </FormRow>
      <FormRow label="Description">
        <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormRow>
      <FormRow label="Active">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </FormRow>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Creating…' : 'Create'}
        </button>
      </div>
    </Modal>
  );
}

function EditPlanModal({ row, onClose }: { row: Plan; onClose: () => void }) {
  const [name, setName] = useState(row.name);
  const [price, setPrice] = useState<number>(row.price ?? 0);
  const [period, setPeriod] = useState<Plan['period']>(row.period);
  const [description, setDescription] = useState(row.description ?? '');
  const [active, setActive] = useState(Boolean(row.active));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const res = await supabase.functions.invoke('plan-update', {
      body: { id: row.id, name, price, period, description, active },
    });
    setBusy(false);
    if (res.error || (res.data as any)?.error) {
      alert(res.error?.message ?? (res.data as any)?.error ?? 'Save failed');
      return;
    }
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Edit Membership Plan">
      <FormRow label="Name *">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </FormRow>
      <FormRow label="Price">
        <input className="input" type="number" step="0.01" value={price}
               onChange={(e) => setPrice(Number(e.target.value))} />
      </FormRow>
      <FormRow label="Period">
        <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as any)}>
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
        </select>
      </FormRow>
      <FormRow label="Description">
        <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormRow>
      <FormRow label="Active">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </FormRow>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
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
  // if you store cents, divide by 100 here
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);
}
