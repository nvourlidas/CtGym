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

type BookingHistoryRow = {
  id: string;
  status: string | null;
  created_at: string;
  session_start: string | null;
  session_end: string | null;
  class_title: string | null;
};

export default function MembersPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Member | null>(null);

  // NEW: pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // NEW: history modal state
  const [historyMember, setHistoryMember] = useState<{
    id: string;
    name: string | null;
  } | null>(null);

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
          placeholder="Αναζήτηση μελών…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white"
          onClick={() => setShowCreate(true)}
        >
          Νέο Μέλος
        </button>
      </div>

      <div className="rounded-md border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary-background/60">
            <tr className="text-left">
              <Th>Όνομα</Th>
              <Th>Τηλέφωνο</Th>
              <Th>Ημ. Δημιουργίας</Th>
              <Th className="text-right pr-3">Ενέργειες</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={4}>Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={4}>No members</td></tr>
            )}
            {!loading && filtered.length > 0 && paginated.map(m => (
              <tr key={m.id} className="border-t border-white/10 hover:bg-secondary/10">
                <Td>{m.full_name ?? '—'}</Td>
                <Td>{m.phone ?? '—'}</Td>
                <Td>{new Date(m.created_at).toLocaleString()}</Td>
                <Td className="text-right space-x-1">
                  <button
                    className="px-2 py-1 text-xs rounded border border-white/10 hover:bg-secondary/10"
                    onClick={() =>
                      setHistoryMember({
                        id: m.id,
                        name: m.full_name,
                      })
                    }
                  >
                    Ιστορικό
                  </button>
                  <button
                    className="px-2 py-1 text-xs rounded hover:bg-secondary/10"
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
        <CreateMemberModal
          tenantId={profile?.tenant_id!}
          onClose={() => { setShowCreate(false); load(); }}
        />
      )}
      {editRow && (
        <EditMemberModal
          row={editRow}
          onClose={() => { setEditRow(null); load(); }}
        />
      )}

      {/* NEW: Member bookings history modal */}
      {historyMember && profile?.tenant_id && (
        <MemberBookingsModal
          tenantId={profile.tenant_id}
          memberId={historyMember.id}
          memberName={historyMember.name ?? historyMember.id}
          onClose={() => setHistoryMember(null)}
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
    if (!confirm('Διαγραφή αυτού του μέλους; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.')) return;
    setBusy(true);
    await supabase.functions.invoke('member-delete', { body: { id } });
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
    <Modal onClose={onClose} title="Νέο Μέλος">
      <FormRow label="Όνομα *">
        <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </FormRow>
      <FormRow label="Email *">
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormRow>
      <FormRow label="Τηλέφωνο">
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </FormRow>
      <FormRow label="Password *">
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
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
    <Modal onClose={onClose} title="Επεξεργασία Μέλους">
      <FormRow label="Όνομα">
        <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </FormRow>
      <FormRow label="Τηλέφωνο">
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </FormRow>
      <FormRow label="Νέο password (προαιρετικό)">
        <input
          className="input"
          type="password"
          placeholder="Αφήστε κενό για να διατηρήσετε το τρέχον"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
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

/* NEW: Member bookings history modal */
function MemberBookingsModal({
  tenantId,
  memberId,
  memberName,
  onClose,
}: {
  tenantId: string;
  memberId: string;
  memberName: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<BookingHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          status,
          created_at,
          class_sessions(
            starts_at,
            ends_at,
            classes(title)
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('user_id', memberId)
        .order('created_at', { ascending: false });

      if (error) {
        setError(error.message);
        setRows([]);
      } else {
        const mapped = (data as any[] ?? []).map((b) => ({
          id: b.id,
          status: b.status,
          created_at: b.created_at,
          session_start: b.class_sessions?.starts_at ?? null,
          session_end: b.class_sessions?.ends_at ?? null,
          class_title: b.class_sessions?.classes?.title ?? null,
        }));
        setRows(mapped);
      }
      setLoading(false);
    })();
  }, [tenantId, memberId]);

  const formatDateTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString() : '—';

  return (
    <Modal title={`Κρατήσεις — ${memberName}`} onClose={onClose}>
      {error && (
        <div className="mb-3 text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">
          {error}
        </div>
      )}

      <div className="rounded-md border border-white/10 overflow-hidden max-h-[60vh] w-full">
        <table className="w-full text-sm">
          <thead className="bg-secondary-background/60">
            <tr className="text-left">
              <Th>Τμήμα</Th>
              <Th>Συνεδρία</Th>
              <Th>Κατάσταση</Th>
              <Th>Ημ. Κράτησης</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={4}>Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={4}>Δεν υπάρχουν κρατήσεις</td></tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r.id} className="border-t border-white/10 hover:bg-secondary/10">
                <Td>{r.class_title ?? '—'}</Td>
                <Td>
                  {r.session_start
                    ? `${new Date(r.session_start).toLocaleDateString()} • ${new Date(r.session_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : '—'}
                </Td>
                <Td className="capitalize">
                  {r.status ?? 'booked'}
                </Td>
                <Td>{formatDateTime(r.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end">
        <button className="btn-secondary" onClick={onClose}>Κλείσιμο</button>
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
