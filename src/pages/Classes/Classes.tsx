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

  // NEW: pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  // Reset to first page when filter or page size changes
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
      <div className="mb-4 flex items-center gap-3">
        <input
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
          placeholder="Αναζήτηση τμημάτων…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white"
          onClick={() => setShowCreate(true)}
        >
          Νέο Τμήμα
        </button>
      </div>

      <div className="rounded-md border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary-background/60">
            <tr className="text-left">
              <Th>Τίτλος</Th>
              <Th>Περιγραφή</Th>
              <Th>Ημ. Δημιουργίας</Th>
              <Th className="text-right pr-3">Ενέργειες</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={4}>Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={4}>No classes</td></tr>
            )}
            {!loading && filtered.length > 0 && paginated.map(c => (
              <tr key={c.id} className="border-t border-white/10 hover:bg-secondary/10">
                <Td className="font-medium">{c.title}</Td>
                <Td className="text-text-secondary">{c.description ?? '—'}</Td>
                <Td>{new Date(c.created_at).toLocaleString()}</Td>
                <Td className="text-right">
                  <button
                    className="px-2 py-1 text-sm rounded hover:bg-secondary/10"
                    onClick={() => setEditRow(c)}
                  >
                    Επεξεργασία
                  </button>
                  <DeleteButton id={c.id} onDeleted={load} />
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
                <span>Γραμμές ανά σελίδα:</span>
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
        )}
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
    if (!confirm('Διαγραφή αυτού του τμήματος; Αυτό δεν μπορεί να αναιρεθεί.')) return;
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
      {busy ? 'Διαγραφή…' : 'Διαγραφή'}
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
    <Modal onClose={onClose} title="Νέο Τμήμα">
      <FormRow label="Τίτλος *">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </FormRow>
      <FormRow label="Περιγραφή">
        <textarea
          className="input"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormRow>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Ακύρωση</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Δημιουργία…' : 'Δημιουργία'}
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
    <Modal onClose={onClose} title="Επεξεργασία Τμήματος">
      <FormRow label="Τίτλος *">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </FormRow>
      <FormRow label="Περιγραφή">
        <textarea
          className="input"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormRow>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Ακύρωση</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Αποθήκευση…' : 'Αποθήκευση'}
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
