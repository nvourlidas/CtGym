import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import SessionAttendanceModal from '../../components/Programs/SessionAttendanceModal';

type GymClass = {
  id: string;
  title: string;
  class_categories?: {
    id: string;
    name: string | null;
    color: string | null;
  } | null;
};

type SessionRow = {
  id: string;
  tenant_id: string;
  class_id: string;
  starts_at: string; // ISO
  ends_at: string;   // ISO
  capacity: number | null;
  created_at: string;
  cancel_before_hours?: number | null; // 👈 NEW FIELD
};

type DateFilter = '' | 'today' | 'week' | 'month';

export default function ClassSessionsPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [qClass, setQClass] = useState<string>(''); // filter by class
  const [dateFilter, setDateFilter] = useState<DateFilter>(''); // '', 'today', 'week', 'month'
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<SessionRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  // pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // attendance history modal state
  const [attendanceSession, setAttendanceSession] = useState<SessionRow | null>(null);

  // multi-select state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);
    setError(null);

    const [cls, sess] = await Promise.all([
      supabase
        .from('classes')
        .select(`
          id,
          title,
          class_categories (
            id,
            name,
            color
          )
        `)
        .eq('tenant_id', profile.tenant_id)
        .order('title'),
      supabase
        .from('class_sessions')
        .select(
          'id, tenant_id, class_id, starts_at, ends_at, capacity, created_at, cancel_before_hours'
        ) // 👈 include cancel_before_hours
        .eq('tenant_id', profile.tenant_id)
        .order('starts_at', { ascending: false }), // latest first
    ]);

    if (!cls.error) {
      const list: GymClass[] = (cls.data as any[] ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        class_categories: Array.isArray(row.class_categories)
          ? row.class_categories[0] ?? null
          : row.class_categories ?? null,
      }));
      setClasses(list);
    }

    if (!sess.error) setRows((sess.data as SessionRow[]) ?? []);

    if (cls.error || sess.error) {
      setError(cls.error?.message ?? sess.error?.message ?? null);
    }

    // clear selection after reload
    setSelectedIds([]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [profile?.tenant_id]);

  const filtered = useMemo(() => {
    let list = rows;

    if (qClass) {
      list = list.filter((r) => r.class_id === qClass);
    }

    if (dateFilter) {
      const now = new Date();
      let start: Date | null = null;
      let end: Date | null = null;

      if (dateFilter === 'today') {
        start = startOfDay(now);
        end = new Date(start);
        end.setDate(end.getDate() + 1);
      } else if (dateFilter === 'week') {
        start = startOfWeek(now); // Monday–Sunday
        end = new Date(start);
        end.setDate(end.getDate() + 7);
      } else if (dateFilter === 'month') {
        start = startOfMonth(now);
        end = new Date(start);
        end.setMonth(end.getMonth() + 1);
      }

      if (start && end) {
        list = list.filter((r) => {
          const d = new Date(r.starts_at);
          return d >= start! && d < end!;
        });
      }
    }

    return list;
  }, [rows, qClass, dateFilter]);

  // reset page when filters / page size change
  useEffect(() => {
    setPage(1);
  }, [qClass, dateFilter, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const startIdx = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(filtered.length, page * pageSize);

  const getClass = (id: string) => classes.find((c) => c.id === id);

  const pageIds = paginated.map((s) => s.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  // bulk delete selected sessions
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (
      !confirm(
        `Διαγραφή ${selectedIds.length} συνεδριών; Αυτή η ενέργεια δεν μπορεί να ακυρωθεί.`
      )
    )
      return;

    setBulkDeleting(true);
    setError(null);
    try {
      const results = await Promise.all(
        selectedIds.map((id) =>
          supabase.functions.invoke('session-delete', { body: { id } })
        )
      );
      const firstError = results.find(
        (r) => r.error || (r.data as any)?.error
      );
      if (firstError) {
        setError(
          firstError.error?.message ??
            (firstError.data as any)?.error ??
            'Η ομαδική διαγραφή είχε σφάλματα.'
        );
      } else {
        setError(null);
      }
      await load();
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <select
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm"
          value={qClass}
          onChange={(e) => setQClass(e.target.value)}
        >
          <option value="">Όλα τα τμήματα</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>

        {/* Date preset filters */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            active={dateFilter === ''}
            label="Όλες οι ημερομηνίες"
            onClick={() => setDateFilter('')}
          />
          <FilterChip
            active={dateFilter === 'today'}
            label="Σήμερα"
            onClick={() => setDateFilter('today')}
          />
          <FilterChip
            active={dateFilter === 'week'}
            label="Αυτή την εβδομάδα"
            onClick={() => setDateFilter('week')}
          />
          <FilterChip
            active={dateFilter === 'month'}
            label="Αυτόν τον μήνα"
            onClick={() => setDateFilter('month')}
          />
        </div>

        <button
          className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-accent/90 text-white hover:text-black cursor-pointer"
          onClick={() => setShowCreate(true)}
        >
          Νέα Συνεδρία
        </button>

        <button
          className="h-9 rounded-md px-3 text-sm border border-danger/50 text-danger hover:bg-danger/10 disabled:opacity-40"
          disabled={selectedIds.length === 0 || bulkDeleting}
          onClick={handleBulkDelete}
        >
          {bulkDeleting
            ? 'Διαγραφή επιλεγμένων…'
            : `Διαγραφή επιλεγμένων (${selectedIds.length})`}
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
              <Th className="w-8">
                <input
                  type="checkbox"
                  className="
                    h-4 w-4
                    rounded-sm
                    border border-white/30
                    bg-transparent
                    accent-primary
                    transition
                    focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-0
                    hover:border-primary/70
                    cursor-pointer
                  "
                  checked={allPageSelected && pageIds.length > 0}
                  onChange={() => {
                    setSelectedIds((prev) => {
                      const allSelectedOnPage =
                        pageIds.length > 0 &&
                        pageIds.every((id) => prev.includes(id));
                      if (allSelectedOnPage) {
                        // unselect page
                        return prev.filter((id) => !pageIds.includes(id));
                      }
                      // select all on page
                      const next = new Set(prev);
                      pageIds.forEach((id) => next.add(id));
                      return Array.from(next);
                    });
                  }}
                />
              </Th>
              <Th>Τμήμα</Th>
              <Th>Έναρξη</Th>
              <Th>Λήξη</Th>
              <Th>Χωρητικότητα</Th>
              <Th>Ακύρωση έως (ώρες)</Th> {/* NEW column */}
              <Th className="text-right pr-3">Ενέργειες</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-4 opacity-60" colSpan={7}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td className="px-3 py-4 opacity-60" colSpan={7}>
                  No sessions
                </td>
              </tr>
            )}
            {!loading &&
              filtered.length > 0 &&
              paginated.map((s) => {
                const cls = getClass(s.class_id);
                return (
                  <tr
                    key={s.id}
                    className="border-t border-white/10 hover:bg-secondary/10"
                  >
                    <Td className="w-8">
                      <input
                        type="checkbox"
                        className="
                          h-4 w-4
                          rounded-sm
                          border border-white/30
                          bg-transparent
                          accent-primary
                          transition
                          focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-0
                          hover:border-primary/70
                          cursor-pointer
                        "
                        checked={selectedIds.includes(s.id)}
                        onChange={() =>
                          setSelectedIds((prev) =>
                            prev.includes(s.id)
                              ? prev.filter((id) => id !== s.id)
                              : [...prev, s.id]
                          )
                        }
                      />
                    </Td>
                    <Td className="font-medium">
                      <div className="flex flex-col gap-1">
                        <span>{cls?.title ?? '—'}</span>
                        <span>
                          {cls?.class_categories ? (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-white/5">
                              {cls.class_categories.color && (
                                <span
                                  className="inline-block h-2 w-2 rounded-full border border-white/20"
                                  style={{
                                    backgroundColor: cls.class_categories.color,
                                  }}
                                />
                              )}
                              <span>{cls.class_categories.name}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-text-secondary">
                              —
                            </span>
                          )}
                        </span>
                      </div>
                    </Td>
                    <Td>{formatDateTime(s.starts_at)}</Td>
                    <Td>{s.ends_at ? formatDateTime(s.ends_at) : '—'}</Td>
                    <Td>{s.capacity ?? '—'}</Td>
                    <Td>
                      {s.cancel_before_hours != null
                        ? s.cancel_before_hours
                        : '—'}
                    </Td>
                    <Td className="text-right space-x-1">
                      <button
                        className="px-2 py-1 text-xs rounded border border-white/10 hover:bg-secondary/10"
                        onClick={() => setAttendanceSession(s)}
                      >
                        Ιστορικό
                      </button>
                      <button
                        className="px-2 py-1 text-xs rounded hover:bg-secondary/10"
                        onClick={() => setEditRow(s)}
                      >
                        Επεξεργασία
                      </button>
                      <DeleteButton
                        id={s.id}
                        onDeleted={load}
                        setError={setError}
                      />
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
              {filtered.length > 0 && (
                <>
                  –<span className="font-semibold">{endIdx}</span>
                </>
              )}{' '}
              από <span className="font-semibold">{filtered.length}</span>
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
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page === pageCount}
                >
                  Επόμενο
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit / Attendance modals */}
      {showCreate && (
        <CreateSessionModal
          classes={classes}
          tenantId={profile?.tenant_id!}
          onClose={() => {
            setShowCreate(false);
            load();
          }}
          setError={setError}
        />
      )}
      {editRow && (
        <EditSessionModal
          row={editRow}
          classes={classes}
          onClose={() => {
            setEditRow(null);
            load();
          }}
          setError={setError}
        />
      )}
      {attendanceSession && profile?.tenant_id && (
        <SessionAttendanceModal
          tenantId={profile.tenant_id}
          sessionId={attendanceSession.id}
          sessionTitle={getClass(attendanceSession.class_id)?.title ?? '—'}
          sessionTime={`${formatDate(attendanceSession.starts_at)} • ${formatTime(
            attendanceSession.starts_at
          )}${
            attendanceSession.ends_at
              ? '–' + formatTime(attendanceSession.ends_at)
              : ''
          }`}
          onClose={() => setAttendanceSession(null)}
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

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 h-8 rounded-full text-xs font-medium transition
        border
        ${
          active
            ? 'bg-accent text-black border-black'
            : 'bg-secondary-background text-text-secondary border-white/10 hover:border-white/30'
        }`}
    >
      {label}
    </button>
  );
}

function DeleteButton({
  id,
  onDeleted,
  setError,
}: {
  id: string;
  onDeleted: () => void;
  setError: (s: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (
      !confirm('Διαγραφή αυτής της συνεδρίας; Αυτή η ενέργεια δεν μπορεί να ακυρωθεί.')
    )
      return;
    setBusy(true);
    const res = await supabase.functions.invoke('session-delete', { body: { id } });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? 'Η διαγραφή απέτυχε');
    } else if ((res.data as any)?.error) {
      setError((res.data as any).error);
    } else {
      setError(null);
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

/* Create / Edit modals + helpers */

function CreateSessionModal({
  classes,
  tenantId,
  onClose,
  setError,
}: {
  classes: GymClass[];
  tenantId: string;
  onClose: () => void;
  setError: (s: string | null) => void;
}) {
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [date, setDate] = useState<string>(''); // yyyy-mm-dd
  const [startTime, setStartTime] = useState<string>(''); // HH:MM
  const [endTime, setEndTime] = useState<string>(''); // HH:MM
  const [capacity, setCapacity] = useState<number>(20);
  const [cancelBeforeHours, setCancelBeforeHours] = useState<string>(''); // 👈 NEW
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!classId || !date || !startTime || !endTime) {
      alert('Συμπληρώστε τμήμα, ημερομηνία, ώρα έναρξης και ώρα λήξης.');
      return;
    }

    const startsIso = new Date(`${date}T${startTime}`).toISOString();
    const endsIso = new Date(`${date}T${endTime}`).toISOString();

    if (new Date(endsIso) <= new Date(startsIso)) {
      alert('Η ώρα λήξης πρέπει να είναι μετά την ώρα έναρξης.');
      return;
    }

    setBusy(true);
    const res = await supabase.functions.invoke('session-create', {
      body: {
        tenant_id: tenantId,
        class_id: classId,
        starts_at: startsIso,
        ends_at: endsIso,
        capacity,
        cancel_before_hours:
          cancelBeforeHours !== '' ? Number(cancelBeforeHours) : null, // 👈 pass to function
      },
    });
    setBusy(false);
    if (res.error || (res.data as any)?.error) {
      setError(res.error?.message ?? (res.data as any)?.error ?? 'Create failed');
      return;
    }
    setError(null);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Νέα Συνεδρία">
      <FormRow label="Τμήμα *">
        <select
          className="input"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </FormRow>

      <FormRow label="Ημερομηνία *">
        <input
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </FormRow>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormRow label="Ώρα Έναρξης *">
          <input
            className="input"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </FormRow>
        <FormRow label="Ώρα Λήξης *">
          <input
            className="input"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </FormRow>
      </div>

      <FormRow label="Χωρητικότητα">
        <input
          className="input"
          type="number"
          min={0}
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
        />
      </FormRow>

      <FormRow label="Ακύρωση έως (ώρες πριν)">
        <input
          className="input"
          type="number"
          min={0}
          value={cancelBeforeHours}
          onChange={(e) => setCancelBeforeHours(e.target.value)}
        />
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

function EditSessionModal({
  row,
  classes,
  onClose,
  setError,
}: {
  row: SessionRow;
  classes: GymClass[];
  onClose: () => void;
  setError: (s: string | null) => void;
}) {
  const [classId, setClassId] = useState(row.class_id);
  const [date, setDate] = useState<string>(() => isoToDateInput(row.starts_at));
  const [startTime, setStartTime] = useState<string>(() =>
    isoToTimeInput(row.starts_at)
  );
  const [endTime, setEndTime] = useState<string>(() =>
    isoToTimeInput(row.ends_at)
  );
  const [capacity, setCapacity] = useState<number>(row.capacity ?? 20);
  const [cancelBeforeHours, setCancelBeforeHours] = useState<string>(
    row.cancel_before_hours != null ? String(row.cancel_before_hours) : ''
  ); // 👈 NEW
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!classId || !date || !startTime || !endTime) {
      alert('Συμπληρώστε τμήμα, ημερομηνία, ώρα έναρξης και ώρα λήξης.');
      return;
    }

    const startsIso = new Date(`${date}T${startTime}`).toISOString();
    const endsIso = new Date(`${date}T${endTime}`).toISOString();

    if (new Date(endsIso) <= new Date(startsIso)) {
      alert('Η ώρα λήξης πρέπει να είναι μετά την ώρα έναρξης.');
      return;
    }

    setBusy(true);
    const res = await supabase.functions.invoke('session-update', {
      body: {
        id: row.id,
        class_id: classId,
        starts_at: startsIso,
        ends_at: endsIso,
        capacity,
        cancel_before_hours:
          cancelBeforeHours !== '' ? Number(cancelBeforeHours) : null, // 👈 pass to function
      },
    });
    setBusy(false);
    if (res.error || (res.data as any)?.error) {
      setError(res.error?.message ?? (res.data as any)?.error ?? 'Save failed');
      return;
    }
    setError(null);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Επεξεργασία Συνεδρίας">
      <FormRow label="Τμήμα *">
        <select
          className="input"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </FormRow>

      <FormRow label="Ημερομηνία *">
        <input
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </FormRow>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormRow label="Ώρα Έναρξης *">
          <input
            className="input"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </FormRow>
        <FormRow label="Ώρα Λήξης *">
          <input
            className="input"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </FormRow>
      </div>

      <FormRow label="Χωρητικότητα">
        <input
          className="input"
          type="number"
          min={0}
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
        />
      </FormRow>

      <FormRow label="Ακύρωση έως (ώρες πριν)">
        <input
          className="input"
          type="number"
          min={0}
          value={cancelBeforeHours}
          onChange={(e) => setCancelBeforeHours(e.target.value)}
        />
      </FormRow>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Ακύρωση
        </button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Αποθήκευση...' : 'Αποθήκευση'}
        </button>
      </div>
    </Modal>
  );
}

/* helpers */

function isoToDateInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

function isoToTimeInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${hh}:${mi}`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${hh}:${mi}`;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date) {
  // Monday as first day of week
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun,1=Mon,...6=Sat
  const diff = (day + 6) % 7; // 0 for Mon, 1 for Tue, ...
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

/* small UI helpers */
function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-md border border-white/10 bg-secondary-background text-text-primary shadow-xl">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="rounded px-2 py-1 hover:bg-white/5">
            ✕
          </button>
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
