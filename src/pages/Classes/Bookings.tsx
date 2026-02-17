import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import type { LucideIcon } from 'lucide-react';
import { Pencil, Trash2, Loader2, Plus } from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';
import SessionPickerModal from '../../components/bookings/SessionPickerModal';


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
  booking_type?: 'membership' | 'drop_in' | string | null;
  drop_in_price?: number | null;
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

/* ---- Friendly error translator --------------------------------------- */
function translateErrorMessage(raw: string): string {
  if (!raw) return 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.';

  if (raw.includes('no_eligible_membership_for_booking')) {
    return 'Δεν έχει το κατάλληλο πλάνο για αυτό το μάθημα.';
  }

  if (raw.includes('Edge Function returned a non-2xx status code')) {
    return 'Δεν έχει το κατάλληλο πλάνο για αυτό το μάθημα.';
  }

  if (raw.includes('drop_in_debt_limit_exceeded')) {
    return 'Το μέλος έχει ξεπεράσει το επιτρεπτό όριο οφειλής για drop-in.';
  }

  return raw;
}

export default function BookingsPage() {
  const { profile, subscription } = useAuth();
  const [showSubModal, setShowSubModal] = useState(false);
  const [rows, setRows] = useState<Booking[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Booking | null>(null);


  // global error modal
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);
  const handleError = (title: string, message: string) => {
    setErrorModal({ title, message: translateErrorMessage(message) });
  };

  // filters
  const [classFilter, setClassFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('today');
  const [customDate, setCustomDate] = useState<string>(''); // yyyy-mm-dd
  const [bookingTypeFilter, setBookingTypeFilter] = useState<string>('');

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);


  const subscriptionInactive = !subscription?.is_active;

  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) {
      setShowSubModal(true);
      return;
    }
    action();
  }

  async function load() {
    if (!profile?.tenant_id) return;

    setLoading(true);
    setError(null);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Base query
    let query = supabase
      .from("bookings_list")
      .select(
        `
    id, tenant_id, session_id, user_id, status, created_at,
    booking_type, drop_in_price,
    member_full_name,
    starts_at, ends_at, capacity,
    class_id, class_title,
    category_name, category_color
  `,
        { count: "exact" }
      )
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false });


    // Server-side filters (IMPORTANT: these reduce count too)
    if (classFilter) query = query.eq("class_id", classFilter);
    if (statusFilter) query = query.eq("status", statusFilter);
    if (bookingTypeFilter) query = query.eq("booking_type", bookingTypeFilter);

    if (dateFilterMode === "today" || (dateFilterMode === "custom" && customDate)) {
      const base = dateFilterMode === "today"
        ? new Date().toISOString().slice(0, 10)
        : customDate;
      query = query.gte("starts_at", `${base}T00:00:00.000Z`).lte("starts_at", `${base}T23:59:59.999Z`);
    }


    const needle = q.trim();
    if (needle) {
      query = query.or(
        `member_full_name.ilike.%${needle}%,class_title.ilike.%${needle}%,category_name.ilike.%${needle}%,status.ilike.%${needle}%`
      );
    }


    const { data, error, count } = await query.range(from, to);

    if (error) {
      // fallback bare (still paginated)
      const { data: bare, error: e2, count: c2 } = await supabase
        .from("bookings")
        .select(
          "id, tenant_id, session_id, user_id, status, created_at, booking_type, drop_in_price",
          { count: "exact" }
        )
        .eq("tenant_id", profile.tenant_id)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (e2) {
        setError(e2.message);
        handleError("Σφάλμα φόρτωσης κρατήσεων", e2.message);
        setRows([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }

      setRows(((bare as any[]) ?? []).map((b) => ({ ...b, profile: null, session: null })));
      setTotalCount(c2 ?? 0);
      setLoading(false);
      return;
    }

    const mapped = ((data as any[]) ?? []).map((r) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      session_id: r.session_id,
      user_id: r.user_id,
      status: r.status,
      created_at: r.created_at,
      booking_type: r.booking_type ?? "membership",
      drop_in_price: r.drop_in_price ?? null,
      profile: r.member_full_name ? { id: r.user_id, full_name: r.member_full_name } : null,
      session: r.starts_at
        ? {
          id: r.session_id,
          starts_at: r.starts_at,
          ends_at: r.ends_at,
          capacity: r.capacity,
          classes: r.class_id
            ? {
              id: r.class_id,
              title: r.class_title ?? "—",
              class_categories: r.category_name
                ? { name: r.category_name, color: r.category_color ?? null }
                : null,
            }
            : null,
        }
        : null,
    }));

    setRows(mapped);
    setTotalCount(count ?? 0);
    setLoading(false);
  }


  useEffect(() => {
    load();
  }, [
    profile?.tenant_id,
    page,
    pageSize,
    classFilter,
    statusFilter,
    bookingTypeFilter,
    dateFilterMode,
    customDate,
    q,
  ]);



  const [classOptions, setClassOptions] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    (async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, title")
        .eq("tenant_id", profile.tenant_id)
        .order("title", { ascending: true });

      if (!error) {
        setClassOptions(((data as any[]) ?? []).map((c) => ({ id: c.id, title: c.title })));
      }
    })();
  }, [profile?.tenant_id]);



  useEffect(() => {
    setPage(1);
  }, [q, pageSize, classFilter, statusFilter, bookingTypeFilter, dateFilterMode, customDate]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIdx = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(totalCount, page * pageSize);


  return (
    <div className="p-4 md:p-6">
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          className="h-9 w-full sm:w-64 rounded-md border border-border/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
          placeholder="Αναζήτηση κρατήσεων…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select
          className="h-9 w-full sm:w-auto rounded-md border border-border/10 bg-secondary-background px-3 text-sm"
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
        >
          <option value="">Όλα τα τμήματα</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>

        <select
          className="h-9 w-full sm:w-auto rounded-md border border-border/10 bg-secondary-background px-3 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Όλες οι καταστάσεις</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          className="h-9 w-full sm:w-auto rounded-md border border-border/10 bg-secondary-background px-3 text-sm"
          value={bookingTypeFilter}
          onChange={(e) => setBookingTypeFilter(e.target.value)}
        >
          <option value="">Όλοι οι τύποι</option>
          <option value="membership">Μέλος</option>
          <option value="drop_in">Drop-in</option>
        </select>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select
            className="h-9 w-full sm:w-auto rounded-md border border-border/10 bg-secondary-background px-3 text-sm"
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
              className="h-9 w-full sm:w-auto rounded-md border border-border/10 bg-secondary-background px-3 text-sm"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
            />
          )}
        </div>

        <button
          className="mt-1 sm:mt-0 h-9 w-full sm:w-auto rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white flex items-center justify-center gap-2 sm:ml-auto"
          onClick={() => requireActiveSubscription(() => setShowCreate(true))}
        >
          <Plus className="w-4 h-4" />
          <span>Νέα Κράτηση</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">
          {error}
        </div>
      )}

      <div className="rounded-md border border-border/10 overflow-hidden">
        {/* Loading / empty states */}
        {loading && (
          <div className="px-3 py-4 text-sm opacity-60">Loading…</div>
        )}
        {!loading && rows.length === 0 && (
          <div className="px-3 py-4 text-sm opacity-60">No bookings</div>
        )}

        {/* Content when there are rows */}
        {!loading && rows.length > 0 && (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/10">
              {rows.map((b) => {
                const isDropIn = (b.booking_type ?? 'membership') === 'drop_in';
                const title = b.session?.classes?.title ?? '—';
                const startLabel = b.session?.starts_at
                  ? formatDateTime(b.session.starts_at)
                  : '—';

                return (
                  <div key={b.id} className="p-3 bg-secondary-background/60">
                    {/* Top: member + actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">
                          {b.profile?.full_name ?? b.user_id}
                        </div>
                        <div className="mt-1 text-[12px] text-text-secondary">
                          {title} · {startLabel}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <IconButton
                          icon={Pencil}
                          label="Επεξεργασία κράτησης"
                          onClick={() => requireActiveSubscription(() => setEditRow(b))}
                        />
                        <DeleteButton
                          id={b.id}
                          onDeleted={load}
                          onError={handleError}
                          guard={() => {
                            if (subscriptionInactive) {
                              setShowSubModal(true);
                              return false;
                            }
                            return true;
                          }}
                        />
                      </div>
                    </div>

                    {/* End time */}
                    {b.session?.ends_at && (
                      <div className="mt-1 text-[11px] text-text-secondary">
                        Λήξη: {formatDateTime(b.session.ends_at)}
                      </div>
                    )}

                    {/* Category */}
                    <div className="mt-2">
                      {b.session?.classes?.class_categories ? (
                        <span className="inline-flex items-center gap-2 text-[11px] px-2 py-1 rounded-full bg-white/5">
                          {b.session.classes.class_categories.color && (
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full border border-border/20"
                              style={{
                                backgroundColor:
                                  b.session.classes.class_categories.color,
                              }}
                            />
                          )}
                          <span>{b.session.classes.class_categories.name}</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-text-secondary">
                          Χωρίς κατηγορία
                        </span>
                      )}
                    </div>

                    {/* Status + type */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {renderStatusBadge(b.status)}
                      <span
                        className={
                          'inline-flex items-center rounded-full px-2 py-0.5 border text-[11px] ' +
                          (isDropIn
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300')
                        }
                      >
                        {isDropIn ? 'Drop-in' : 'Μέλος'}
                      </span>
                      {isDropIn && b.drop_in_price != null && (
                        <span className="text-[11px] opacity-80">
                          {b.drop_in_price.toFixed(2)}€
                        </span>
                      )}
                    </div>

                    {/* Created date */}
                    <div className="mt-2 text-[11px] text-text-secondary flex justify-between">
                      <span>Ημερ. Δημιουργίας:</span>
                      <span className="text-text-primary">
                        {formatDateDMY(b.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-225 w-full text-sm">
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
                  {rows.map((b) => {
                    const isDropIn = (b.booking_type ?? 'membership') === 'drop_in';
                    return (
                      <tr
                        key={b.id}
                        className="border-t border-border/10 hover:bg-secondary/10"
                      >
                        <Td>{b.profile?.full_name ?? b.user_id}</Td>
                        <Td>
                          <div className="flex flex-col gap-1">
                            <span>
                              {b.session?.classes?.title ?? '—'}
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
                                  className="inline-block h-2.5 w-2.5 rounded-full border border-border/20"
                                  style={{
                                    backgroundColor:
                                      b.session.classes.class_categories.color,
                                  }}
                                />
                              )}
                              <span>
                                {b.session.classes.class_categories.name}
                              </span>
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
                                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500')
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
                        <Td className="text-right space-x-1 pr-3">
                          <IconButton
                            icon={Pencil}
                            label="Επεξεργασία"
                            onClick={() => requireActiveSubscription(() => setEditRow(b))}
                          />
                          <DeleteButton
                            id={b.id}
                            onDeleted={load}
                            onError={handleError}
                            guard={() => {
                              if (subscriptionInactive) {
                                setShowSubModal(true);
                                return false;
                              }
                              return true;
                            }}
                          />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 py-2 text-xs text-text-secondary border-t border-border/10">
              <div>
                Εμφάνιση <span className="font-semibold">{startIdx}</span>
                {totalCount > 0 && (
                  <>
                    –<span className="font-semibold">{endIdx}</span>
                  </>
                )}{' '}
                από <span className="font-semibold">{totalCount}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <span>Γραμμές ανά σελίδα:</span>
                  <select
                    className="bg-transparent border border-border/10 rounded px-1 py-0.5"
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
                    className="px-2 py-1 rounded border border-border/10 disabled:opacity-40"
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
                    className="px-2 py-1 rounded border border-border/10 disabled:opacity-40"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={page === pageCount}
                  >
                    Επόμενο
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <CreateBookingModal
          tenantId={profile?.tenant_id!}
          onClose={() => {
            setShowCreate(false);
            load();
          }}
          onError={handleError}
        />
      )}
      {editRow && (
        <EditBookingModal
          row={editRow}
          onClose={() => {
            setEditRow(null);
            load();
          }}
          onError={handleError}
        />
      )}

      {/* Global error modal */}
      {errorModal && (
        <Modal title={errorModal.title} onClose={() => setErrorModal(null)}>
          <p className="text-sm whitespace-pre-line">{errorModal.message}</p>
          <div className="mt-4 flex justify-end">
            <button className="btn-primary" onClick={() => setErrorModal(null)}>
              ΟΚ
            </button>
          </div>
        </Modal>
      )}

      <SubscriptionRequiredModal
        open={showSubModal}
        onClose={() => setShowSubModal(false)}
      />
    </div>
  );
}

function Th({ children, className = '' }: any) {
  return <th className={`px-3 py-2 font-semibold ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: any) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}

/* Icon ghost button */
function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/10 hover:bg-secondary/20 disabled:opacity-50"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
      <span className="sr-only">{label}</span>
    </button>
  );
}

/* Delete button with icon */
function DeleteButton({
  id,
  onDeleted,
  onError,
  guard
}: {
  id: string;
  onDeleted: () => void;
  onError: (title: string, message: string) => void;
  guard: () => boolean;
}) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (guard && !guard()) return;
    if (
      !confirm(
        'Διαγραφή αυτής της κράτησης; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.',
      )
    )
      return;
    setBusy(true);
    const res = await supabase.functions.invoke('booking-delete', { body: { id } });
    setBusy(false);
    const errMsg = (res.data as any)?.error ?? res.error?.message ?? '';
    if (res.error || (res.data as any)?.error) {
      onError('Σφάλμα διαγραφής κράτησης', errMsg || 'Η διαγραφή απέτυχε.');
    } else {
      onDeleted();
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label="Διαγραφή κράτησης"
      title="Διαγραφή κράτησης"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/60 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
      <span className="sr-only">Διαγραφή</span>
    </button>
  );
}

/* Create / Edit modals – unchanged below */

function CreateBookingModal({
  tenantId,
  onClose,
  onError,
}: {
  tenantId: string;
  onClose: () => void;
  onError: (title: string, message: string) => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [userId, setUserId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [bookingType, setBookingType] = useState<'membership' | 'drop_in'>('membership');
  const [busy, setBusy] = useState(false);

  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const memberDropdownRef = useRef<HTMLDivElement | null>(null);

  const [sessionDropdownOpen, setSessionDropdownOpen] = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionDate, setSessionDate] = useState(''); // yyyy-mm-dd
  const sessionDropdownRef = useRef<HTMLDivElement | null>(null);

  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  useEffect(() => {
    if (!sessionPickerOpen) return;
    // αν θες, μπορείς να βάλεις default date = σήμερα:
    // setSessionDate(new Date().toISOString().slice(0, 10));
  }, [sessionPickerOpen]);

  useEffect(() => {
    (async () => {
      const { data: m, error: mErr } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('tenant_id', tenantId)
        .eq('role', 'member')
        .order('full_name', { ascending: true });

      if (mErr) {
        onError('Σφάλμα φόρτωσης μελών', mErr.message);
      }
      setMembers((m as any[]) ?? []);

      const { data: s, error: sErr } = await supabase
        .from('class_sessions')
        .select(
          'id, starts_at, ends_at, capacity, classes(id, title, class_categories(name, color))',
        )
        .eq('tenant_id', tenantId)
        .order('starts_at', { ascending: true });

      if (sErr) {
        onError('Σφάλμα φόρτωσης συνεδριών', sErr.message);
      }
      setSessions((s as any[]) ?? []);
    })();
  }, [tenantId, onError]);

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

  const filteredMembers = members.filter((m) => {
    const needle = memberSearch.toLowerCase();
    if (!needle) return true;
    return (
      (m.full_name ?? '').toLowerCase().includes(needle) ||
      m.id.toLowerCase().includes(needle)
    );
  });
  const selectedMember = members.find((m) => m.id === userId);

  // const filteredSessions = sessions.filter((s) => {
  //   const needle = sessionSearch.toLowerCase();
  //   const title = (s.classes?.title ?? '').toLowerCase();
  //   const dateLabel = formatDateTime(s.starts_at).toLowerCase();
  //   const matchesText = !needle || title.includes(needle) || dateLabel.includes(needle);

  //   if (sessionDate) {
  //     const d = new Date(s.starts_at);
  //     if (Number.isNaN(d.getTime())) return false;
  //     const iso = d.toISOString().slice(0, 10);
  //     if (iso !== sessionDate) return false;
  //   }

  //   return matchesText;
  // });
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
    if (!userId || !sessionId) {
      onError('Ελλιπή στοιχεία', 'Πρέπει να επιλέξετε μέλος και συνεδρία.');
      return;
    }
    setBusy(true);
    const res = await supabase.functions.invoke('booking-create', {
      body: {
        tenant_id: tenantId,
        user_id: userId,
        session_id: sessionId,
        booking_type: bookingType,
      },
    });
    setBusy(false);
    const errMsg = (res.data as any)?.error ?? res.error?.message ?? '';
    if (res.error || (res.data as any)?.error) {
      onError('Σφάλμα δημιουργίας κράτησης', errMsg || 'Η δημιουργία απέτυχε.');
      return;
    }
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Νέα κράτηση">
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
            <div className="absolute z-50 mt-1 w-full rounded-md border border-border/15 bg-secondary-background shadow-lg">
              <div className="p-2 border-b border-border/10">
                <input
                  autoFocus
                  className="input h-9! text-sm!"
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

      <FormRow label="Συνεδρία *">
        <div className="space-y-2">
          <button
            type="button"
            className="input flex items-center justify-between"
            onClick={() => setSessionPickerOpen(true)}
          >
            <span className="truncate">
              {selectedSession ? sessionLabel(selectedSession) : '— επίλεξε συνεδρία —'}
            </span>
            <span className="ml-2 text-xs opacity-70">🔎</span>
          </button>

          {selectedSession?.ends_at && (
            <div className="text-xs text-text-secondary">
              Λήξη: {formatDateTime(selectedSession.ends_at)}
            </div>
          )}

          {selectedSession?.classes?.class_categories?.name && (
            <div className="text-xs text-text-secondary flex items-center gap-2">
              {selectedSession?.classes?.class_categories?.color && (
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border border-border/20"
                  style={{ backgroundColor: selectedSession.classes.class_categories.color }}
                />
              )}
              <span>{selectedSession.classes.class_categories.name}</span>
            </div>
          )}
        </div>

        {sessionPickerOpen && (
          <SessionPickerModal
            title="Επιλογή συνεδρίας"
            sessions={sessions}
            selectedSessionId={sessionId}
            initialSearch={sessionSearch}
            initialDate={sessionDate}
            onClose={() => setSessionPickerOpen(false)}
            onPick={(picked) => {
              setSessionId(picked.id);
            }}
            onChangeFilters={({ search, date }) => {
              setSessionSearch(search);
              setSessionDate(date);
            }}
          />
        )}
      </FormRow>

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

function EditBookingModal({
  row,
  onClose,
  onError,
}: {
  row: Booking;
  onClose: () => void;
  onError: (title: string, message: string) => void;
}) {
  const [status, setStatus] = useState<StatusCode>(
    (row.status as StatusCode) ?? 'booked',
  );
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const res = await supabase.functions.invoke('booking-update', {
      body: { id: row.id, status },
    });
    setBusy(false);
    const errMsg = (res.data as any)?.error ?? res.error?.message ?? '';
    if (res.error || (res.data as any)?.error) {
      onError('Σφάλμα ενημέρωσης κράτησης', errMsg || 'Η αποθήκευση απέτυχε.');
      return;
    }
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Επεξεργασία Κράτησης">
      <FormRow label="Κατάσταση">
        <select
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusCode)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
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

/* UI helpers */
function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-md border border-border/10 bg-secondary-background text-text-primary shadow-xl">
        <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 hover:bg-white/5"
          >
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
      cls += ' border-sky-500/40 bg-sky-500/10 text-sky-500';
      break;
    case 'checked_in':
      label = 'Παρουσία';
      cls += ' border-emerald-500/40 bg-emerald-500/10 text-emerald-500';
      break;
    case 'canceled':
      label = 'Ακυρώθηκε';
      cls += ' border-rose-500/40 bg-rose-500/10 text-rose-500';
      break;
    case 'no_show':
      label = 'Δεν προσήλθε';
      cls += ' border-amber-500/40 bg-accent/10 text-accent';
      break;
  }

  return <span className={cls}>{label}</span>;
}
