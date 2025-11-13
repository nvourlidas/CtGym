// src/pages/BookingsPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';

type Member = { id: string; full_name: string | null };
type SessionRow = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  classes?: { title: string } | null;
};
type Booking = {
  id: string;
  tenant_id: string;
  session_id: string;
  user_id: string;
  status: string | null;
  created_at: string;
  // joined (for display)
  profile?: Member | null;
  session?: SessionRow | null;
};

export default function BookingsPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Booking | null>(null);

  // NEW: pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);
    setError(null);

    // Try a joined query (profiles + classes)
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id, tenant_id, session_id, user_id, status, created_at,
        profiles!inner(id, full_name),
        class_sessions!inner(id, starts_at, ends_at, capacity, classes(title))
      `)
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false });

    if (error) {
      // fallback if join not allowed by RLS
      const { data: bare, error: e2 } = await supabase
        .from('bookings')
        .select('id, tenant_id, session_id, user_id, status, created_at')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false });

      if (e2) setError(e2.message);
      setRows(((bare as any[]) ?? []).map(b => ({ ...b, profile: null, session: null })));
    } else {
      const mapped = (data as any[]).map((b) => ({
        id: b.id,
        tenant_id: b.tenant_id,
        session_id: b.session_id,
        user_id: b.user_id,
        status: b.status,
        created_at: b.created_at,
        profile: b.profiles ? { id: b.profiles.id, full_name: b.profiles.full_name } : null,
        session: b.class_sessions
          ? {
              id: b.class_sessions.id,
              starts_at: b.class_sessions.starts_at,
              ends_at: b.class_sessions.ends_at,
              capacity: b.class_sessions.capacity,
              classes: b.class_sessions.classes ?? null,
            }
          : null,
      }));
      setRows(mapped);
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter(r =>
      (r.profile?.full_name ?? '').toLowerCase().includes(needle) ||
      (r.session?.classes?.title ?? '').toLowerCase().includes(needle) ||
      (r.status ?? '').toLowerCase().includes(needle)
    );
  }, [rows, q]);

  // Reset to first page when search or page size changes
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
          placeholder="Αναζήτηση κρατήσεων…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white"
          onClick={() => setShowCreate(true)}
        >
          Νέα Κράτηση
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
              <Th>Τμήμα / Συνεδρία</Th>
              <Th>Κατάσταση</Th>
              <Th>Ημ. Δημιουργίας</Th>
              <Th className="text-right pr-3">Ενέργειες</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={5}>Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={5}>No bookings</td></tr>
            )}
            {!loading && filtered.length > 0 && paginated.map(b => (
              <tr key={b.id} className="border-t border-white/10 hover:bg-secondary/10">
                <Td>{b.profile?.full_name ?? b.user_id}</Td>
                <Td>
                  {(b.session?.classes?.title ?? '—')}
                  {' · '}
                  {b.session?.starts_at ? new Date(b.session.starts_at).toLocaleString() : '—'}
                </Td>
                <Td>{b.status ?? 'booked'}</Td>
                <Td>{new Date(b.created_at).toLocaleString()}</Td>
                <Td className="text-right">
                  <button
                    className="px-2 py-1 text-sm rounded hover:bg-secondary/10"
                    onClick={() => setEditRow(b)}
                  >
                    Επεξεργασία
                  </button>
                  <DeleteButton id={b.id} onDeleted={load} />
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
        <CreateBookingModal
          tenantId={profile?.tenant_id!}
          onClose={() => { setShowCreate(false); load(); }}
        />
      )}
      {editRow && (
        <EditBookingModal
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
    if (!confirm('Διαγραφή αυτής της κράτησης; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.')) return;
    setBusy(true);
    const res = await supabase.functions.invoke('booking-delete', { body: { id } });
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

function CreateBookingModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [userId, setUserId] = useState('');
  const [sessionId, setSessionId] = useState('');
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
      const { data: s } = await supabase
        .from('class_sessions')
        .select('id, starts_at, ends_at, capacity, classes(title)')
        .eq('tenant_id', tenantId)
        .order('starts_at', { ascending: true });
      setSessions((s as any[]) ?? []);
    })();
  }, [tenantId]);

  const submit = async () => {
    if (!userId || !sessionId) return;
    setBusy(true);
    const res = await supabase.functions.invoke('booking-create', {
      body: { tenant_id: tenantId, user_id: userId, session_id: sessionId },
    });
    setBusy(false);
    if (res.error || (res.data as any)?.error) {
      alert(res.error?.message ?? (res.data as any)?.error ?? 'Create failed');
      return;
    }
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Νέα κράτηση">
      <FormRow label="Μέλος *">
        <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">— επίλεξε μέλος —</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>
              {m.full_name ?? m.id}
            </option>
          ))}
        </select>
      </FormRow>
      <FormRow label="Συνεδρία *">
        <select className="input" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          <option value="">— επίλεξε συνεδρία —</option>
          {sessions.map(s => (
            <option key={s.id} value={s.id}>
              {(s.classes?.title ?? '—')} · {new Date(s.starts_at).toLocaleString()} (cap {s.capacity ?? '∞'})
            </option>
          ))}
        </select>
      </FormRow>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Ακύρωση</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Δημιουργία...' : 'Δημιουργία'}
        </button>
      </div>
    </Modal>
  );
}

function EditBookingModal({ row, onClose }: { row: Booking; onClose: () => void }) {
  const [status, setStatus] = useState(row.status ?? 'booked');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const res = await supabase.functions.invoke('booking-update', { body: { id: row.id, status } });
    setBusy(false);
    if (res.error || (res.data as any)?.error) {
      alert(res.error?.message ?? (res.data as any)?.error ?? 'Save failed');
      return;
    }
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Επεξεργασία Κράτησης">
      <FormRow label="Κατάσταση">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="booked">booked</option>
          <option value="checked_in">checked_in</option>
          <option value="cancelled">cancelled</option>
          <option value="no_show">no_show</option>
        </select>
      </FormRow>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Ακύρωση</button>
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
