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
  profile?: Member | null;  // joined for display
};

export default function MembershipsPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<MembershipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<MembershipRow | null>(null);

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);
    setError(null);

    // Try to join member name via FK if available
    const { data, error } = await supabase
      .from('memberships')
      .select(`
        id, tenant_id, user_id, plan_id, starts_at, ends_at, status, created_at,
        remaining_sessions, plan_kind, plan_name, plan_price,
        profiles!inner(id, full_name)
      `)
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false });

    if (error) {
      // Fallback without join
      const { data: bare, error: e2 } = await supabase
        .from('memberships')
        .select('id, tenant_id, user_id, plan_id, starts_at, ends_at, status, created_at, remaining_sessions, plan_kind, plan_name, plan_price')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false });
      if (e2) setError(e2.message);
      setRows((bare as any[] | null)?.map(r => ({ ...r, profile: null })) ?? []);
    } else {
      const withName = (data as any[]).map(r => ({
        ...r,
        profile: r.profiles ? { id: r.profiles.id, full_name: r.profiles.full_name } : null,
      }));
      setRows(withName);
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter(r =>
      (r.profile?.full_name ?? '').toLowerCase().includes(needle) ||
      (r.plan_name ?? '').toLowerCase().includes(needle) ||
      (r.status ?? '').toLowerCase().includes(needle)
    );
  }, [rows, q]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <input
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
          placeholder="Search memberships…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white"
                onClick={() => setShowCreate(true)}>
          New Membership
        </button>
      </div>

      {error && <div className="mb-4 text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">{error}</div>}

      <div className="rounded-md border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary-background/60">
            <tr className="text-left">
              <Th>Member</Th>
              <Th>Plan</Th>
              <Th>Starts</Th>
              <Th>Ends</Th>
              <Th>Remaining</Th>
              <Th>Status</Th>
              <Th className="text-right pr-3">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="px-3 py-4 opacity-60" colSpan={7}>Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td className="px-3 py-4 opacity-60" colSpan={7}>No memberships</td></tr>}
            {filtered.map(m => (
              <tr key={m.id} className="border-t border-white/10 hover:bg-secondary/10">
                <Td>{m.profile?.full_name ?? m.user_id}</Td>
                <Td>{m.plan_name ?? '—'}</Td>
                <Td>{m.starts_at ? new Date(m.starts_at).toLocaleDateString() : '—'}</Td>
                <Td>{m.ends_at ? new Date(m.ends_at).toLocaleDateString() : '—'}</Td>
                <Td>{m.remaining_sessions ?? '—'}</Td>
                <Td>{m.status ?? 'active'}</Td>
                <Td className="text-right">
                  <button className="px-2 py-1 text-sm rounded hover:bg-secondary/10" onClick={() => setEditRow(m)}>Edit</button>
                  <DeleteButton id={m.id} onDeleted={load} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateMembershipModal tenantId={profile?.tenant_id!} onClose={() => { setShowCreate(false); load(); }} />}
      {editRow && <EditMembershipModal row={editRow} onClose={() => { setEditRow(null); load(); }} />}
    </div>
  );
}

function Th({ children, className = '' }: any) { return <th className={`px-3 py-2 font-semibold ${className}`}>{children}</th>; }
function Td({ children, className = '' }: any) { return <td className={`px-3 py-2 ${className}`}>{children}</td>; }

function DeleteButton({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (!confirm('Delete this membership?')) return;
    setBusy(true);
    const res = await supabase.functions.invoke('membership-delete', { body: { id } });
    setBusy(false);
    if (res.error || (res.data as any)?.error) alert(res.error?.message ?? (res.data as any)?.error ?? 'Delete failed');
    else onDeleted();
  };
  return (
    <button className="ml-2 px-2 py-1 text-sm rounded text-danger hover:bg-danger/10 disabled:opacity-50"
            onClick={onClick} disabled={busy}>
      {busy ? 'Deleting…' : 'Delete'}
    </button>
  );
}

/* ── Create ───────────────────────────────────────────────────────────── */
function CreateMembershipModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [userId, setUserId] = useState('');
  const [planId, setPlanId] = useState('');
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0,10)); // yyyy-mm-dd
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
      body: { tenant_id: tenantId, user_id: userId, plan_id: planId, starts_at: startsAt },
    });
    setBusy(false);
    if (res.error || (res.data as any)?.error) {
      alert(res.error?.message ?? (res.data as any)?.error ?? 'Create failed');
      return;
    }
    onClose();
  };

  return (
    <Modal onClose={onClose} title="New Membership">
      <FormRow label="Member *">
        <select className="input" value={userId} onChange={(e)=>setUserId(e.target.value)}>
          <option value="">— select member —</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.full_name ?? m.id}</option>)}
        </select>
      </FormRow>
      <FormRow label="Plan *">
        <select className="input" value={planId} onChange={(e)=>setPlanId(e.target.value)}>
          <option value="">— select plan —</option>
          {plans.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} · {[
                p.duration_days ? `${p.duration_days}d` : null,
                p.session_credits ? `${p.session_credits} credits` : null,
              ].filter(Boolean).join(' • ')} {p.price!=null ? `· ${formatMoney(p.price)}` : ''}
            </option>
          ))}
        </select>
      </FormRow>
      <FormRow label="Starts at">
        <input className="input" type="date" value={startsAt}
               onChange={(e)=>setStartsAt(e.target.value)} />
      </FormRow>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create'}</button>
      </div>
    </Modal>
  );
}

/* ── Edit ─────────────────────────────────────────────────────────────── */
function EditMembershipModal({ row, onClose }: { row: MembershipRow; onClose: () => void }) {
  const [status, setStatus] = useState(row.status ?? 'active');
  const [startsAt, setStartsAt] = useState(row.starts_at?.slice(0,10) ?? '');
  const [endsAt, setEndsAt] = useState(row.ends_at?.slice(0,10) ?? '');
  const [remaining, setRemaining] = useState<number>(row.remaining_sessions ?? 0);
  const [planId, setPlanId] = useState<string>(row.plan_id ?? '');
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
    <Modal onClose={onClose} title="Edit Membership">
      <FormRow label="Plan">
        <select className="input" value={planId} onChange={(e)=>setPlanId(e.target.value)}>
          <option value="">(keep current)</option>
          {plans.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} · {[
                p.duration_days ? `${p.duration_days}d` : null,
                p.session_credits ? `${p.session_credits} credits` : null,
              ].filter(Boolean).join(' • ')}
            </option>
          ))}
        </select>
      </FormRow>
      <FormRow label="Status">
        <select className="input" value={status} onChange={(e)=>setStatus(e.target.value)}>
          <option value="active">active</option>
          <option value="paused">paused</option>
          <option value="cancelled">cancelled</option>
          <option value="expired">expired</option>
        </select>
      </FormRow>
      <FormRow label="Starts at">
        <input className="input" type="date" value={startsAt} onChange={(e)=>setStartsAt(e.target.value)} />
      </FormRow>
      <FormRow label="Ends at">
        <input className="input" type="date" value={endsAt} onChange={(e)=>setEndsAt(e.target.value)} />
      </FormRow>
      <FormRow label="Remaining sessions">
        <input className="input" type="number" min={0} value={remaining}
               onChange={(e)=>setRemaining(Number(e.target.value))} />
      </FormRow>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
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
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);
}
