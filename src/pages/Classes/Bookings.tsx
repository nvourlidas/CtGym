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
  classes?: {
    id: string;
    title: string;
    class_categories?: {
      name: string;
      color: string | null;
    } | null;
  } | null;
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

type StatusCode = 'booked' | 'checked_in' | 'canceled' | 'no_show';

const STATUS_OPTIONS: { value: StatusCode; label: string }[] = [
  { value: 'booked',      label: 'Κρατήθηκε' },
  { value: 'checked_in',  label: 'Παρουσία' },
  { value: 'canceled',   label: 'Ακυρώθηκε' },
  { value: 'no_show',     label: 'Δεν προσήλθε' },
];

type DateFilterMode = 'all' | 'today' | 'custom';

export default function BookingsPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Booking | null>(null);

  // NEW: filters
  const [classFilter, setClassFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('today');
  const [customDate, setCustomDate] = useState<string>(''); // yyyy-mm-dd

  // NEW: pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);
    setError(null);

    // Try a joined query (profiles + sessions + classes + categories)
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id, tenant_id, session_id, user_id, status, created_at,
        profiles!inner(id, full_name),
        class_sessions!inner(
          id, starts_at, ends_at, capacity,
          classes(
            id,
            title,
            class_categories(name, color)
          )
        )
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
              classes: b.class_sessions.classes
                ? {
                    id: b.class_sessions.classes.id,
                    title: b.class_sessions.classes.title,
                    class_categories: b.class_sessions.classes.class_categories ?? null,
                  }
                : null,
            }
          : null,
      }));
      setRows(mapped);
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id]);

  // Unique class list for filter dropdown
  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach(r => {
      const c = r.session?.classes;
      if (c?.id && c.title) {
        map.set(c.id, c.title);
      }
    });
    return Array.from(map.entries())
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [rows]);

  const filtered = useMemo(() => {
    let list = [...rows];

    // Filter by class (based on classes.id)
    if (classFilter) {
      list = list.filter(r => r.session?.classes?.id === classFilter);
    }

    // Filter by status
    if (statusFilter) {
      list = list.filter(r => (r.status ?? 'booked') === statusFilter);
    }

    // Filter by date (session start date if exists, otherwise created_at)
    if (dateFilterMode === 'today' || (dateFilterMode === 'custom' && customDate)) {
      const start = new Date();
      if (dateFilterMode === 'today') {
        start.setHours(0, 0, 0, 0);
      } else {
        // custom date
        const [yyyy, mm, dd] = customDate.split('-').map(Number);
        start.setFullYear(yyyy, (mm ?? 1) - 1, dd ?? 1);
        start.setHours(0, 0, 0, 0);
      }
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      list = list.filter(r => {
        const base = r.session?.starts_at ?? r.created_at;
        const d = new Date(base);
        if (Number.isNaN(d.getTime())) return false;
        return d >= start && d < end;
      });
    }

    // Text search
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter(r =>
        (r.profile?.full_name ?? '').toLowerCase().includes(needle) ||
        (r.session?.classes?.title ?? '').toLowerCase().includes(needle) ||
        (r.status ?? '').toLowerCase().includes(needle)
      );
    }

    return list;
  }, [rows, q, classFilter, statusFilter, dateFilterMode, customDate]);

  // Reset to first page when filters / page size change
  useEffect(() => {
    setPage(1);
  }, [q, pageSize, classFilter, statusFilter, dateFilterMode, customDate]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const startIdx = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(filtered.length, page * pageSize);

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <input
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
          placeholder="Αναζήτηση κρατήσεων…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {/* Filter by class */}
        <select
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm"
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
        >
          <option value="">Όλα τα τμήματα</option>
          {classOptions.map(c => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>

        {/* Filter by status */}
        <select
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Όλες οι καταστάσεις</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {/* Date filters */}
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm"
            value={dateFilterMode}
            onChange={(e) => setDateFilterMode(e.target.value as DateFilterMode)}
          >
            <option value="all">Όλες οι ημερομηνίες</option>
            <option value="today">Σήμερα</option>
            <option value="custom">Συγκεκριμένη ημερομηνία</option>
          </select>

          {dateFilterMode === 'custom' && (
            <input
              type="date"
              className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
            />
          )}
        </div>

        <button
          className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white ml-auto"
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
              <Th>Κατηγορία</Th>
              <Th>Κατάσταση</Th>
              <Th>Ημ. Δημιουργίας</Th>
              <Th className="text-right pr-3">Ενέργειες</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={6}>Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={6}>No bookings</td></tr>
            )}
            {!loading && filtered.length > 0 && paginated.map(b => (
              <tr key={b.id} className="border-t border-white/10 hover:bg-secondary/10">
                <Td>{b.profile?.full_name ?? b.user_id}</Td>
                <Td>
                  <div className="flex flex-col gap-1">
                    <span>
                      {(b.session?.classes?.title ?? '—')}
                      {' · '}
                      {b.session?.starts_at
                        ? formatDateTime(b.session.starts_at)
                        : '—'}
                    </span>
                    {b.session?.ends_at && (
                      <span className="text-[11px] text-text-secondary">
                        Λήξη: {formatDateTime(b.session.ends_at)}
                      </span>
                    )}
                  </div>
                </Td>
                <Td>
                  {b.session?.classes?.class_categories ? (
                    <span className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-white/5">
                      {b.session.classes.class_categories.color && (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full border border-white/20"
                          style={{ backgroundColor: b.session.classes.class_categories.color }}
                        />
                      )}
                      <span>{b.session.classes.class_categories.name}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-text-secondary">—</span>
                  )}
                </Td>
                <Td>
                  {renderStatusBadge(b.status)}
                </Td>
                <Td>{formatDateDMY(b.created_at)}</Td>
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

/* Create / Edit modals (μόνο μικρές αλλαγές στο Select Sessions για κατηγορία) */

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
        .select('id, starts_at, ends_at, capacity, classes(id, title, class_categories(name, color))')
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
              {(s.classes?.title ?? '—')} · {formatDateTime(s.starts_at)}
              {s.classes?.class_categories
                ? ` · ${s.classes.class_categories.name ?? ''}`
                : ''}
              {s.capacity != null ? ` (cap ${s.capacity})` : ''}
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
  const [status, setStatus] = useState<StatusCode>((row.status as StatusCode) ?? 'booked');
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
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as StatusCode)}>
          {STATUS_OPTIONS.map(s => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
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

function formatDateDMY(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
}

function renderStatusBadge(status: string | null) {
  const s = (status ?? 'booked') as StatusCode;
  let label = 'Κρατήθηκε';
  let cls = 'text-xs px-2 py-0.5 rounded-full border';

  switch (s) {
    case 'booked':
      label = 'Κρατήθηκε';
      cls += ' border-sky-500/40 bg-sky-500/10 text-sky-300';
      break;
    case 'checked_in':
      label = 'Παρουσία';
      cls += ' border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
      break;
    case 'canceled':
      label = 'Ακυρώθηκε';
      cls += ' border-rose-500/40 bg-rose-500/10 text-rose-300';
      break;
    case 'no_show':
      label = 'Δεν προσήλθε';
      cls += ' border-amber-500/40 bg-amber-500/10 text-amber-300';
      break;
  }

  return <span className={cls}>{label}</span>;
}
