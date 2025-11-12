import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';

type GymClass = {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  created_at: string;
};

export default function ClassesPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<GymClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<GymClass | null>(null);

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('classes')
      .select('id, tenant_id, title, description, created_at')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false });
    if (!error) setRows((data as GymClass[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter(r =>
      (r.title ?? '').toLowerCase().includes(needle) ||
      (r.description ?? '').toLowerCase().includes(needle) ||
      r.id.toLowerCase().includes(needle)
    );
  }, [rows, q]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <input
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
          placeholder="Search classes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white"
          onClick={() => setShowCreate(true)}
        >
          New Class
        </button>
      </div>

      <div className="rounded-md border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary-background/60">
            <tr className="text-left">
              <Th>Title</Th>
              <Th>Description</Th>
              <Th>Created</Th>
              <Th className="text-right pr-3">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={5}>Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={5}>No classes</td></tr>
            )}
            {filtered.map(c => (
              <tr key={c.id} className="border-t border-white/10 hover:bg-secondary/10">
                <Td className="font-medium">{c.title}</Td>
                <Td className="text-text-secondary">{c.description ?? '—'}</Td>
                <Td>{new Date(c.created_at).toLocaleString()}</Td>
                <Td className="text-right">
                  <button
                    className="px-2 py-1 text-sm rounded hover:bg-secondary/10"
                    onClick={() => setEditRow(c)}
                  >
                    Edit
                  </button>
                  <DeleteButton id={c.id} onDeleted={load} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateClassModal
          tenantId={profile?.tenant_id!}
          onClose={() => { setShowCreate(false); load(); }}
        />
      )}
      {editRow && (
        <EditClassModal
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
    if (!confirm('Delete this class? This cannot be undone.')) return;
    setBusy(true);
    await supabase.functions.invoke('class-delete', { body: { id } });
    setBusy(false);
    onDeleted();
  };
  return (
    <button
      className="ml-2 px-2 py-1 text-sm rounded text-danger hover:bg-danger/10 disabled:opacity-50"
      onClick={onClick}
      disabled={busy}
    >
      {busy ? 'Deleting…' : 'Delete'}
    </button>
  );
}

function CreateClassModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    await supabase.functions.invoke('class-create', {
      body: { tenant_id: tenantId, title: title.trim(), description: description.trim() || null },
    });
    setBusy(false);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="New Class">
      <FormRow label="Title *">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </FormRow>
      <FormRow label="Description">
        <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
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

function EditClassModal({ row, onClose }: { row: GymClass; onClose: () => void }) {
  const [title, setTitle] = useState(row.title ?? '');
  const [description, setDescription] = useState(row.description ?? '');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const res = await supabase.functions.invoke('class-update', {
      body: { id: row.id, title: title.trim(), description: description.trim() || null },
    });
    if (res.error) {
  console.error('Edge error:', res.error);
  alert(res.error.message ?? 'Function error');
}
    setBusy(false);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Edit Class">
      <FormRow label="Title *">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </FormRow>
      <FormRow label="Description">
        <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
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
