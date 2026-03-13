import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import type { LucideIcon } from 'lucide-react';
import {
  Pencil, Trash2, Loader2, Plus, Search, ChevronDown,
  ChevronLeft, ChevronRight, AlertTriangle, CalendarDays,
  Check, X, BookOpen, User, Clock,
} from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';
import SessionPickerModal from '../../components/bookings/SessionPickerModal';

type Member = { id: string; full_name: string | null };
type SessionRow = {
  id: string; starts_at: string; ends_at: string | null; capacity: number | null;
  classes?: { id: string; title: string; class_categories?: { name: string; color: string | null } | null } | null;
};
type Booking = {
  id: string; tenant_id: string; session_id: string; user_id: string;
  status: string | null; created_at: string;
  booking_type?: 'membership' | 'drop_in' | string | null;
  drop_in_price?: number | null;
  profile?: Member | null; session?: SessionRow | null;
};
type StatusCode = 'booked' | 'checked_in' | 'canceled' | 'no_show';
type DateFilterMode = 'all' | 'today' | 'custom';

const STATUS_OPTIONS: { value: StatusCode; label: string }[] = [
  { value: 'booked', label: 'Κρατήθηκε' },
  { value: 'checked_in', label: 'Παρουσία' },
  { value: 'canceled', label: 'Ακυρώθηκε' },
  { value: 'no_show', label: 'Δεν προσήλθε' },
];

const STATUS_STYLE: Record<StatusCode, string> = {
  booked: 'border-sky-500/40 bg-sky-500/10 text-sky-500',
  checked_in: 'border-success/40 bg-success/10 text-success',
  canceled: 'border-danger/40 bg-danger/10 text-danger',
  no_show: 'border-warning/40 bg-warning/10 text-warning',
};
const STATUS_LABEL: Record<StatusCode, string> = {
  booked: 'Κρατήθηκε', checked_in: 'Παρουσία', canceled: 'Ακυρώθηκε', no_show: 'Δεν προσήλθε',
};

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? 'booked') as StatusCode;
  return <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-lg border ${STATUS_STYLE[s] ?? ''}`}>{STATUS_LABEL[s] ?? s}</span>;
}

function translateErrorMessage(raw: string): string {
  if (!raw) return 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.';
  if (raw.includes('no_eligible_membership_for_booking') || raw.includes('Edge Function returned a non-2xx status code')) return 'Δεν έχει το κατάλληλο πλάνο για αυτό το μάθημα.';
  if (raw.includes('drop_in_debt_limit_exceeded')) return 'Το μέλος έχει ξεπεράσει το επιτρεπτό όριο οφειλής για drop-in.';
  return raw;
}

function formatDateDMY(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}
function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ── Shared UI ─────────────────────────────────────────────────────────────

function StyledSelect({ value, onChange, children, className = '' }: { value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <select className="w-full h-9 pl-3.5 pr-9 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary appearance-none outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">{label}</label>
      {children}
    </div>
  );
}

function ModalShell({ title, icon, onClose, children, footer }: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-2xl overflow-hidden" style={{ animation: 'bookingModalIn 0.2s ease' }}>
        <div className="h-0.75 w-full bg-linear-to-r from-primary/0 via-primary to-primary/0" />
        <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
              {icon ?? <BookOpen className="h-4 w-4 text-primary" />}
            </div>
            <h2 className="font-black text-text-primary tracking-tight">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl border border-border/10 hover:bg-secondary/30 text-text-secondary hover:text-text-primary transition-all cursor-pointer shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 max-h-[72vh] overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-border/10 flex justify-end gap-2">{footer}</div>}
      </div>
      <style>{`@keyframes bookingModalIn { from { opacity:0; transform:translateY(16px) scale(0.98); } to { opacity:1; transform:none; } }`}</style>
    </div>
  );
}

function PrimaryButton({ busy, busyLabel, label, onClick, disabled }: { busy: boolean; busyLabel: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy || disabled} className="group relative inline-flex items-center gap-2 h-9 px-5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px disabled:opacity-50 disabled:translate-y-0 transition-all cursor-pointer overflow-hidden">
      <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
      {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /><span className="relative z-10">{busyLabel}</span></> : <span className="relative z-10">{label}</span>}
    </button>
  );
}

function IconButton({ icon: Icon, label, onClick, disabled }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled}
      className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-border/15 text-text-secondary hover:text-text-primary hover:bg-secondary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
      aria-label={label} title={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function DeleteButton({ id, onDeleted, onError, guard }: { id: string; onDeleted: () => void; onError: (title: string, message: string) => void; guard: () => boolean }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (guard && !guard()) return;
    if (!confirm('Διαγραφή αυτής της κράτησης; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.')) return;
    setBusy(true);
    const res = await supabase.functions.invoke('booking-delete', { body: { id } });
    setBusy(false);
    const errMsg = (res.data as any)?.error ?? res.error?.message ?? '';
    if (res.error || (res.data as any)?.error) { onError('Σφάλμα διαγραφής κράτησης', errMsg || 'Η διαγραφή απέτυχε.'); }
    else { onDeleted(); }
  };
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-danger/20 text-danger hover:bg-danger/10 disabled:opacity-40 transition-all cursor-pointer"
      aria-label="Διαγραφή κράτησης"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}

// ── Member searchable dropdown ─────────────────────────────────────────────

function MemberDropdown({ members, value, onChange }: { members: Member[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);

  const filtered = members.filter((m) => {
    const n = search.toLowerCase();
    return !n || (m.full_name ?? '').toLowerCase().includes(n) || m.id.toLowerCase().includes(n);
  });
  const selected = members.find((m) => m.id === value);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full h-9 flex items-center justify-between gap-2 pl-3.5 pr-3 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary hover:border-primary/30 transition-all cursor-pointer"
      >
        <span className={selected ? '' : 'text-text-secondary'}>{selected ? selected.full_name ?? selected.id : '— επίλεξε μέλος —'}</span>
        <ChevronDown className={['h-3.5 w-3.5 text-text-secondary transition-transform', open ? 'rotate-180' : ''].join(' ')} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-border/15 bg-secondary-background shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border/10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary pointer-events-none" />
              <input autoFocus className="w-full h-8 pl-7 pr-3 rounded-lg border border-border/15 bg-secondary/10 text-sm text-text-primary outline-none focus:border-primary/40 transition-all" placeholder="Αναζήτηση μέλους…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && <div className="px-3 py-3 text-xs text-text-secondary">Δεν βρέθηκαν μέλη</div>}
            {filtered.map((m) => (
              <button key={m.id} type="button" onClick={() => { onChange(m.id); setOpen(false); setSearch(''); }}
                className={['w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-left hover:bg-secondary/20 transition-colors', m.id === value ? 'bg-primary/8 text-primary' : 'text-text-primary'].join(' ')}
              >
                {m.id === value && <Check className="h-3 w-3 shrink-0" />}
                {m.full_name ?? m.id}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modals ────────────────────────────────────────────────────────────────

function CreateBookingModal({ tenantId, onClose, onError }: { tenantId: string; onClose: () => void; onError: (title: string, message: string) => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [userId, setUserId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [bookingType, setBookingType] = useState<'membership' | 'drop_in'>('membership');
  const [busy, setBusy] = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: m, error: mErr } = await supabase
        .from('members')
        .select('id,full_name')
        .eq('tenant_id', tenantId)
        .eq('role', 'member')
        .order('full_name');

      if (mErr) onError('Σφάλμα φόρτωσης μελών', mErr.message);
      setMembers((m as any[]) ?? []);

      const { data: s, error: sErr } = await supabase
        .from('class_sessions')
        .select('id,starts_at,ends_at,capacity,classes(id,title,class_categories(name,color))')
        .eq('tenant_id', tenantId)
        .order('starts_at');

      if (sErr) onError('Σφάλμα φόρτωσης συνεδριών', sErr.message);
      setSessions((s as any[]) ?? []);
    })();
  }, [tenantId, onError]);

  const selectedSession = sessions.find((s) => s.id === sessionId);
  const sessionLabel = (s: SessionRow) => `${s.classes?.title ?? '—'} · ${formatDateTime(s.starts_at)}${s.capacity != null ? ` (cap ${s.capacity})` : ''}`;

  const submit = async () => {
    if (!userId || !sessionId) { onError('Ελλιπή στοιχεία', 'Πρέπει να επιλέξετε μέλος και συνεδρία.'); return; }
    setBusy(true);
    const res = await supabase.functions.invoke('booking-create', { body: { tenant_id: tenantId, user_id: userId, session_id: sessionId, booking_type: bookingType } });
    setBusy(false);
    const errMsg = (res.data as any)?.error ?? res.error?.message ?? '';
    if (res.error || (res.data as any)?.error) { onError('Σφάλμα δημιουργίας κράτησης', errMsg || 'Η δημιουργία απέτυχε.'); return; }
    onClose();
  };

  return (
    <ModalShell title="Νέα κράτηση" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Ακύρωση</button>
        <PrimaryButton busy={busy} busyLabel="Δημιουργία…" label="Δημιουργία" onClick={submit} />
      </>}
    >
      <FormField label="Μέλος *">
        <MemberDropdown members={members} value={userId} onChange={setUserId} />
      </FormField>

      <FormField label="Συνεδρία *">
        <button type="button" onClick={() => setSessionPickerOpen(true)}
          className={['w-full h-9 flex items-center justify-between gap-2 pl-3.5 pr-3 rounded-xl border transition-all cursor-pointer text-sm', sessionId ? 'border-primary/30 bg-primary/5 text-text-primary' : 'border-border/15 bg-secondary-background text-text-secondary hover:border-primary/30'].join(' ')}
        >
          <span className="truncate">{selectedSession ? sessionLabel(selectedSession) : '— επίλεξε συνεδρία —'}</span>
          <Search className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>

        {selectedSession && (
          <div className="mt-2 px-3.5 py-2.5 rounded-xl border border-border/10 bg-secondary/5 space-y-1">
            {selectedSession.ends_at && (
              <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Clock className="h-3 w-3 opacity-60" />Λήξη: {formatDateTime(selectedSession.ends_at)}
              </div>
            )}
            {selectedSession.classes?.class_categories?.name && (
              <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                {selectedSession.classes.class_categories.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: selectedSession.classes.class_categories.color }} />}
                {selectedSession.classes.class_categories.name}
              </div>
            )}
          </div>
        )}

        {sessionPickerOpen && (
          <SessionPickerModal
            title="Επιλογή συνεδρίας" sessions={sessions} selectedSessionId={sessionId}
            initialSearch={sessionSearch} initialDate={sessionDate}
            onClose={() => setSessionPickerOpen(false)}
            onPick={(picked) => setSessionId(picked.id)}
            onChangeFilters={({ search, date }) => { setSessionSearch(search); setSessionDate(date); }}
          />
        )}
      </FormField>

      <FormField label="Τύπος κράτησης">
        <div className="grid grid-cols-2 gap-2">
          {[{ value: 'membership', label: 'Μέλος (συνδρομή)' }, { value: 'drop_in', label: 'Drop-in (μεμονωμένη)' }].map((opt) => (
            <button key={opt.value} type="button" onClick={() => setBookingType(opt.value as any)}
              className={['px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer', bookingType === opt.value ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/15 text-text-secondary hover:border-primary/25'].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </FormField>
    </ModalShell>
  );
}

function EditBookingModal({ row, onClose, onError }: { row: Booking; onClose: () => void; onError: (title: string, message: string) => void }) {
  const [status, setStatus] = useState<StatusCode>((row.status as StatusCode) ?? 'booked');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const res = await supabase.functions.invoke('booking-update', { body: { id: row.id, status } });
    setBusy(false);
    const errMsg = (res.data as any)?.error ?? res.error?.message ?? '';
    if (res.error || (res.data as any)?.error) { onError('Σφάλμα ενημέρωσης κράτησης', errMsg || 'Η αποθήκευση απέτυχε.'); return; }
    onClose();
  };

  return (
    <ModalShell title="Επεξεργασία Κράτησης" icon={<Pencil className="h-4 w-4 text-primary" />} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Ακύρωση</button>
        <PrimaryButton busy={busy} busyLabel="Αποθήκευση…" label="Αποθήκευση" onClick={submit} />
      </>}
    >
      <FormField label="Κατάσταση">
        <div className="grid grid-cols-2 gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" onClick={() => setStatus(opt.value)}
              className={['px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer', status === opt.value ? `${STATUS_STYLE[opt.value]} border-opacity-60` : 'border-border/15 text-text-secondary hover:border-primary/25'].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </FormField>
    </ModalShell>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

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
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('today');
  const [customDate, setCustomDate] = useState('');
  const [bookingTypeFilter, setBookingTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [classOptions, setClassOptions] = useState<{ id: string; title: string }[]>([]);

  const subscriptionInactive = !subscription?.is_active;
  const handleError = (title: string, message: string) => setErrorModal({ title, message: translateErrorMessage(message) });

  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) { setShowSubModal(true); return; }
    action();
  }

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true); setError(null);
    const from = (page - 1) * pageSize;

    let query = supabase.from('bookings_list')
      .select('id,tenant_id,session_id,user_id,status,created_at,booking_type,drop_in_price,member_full_name,starts_at,ends_at,capacity,class_id,class_title,category_name,category_color', { count: 'exact' })
      .eq('tenant_id', profile.tenant_id).order('created_at', { ascending: false });

    if (classFilter) query = query.eq('class_id', classFilter);
    if (statusFilter) query = query.eq('status', statusFilter);
    if (bookingTypeFilter) query = query.eq('booking_type', bookingTypeFilter);
    if (dateFilterMode === 'today' || (dateFilterMode === 'custom' && customDate)) {
      const base = dateFilterMode === 'today' ? new Date().toISOString().slice(0, 10) : customDate;
      query = query.gte('starts_at', `${base}T00:00:00.000Z`).lte('starts_at', `${base}T23:59:59.999Z`);
    }
    const needle = q.trim();
    if (needle) query = query.or(`member_full_name.ilike.%${needle}%,class_title.ilike.%${needle}%,category_name.ilike.%${needle}%,status.ilike.%${needle}%`);

    const { data, error: err, count } = await query.range(from, from + pageSize - 1);

    if (err) {
      const { data: bare, error: e2, count: c2 } = await supabase.from('bookings')
        .select('id,tenant_id,session_id,user_id,status,created_at,booking_type,drop_in_price', { count: 'exact' })
        .eq('tenant_id', profile.tenant_id).order('created_at', { ascending: false }).range(from, from + pageSize - 1);
      if (e2) { setError(e2.message); handleError('Σφάλμα φόρτωσης κρατήσεων', e2.message); setRows([]); setTotalCount(0); setLoading(false); return; }
      setRows(((bare as any[]) ?? []).map((b) => ({ ...b, profile: null, session: null })));
      setTotalCount(c2 ?? 0); setLoading(false); return;
    }

    setRows(((data as any[]) ?? []).map((r) => ({
      id: r.id, tenant_id: r.tenant_id, session_id: r.session_id, user_id: r.user_id,
      status: r.status, created_at: r.created_at,
      booking_type: r.booking_type ?? 'membership', drop_in_price: r.drop_in_price ?? null,
      profile: r.member_full_name ? { id: r.user_id, full_name: r.member_full_name } : null,
      session: r.starts_at ? { id: r.session_id, starts_at: r.starts_at, ends_at: r.ends_at, capacity: r.capacity, classes: r.class_id ? { id: r.class_id, title: r.class_title ?? '—', class_categories: r.category_name ? { name: r.category_name, color: r.category_color ?? null } : null } : null } : null,
    })));
    setTotalCount(count ?? 0);
    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id, page, pageSize, classFilter, statusFilter, bookingTypeFilter, dateFilterMode, customDate, q]);
  useEffect(() => { setPage(1); }, [q, pageSize, classFilter, statusFilter, bookingTypeFilter, dateFilterMode, customDate]);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    supabase.from('classes').select('id,title').eq('tenant_id', profile.tenant_id).order('title').then(({ data }) => setClassOptions(((data as any[]) ?? []).map((c) => ({ id: c.id, title: c.title }))));
  }, [profile?.tenant_id]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIdx = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(totalCount, page * pageSize);

  const DATE_MODES: { value: DateFilterMode; label: string }[] = [
    { value: 'all', label: 'Όλες' },
    { value: 'today', label: 'Σήμερα' },
    { value: 'custom', label: 'Ημερομηνία' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <BookOpen className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-black text-text-primary tracking-tight">Κρατήσεις</h1>
            <p className="text-xs text-text-secondary mt-px">{loading ? '…' : `${totalCount} κρατήσεις`}</p>
          </div>
        </div>
        <button onClick={() => requireActiveSubscription(() => setShowCreate(true))}
          className="group relative inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px transition-all cursor-pointer overflow-hidden shrink-0"
        >
          <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          <Plus className="h-3.5 w-3.5 relative z-10" />
          <span className="relative z-10">Νέα Κράτηση</span>
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
          <input className="w-full h-9 pl-9 pr-3 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all" placeholder="Αναζήτηση κρατήσεων…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <StyledSelect value={classFilter} onChange={setClassFilter} className="min-w-36">
          <option value="">Όλα τα τμήματα</option>
          {classOptions.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </StyledSelect>

        <StyledSelect value={statusFilter} onChange={setStatusFilter}>
          <option value="">Όλες οι καταστάσεις</option>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </StyledSelect>

        <StyledSelect value={bookingTypeFilter} onChange={setBookingTypeFilter}>
          <option value="">Όλοι οι τύποι</option>
          <option value="membership">Μέλος</option>
          <option value="drop_in">Drop-in</option>
        </StyledSelect>

        {/* Date segmented */}
        <div className="flex items-center gap-1 p-1 rounded-xl border border-border/15 bg-secondary-background">
          {DATE_MODES.map((m) => (
            <button key={m.value} onClick={() => setDateFilterMode(m.value)}
              className={['h-7 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer', dateFilterMode === m.value ? 'bg-primary text-white shadow-sm shadow-primary/30' : 'text-text-secondary hover:text-text-primary hover:bg-secondary/30'].join(' ')}
            >
              {m.label}
            </button>
          ))}
        </div>

        {dateFilterMode === 'custom' && (
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input type="date" className="h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all" value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* ── Table card ── */}
      <div className="rounded-2xl border border-border/10 bg-secondary-background overflow-hidden shadow-sm">

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-text-secondary text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…
          </div>
        )}

        {/* Empty */}
        {!loading && rows.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-14 text-text-secondary">
            <BookOpen className="h-8 w-8 opacity-25" />
            <span className="text-sm">Δεν υπάρχουν κρατήσεις</span>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border/5">
              {rows.map((b) => {
                const isDropIn = (b.booking_type ?? 'membership') === 'drop_in';
                return (
                  <div key={b.id} className="p-4 hover:bg-secondary/5 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-text-primary truncate">{b.profile?.full_name ?? b.user_id}</div>
                        <div className="text-xs text-text-secondary mt-0.5 truncate">
                          {b.session?.classes?.title ?? '—'} · {b.session?.starts_at ? formatDateTime(b.session.starts_at) : '—'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => requireActiveSubscription(() => setEditRow(b))} />
                        <DeleteButton id={b.id} onDeleted={load} onError={handleError} guard={() => { if (subscriptionInactive) { setShowSubModal(true); return false; } return true; }} />
                      </div>
                    </div>

                    {b.session?.classes?.class_categories && (
                      <div className="mt-2">
                        <span className="inline-flex items-center gap-1.5 text-[10.5px] px-2 py-0.5 rounded-full border border-border/15 bg-secondary/20">
                          {b.session.classes.class_categories.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: b.session.classes.class_categories.color }} />}
                          {b.session.classes.class_categories.name}
                        </span>
                      </div>
                    )}

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={b.status} />
                      <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-lg border ${isDropIn ? 'border-warning/40 bg-warning/10 text-warning' : 'border-success/40 bg-success/10 text-success'}`}>
                        {isDropIn ? 'Drop-in' : 'Μέλος'}
                      </span>
                      {isDropIn && b.drop_in_price != null && <span className="text-[11px] text-text-secondary">{b.drop_in_price.toFixed(2)}€</span>}
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-text-secondary">
                      <span>Δημιουργία:</span>
                      <span className="font-medium text-text-primary">{formatDateDMY(b.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-225 text-sm">
                <thead>
                  <tr className="border-b border-border/10 bg-secondary/5">
                    {['Μέλος', 'Τμήμα / Συνεδρία', 'Κατηγορία', 'Κατάσταση / Τύπος', 'Ημ. Δημιουργίας', ''].map((h, i) => (
                      <th key={i} className={['px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary', i === 5 ? 'text-right' : 'text-left'].join(' ')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => {
                    const isDropIn = (b.booking_type ?? 'membership') === 'drop_in';
                    return (
                      <tr key={b.id} className="border-t border-border/5 hover:bg-secondary/5 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-secondary/20 border border-border/10 flex items-center justify-center shrink-0">
                              <User className="h-3.5 w-3.5 text-text-secondary opacity-60" />
                            </div>
                            <span className="font-semibold text-text-primary truncate max-w-36">{b.profile?.full_name ?? b.user_id}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-text-primary">{b.session?.classes?.title ?? '—'}</div>
                          <div className="text-xs text-text-secondary mt-0.5">
                            {b.session?.starts_at ? formatDateTime(b.session.starts_at) : '—'}
                            {b.session?.ends_at && <span className="opacity-60"> – {formatDateTime(b.session.ends_at)}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {b.session?.classes?.class_categories ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border border-border/15 bg-secondary/20">
                              {b.session.classes.class_categories.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: b.session.classes.class_categories.color }} />}
                              {b.session.classes.class_categories.name}
                            </span>
                          ) : <span className="text-xs text-text-secondary opacity-40">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <StatusBadge status={b.status} />
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-flex items-center text-[10.5px] font-semibold px-2 py-0.5 rounded-lg border ${isDropIn ? 'border-warning/40 bg-warning/10 text-warning' : 'border-success/40 bg-success/10 text-success'}`}>
                                {isDropIn ? 'Drop-in' : 'Μέλος'}
                              </span>
                              {isDropIn && b.drop_in_price != null && <span className="text-[11px] text-text-secondary">{b.drop_in_price.toFixed(2)}€</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">{formatDateDMY(b.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => requireActiveSubscription(() => setEditRow(b))} />
                            <DeleteButton id={b.id} onDeleted={load} onError={handleError} guard={() => { if (subscriptionInactive) { setShowSubModal(true); return false; } return true; }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/10 text-xs text-text-secondary">
              <span><span className="font-bold text-text-primary">{startIdx}–{endIdx}</span> από <span className="font-bold text-text-primary">{totalCount}</span></span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="hidden sm:inline">Ανά σελίδα:</span>
                  <div className="relative">
                    <select className="h-7 pl-2 pr-7 rounded-lg border border-border/15 bg-secondary-background text-xs appearance-none outline-none cursor-pointer" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                      {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none" />
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-all"><ChevronLeft className="h-3.5 w-3.5" /></button>
                  <span className="px-2"><span className="font-bold text-text-primary">{page}</span> / {pageCount}</span>
                  <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount} className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-all"><ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {showCreate && <CreateBookingModal tenantId={profile?.tenant_id!} onClose={() => { setShowCreate(false); load(); }} onError={handleError} />}
      {editRow && <EditBookingModal row={editRow} onClose={() => { setEditRow(null); load(); }} onError={handleError} />}

      {errorModal && (
        <ModalShell title={errorModal.title} icon={<AlertTriangle className="h-4 w-4 text-danger" />} onClose={() => setErrorModal(null)}
          footer={<PrimaryButton busy={false} busyLabel="" label="ΟΚ" onClick={() => setErrorModal(null)} />}
        >
          <p className="text-sm text-text-secondary whitespace-pre-line leading-relaxed">{errorModal.message}</p>
        </ModalShell>
      )}

      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </div>
  );
}