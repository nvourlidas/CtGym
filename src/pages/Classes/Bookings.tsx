// src/pages/BookingsPage.tsx
import { useEffect, useMemo, useState, useRef } from 'react';
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
  // NEW: drop-in info
  booking_type?: 'membership' | 'drop_in' | string | null;
  drop_in_price?: number | null;
  // joined (for display)
  profile?: Member | null;
  session?: SessionRow | null;
};

type StatusCode = 'booked' | 'checked_in' | 'canceled' | 'no_show';

const STATUS_OPTIONS: { value: StatusCode; label: string }[] = [
  { value: 'booked', label: 'Κρατήθηκε' },
  { value: 'checked_in', label: 'Παρουσία' },
  { value: 'canceled', label: 'Ακυρώθηκε' },
  { value: 'no_show', label: 'Δεν προσήλθε' },
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

  // filters
  const [classFilter, setClassFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('today');
  const [customDate, setCustomDate] = useState<string>(''); // yyyy-mm-dd
  // NEW: booking type filter
  const [bookingTypeFilter, setBookingTypeFilter] = useState<string>('');

  // pagination state
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
        booking_type,
        drop_in_price,
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
        .select('id, tenant_id, session_id, user_id, status, created_at, booking_type, drop_in_price')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false });

      if (e2) setError(e2.message);
      setRows(((bare as any[]) ?? []).map(b => ({
        ...b,
        profile: null,
        session: null,
      })));
    } else {
      const mapped = (data as any[]).map((b) => ({
        id: b.id,
        tenant_id: b.tenant_id,
        session_id: b.session_id,
        user_id: b.user_id,
        status: b.status,
        created_at: b.created_at,
        booking_type: b.booking_type ?? 'membership',
        drop_in_price: b.drop_in_price ?? null,
        profile: b.profiles
          ? { id: b.profiles.id, full_name: b.profiles.full_name }
          : null,
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

    // NEW: Filter by booking type (membership / drop_in)
    if (bookingTypeFilter) {
      list = list.filter(r => (r.booking_type ?? 'membership') === bookingTypeFilter);
    }

    // Filter by date (session start date if exists, otherwise created_at)
    if (dateFilterMode === 'today' || (dateFilterMode === 'custom' && customDate)) {
      const start = new Date();
      if (dateFilterMode === 'today') {
        start.setHours(0, 0, 0, 0);
      } else {
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
  }, [rows, q, classFilter, statusFilter, bookingTypeFilter, dateFilterMode, customDate]);

  // Reset to first page when filters / page size change
  useEffect(() => {
    setPage(1);
  }, [q, pageSize, classFilter, statusFilter, bookingTypeFilter, dateFilterMode, customDate]);

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

        {/* NEW: Filter by booking type */}
        <select
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm"
          value={bookingTypeFilter}
          onChange={(e) => setBookingTypeFilter(e.target.value)}
        >
          <option value="">Όλοι οι τύποι</option>
          <option value="membership">Μέλος</option>
          <option value="drop_in">Drop-in</option>
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
              <Th>Κατάσταση / Τύπος</Th>
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
            {!loading && filtered.length > 0 && paginated.map(b => {
              const isDropIn = (b.booking_type ?? 'membership') === 'drop_in';
              return (
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
                    <div className="flex flex-col gap-1">
                      {renderStatusBadge(b.status)}
                      <div className="flex items-center gap-2 text-[11px]">
                        <span
                          className={
                            'inline-flex items-center rounded-full px-2 py-0.5 border ' +
                            (isDropIn
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300')
                          }
                        >
                          {isDropIn ? 'Drop-in' : 'Μέλος'}
                        </span>
                        {isDropIn && b.drop_in_price != null && (
                          <span className="opacity-80">
                            {b.drop_in_price.toFixed(2)}€
                          </span>
                        )}
                      </div>
                    </div>
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
              );
            })}
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

/* Create / Edit modals */

function CreateBookingModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [userId, setUserId] = useState('');
  const [sessionId, setSessionId] = useState('');
  // NEW: booking type
  const [bookingType, setBookingType] = useState<'membership' | 'drop_in'>('membership');
  const [busy, setBusy] = useState(false);

  // 🔍 MEMBER dropdown state
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const memberDropdownRef = useRef<HTMLDivElement | null>(null);

  // 🔍 SESSION dropdown state (with date filter)
  const [sessionDropdownOpen, setSessionDropdownOpen] = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionDate, setSessionDate] = useState(''); // yyyy-mm-dd
  const sessionDropdownRef = useRef<HTMLDivElement | null>(null);

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
        .select(
          'id, starts_at, ends_at, capacity, classes(id, title, class_categories(name, color))'
        )
        .eq('tenant_id', tenantId)
        .order('starts_at', { ascending: true });
      setSessions((s as any[]) ?? []);
    })();
  }, [tenantId]);

  // Close MEMBER dropdown on outside click
  useEffect(() => {
    if (!memberDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (!memberDropdownRef.current) return;
      if (!memberDropdownRef.current.contains(e.target as Node)) {
        setMemberDropdownOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [memberDropdownOpen]);

  // Close SESSION dropdown on outside click
  useEffect(() => {
    if (!sessionDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (!sessionDropdownRef.current) return;
      if (!sessionDropdownRef.current.contains(e.target as Node)) {
        setSessionDropdownOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [sessionDropdownOpen]);

  // FILTERED MEMBERS
  const filteredMembers = members.filter((m) => {
    const needle = memberSearch.toLowerCase();
    if (!needle) return true;
    return (m.full_name ?? '').toLowerCase().includes(needle) || m.id.toLowerCase().includes(needle);
  });
  const selectedMember = members.find((m) => m.id === userId);

  // FILTERED SESSIONS (by text + date)
  const filteredSessions = sessions.filter((s) => {
    const needle = sessionSearch.toLowerCase();

    // text search in class title + formatted datetime
    const title = (s.classes?.title ?? '').toLowerCase();
    const dateLabel = formatDateTime(s.starts_at).toLowerCase();
    const matchesText = !needle || title.includes(needle) || dateLabel.includes(needle);

    // date filter: compare yyyy-mm-dd of starts_at
    if (sessionDate) {
      const d = new Date(s.starts_at);
      if (Number.isNaN(d.getTime())) return false;
      const iso = d.toISOString().slice(0, 10); // yyyy-mm-dd
      if (iso !== sessionDate) return false;
    }

    return matchesText;
  });
  const selectedSession = sessions.find((s) => s.id === sessionId);

  const sessionLabel = (s: SessionRow) => {
    const base = `${s.classes?.title ?? '—'} · ${formatDateTime(s.starts_at)}`;
    const cat = s.classes?.class_categories?.name
      ? ` · ${s.classes.class_categories.name}`
      : '';
    const cap = s.capacity != null ? ` (cap ${s.capacity})` : '';
    return base + cat + cap;
  };

  const submit = async () => {
    if (!userId || !sessionId) return;
    setBusy(true);
    const res = await supabase.functions.invoke('booking-create', {
      body: {
        tenant_id: tenantId,
        user_id: userId,
        session_id: sessionId,
        // NEW: send type (backend can ignore until you update it)
        booking_type: bookingType,
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
    <Modal onClose={onClose} title="Νέα κράτηση">
      {/* 🔍 Searchable MEMBER dropdown */}
      <FormRow label="Μέλος *">
        <div ref={memberDropdownRef} className="relative">
          <button
            type="button"
            className="input flex items-center justify-between"
            onClick={() => setMemberDropdownOpen((v) => !v)}
          >
            <span>
              {selectedMember
                ? selectedMember.full_name ?? selectedMember.id
                : '— επίλεξε μέλος —'}
            </span>
            <span className="ml-2 text-xs opacity-70">
              {memberDropdownOpen ? '▲' : '▼'}
            </span>
          </button>

          {memberDropdownOpen && (
            <div className="absolute z-50 mt-1 w-full rounded-md border border-white/15 bg-secondary-background shadow-lg">
              <div className="p-2 border-b border-white/10">
                <input
                  autoFocus
                  className="input !h-9 !text-sm"
                  placeholder="Αναζήτηση μέλους..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>
              <div className="max-h-60 overflow-y-auto">
                {filteredMembers.length === 0 && (
                  <div className="px-3 py-2 text-xs text-text-secondary">
                    Δεν βρέθηκαν μέλη
                  </div>
                )}
                {filteredMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-white/5 ${m.id === userId ? 'bg-white/10' : ''
                      }`}
                    onClick={() => {
                      setUserId(m.id);
                      setMemberDropdownOpen(false);
                    }}
                  >
                    {m.full_name ?? m.id}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </FormRow>

      {/* 🔍 Searchable SESSION dropdown + date filter */}
      <FormRow label="Συνεδρία *">
        <div ref={sessionDropdownRef} className="relative">
          <button
            type="button"
            className="input flex items-center justify-between"
            onClick={() => setSessionDropdownOpen((v) => !v)}
          >
            <span>
              {selectedSession ? sessionLabel(selectedSession) : '— επίλεξε συνεδρία —'}
            </span>
            <span className="ml-2 text-xs opacity-70">
              {sessionDropdownOpen ? '▲' : '▼'}
            </span>
          </button>

          {sessionDropdownOpen && (
            <div className="absolute z-50 mt-1 w-full rounded-md border border-white/15 bg-secondary-background shadow-lg">
              {/* Search + Date filter row */}
              <div className="p-2 border-b border-white/10 space-y-2">
                <input
                  className="input !h-9 !text-sm"
                  placeholder="Αναζήτηση (τίτλος, ώρα)..."
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                />
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <span>Φίλτρο ημερομηνίας:</span>
                  <input
                    type="date"
                    className="input !h-8 !text-xs"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                  />
                  {sessionDate && (
                    <button
                      type="button"
                      className="px-2 py-1 rounded border border-white/20 hover:bg-white/5"
                      onClick={() => setSessionDate('')}
                    >
                      Καθαρισμός
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto">
                {filteredSessions.length === 0 && (
                  <div className="px-3 py-2 text-xs text-text-secondary">
                    Δεν βρέθηκαν συνεδρίες
                  </div>
                )}
                {filteredSessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`w-full px-3 py-2 text-left text-xs md:text-sm hover:bg-white/5 ${s.id === sessionId ? 'bg-white/10' : ''
                      }`}
                    onClick={() => {
                      setSessionId(s.id);
                      setSessionDropdownOpen(false);
                    }}
                  >
                    {sessionLabel(s)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </FormRow>

      {/* Τύπος κράτησης */}
      <FormRow label="Τύπος κράτησης">
        <select
          className="input"
          value={bookingType}
          onChange={(e) =>
            setBookingType(e.target.value as 'membership' | 'drop_in')
          }
        >
          <option value="membership">Μέλος (συνδρομή)</option>
          <option value="drop_in">Drop-in (μεμονωμένη)</option>
        </select>
      </FormRow>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Ακύρωση
        </button>
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
    const res = await supabase.functions.invoke('booking-update', {
      body: { id: row.id, status },
    });
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
