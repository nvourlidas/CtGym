import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

type Member = {
  id: string;
  full_name: string | null;
  phone: string | null;
  tenant_id: string | null;
  role: 'member';
  created_at: string;
  email?: string | null; // optional from user metadata if you join auth
};

export default function MembersPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Member | null>(null);

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone, tenant_id, role, created_at')
      .eq('tenant_id', profile.tenant_id)
      .eq('role', 'member')
      .order('created_at', { ascending: false });
    if (!error) setRows((data as Member[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter(r =>
      (r.full_name ?? '').toLowerCase().includes(needle) ||
      (r.phone ?? '').toLowerCase().includes(needle) ||
      r.id.toLowerCase().includes(needle)
    );
  }, [rows, q]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <input
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
          placeholder="Search members…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white"
          onClick={() => setShowCreate(true)}
        >
          New Member
        </button>
      </div>

      <div className="rounded-md border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary-background/60">
            <tr className="text-left">
              <Th>ID</Th>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Created</Th>
              <Th className="text-right pr-3">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={5}>Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={5}>No members</td></tr>
            )}
            {filtered.map(m => (
              <tr key={m.id} className="border-t border-white/10 hover:bg-secondary/10">
                <Td>{m.id}</Td>
                <Td>{m.full_name ?? '—'}</Td>
                <Td>{m.phone ?? '—'}</Td>
                <Td>{new Date(m.created_at).toLocaleString()}</Td>
                <Td className="text-right">
                  <button className="px-2 py-1 text-sm rounded hover:bg-secondary/10"
                          onClick={() => setEditRow(m)}>Edit</button>
                  <DeleteButton id={m.id} onDeleted={load} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateMemberModal tenantId={profile?.tenant_id!} onClose={() => { setShowCreate(false); load(); }} />}
      {editRow && <EditMemberModal row={editRow} onClose={() => { setEditRow(null); load(); }} />}
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
    if (!confirm('Delete this member? This cannot be undone.')) return;
    setBusy(true);
    await supabase.functions.invoke('member-delete', { body: { id } });
    setBusy(false);
    onDeleted();
  };
  return (
    <button className="ml-2 px-2 py-1 text-sm rounded text-danger hover:bg-danger/10 disabled:opacity-50"
      onClick={onClick} disabled={busy}>
      {busy ? 'Deleting…' : 'Delete'}
    </button>
  );
}

function CreateMemberModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password) return;
    setBusy(true);
    await supabase.functions.invoke('member-create', {
      body: { email, password, full_name: fullName, phone, tenant_id: tenantId },
    });
    setBusy(false);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="New Member">
      <FormRow label="Full name">
        <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </FormRow>
      <FormRow label="Email *">
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormRow>
      <FormRow label="Phone">
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </FormRow>
      <FormRow label="Password *">
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </FormRow>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create'}</button>
      </div>
    </Modal>
  );
}

function EditMemberModal({ row, onClose }: { row: Member; onClose: () => void }) {
  const [fullName, setFullName] = useState(row.full_name ?? '');
  const [phone, setPhone] = useState(row.phone ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await supabase.functions.invoke('member-update', {
      body: { id: row.id, full_name: fullName, phone, password: password || undefined },
    });
    setBusy(false);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Edit Member">
      <FormRow label="Full name">
        <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </FormRow>
      <FormRow label="Phone">
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </FormRow>
      <FormRow label="New password (optional)">
        <input className="input" type="password" placeholder="Leave blank to keep current"
               value={password} onChange={(e) => setPassword(e.target.value)} />
      </FormRow>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  );
}

/* small UI helpers */
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
