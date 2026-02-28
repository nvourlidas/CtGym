import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale/el';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import SessionAttendanceModal from '../../components/Programs/SessionAttendanceModal';
import { SessionQrModal } from '../../components/SessionQrModal';
import {
  QrCode, Pencil, Trash2, Loader2, Clock, Plus, Trash,
  ChevronLeft, ChevronRight, ChevronDown, Search, CalendarDays,
  AlertTriangle, Check, Users, X, Calendar,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';

type GymClass = {
  id: string; title: string;
  class_categories?: { id: string; name: string | null; color: string | null } | null;
};

type SessionRow = {
  id: string; tenant_id: string; class_id: string;
  starts_at: string; ends_at: string;
  capacity: number | null; checkin_token: string | null;
  created_at: string; cancel_before_hours?: number | null;
};

type DateFilter = '' | 'today' | 'week' | 'month';

// ── Helpers ───────────────────────────────────────────────────────────────

function isoToTimeInput(iso: string) {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}
function dateAndTimeToUtcIso(dateOnly: Date, hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(dateOnly);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
function formatDateTime(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2,'0');
  return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function formatDate(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2,'0');
  return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()}`;
}
function formatTime(iso: string) {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function startOfWeek(d: Date) { const x = startOfDay(d); x.setDate(x.getDate() - (x.getDay()+6)%7); return x; }
function startOfMonth(d: Date) { const x = startOfDay(d); x.setDate(1); return x; }

// ── Shared UI helpers ─────────────────────────────────────────────────────

function StyledSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        className="h-9 pl-3.5 pr-9 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary appearance-none outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
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

function ModalShell({ title, icon, onClose, children, footer }: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-2xl overflow-hidden" style={{ animation: 'sessionModalIn 0.2s ease' }}>
        <div className="h-[3px] w-full bg-gradient-to-r from-primary/0 via-primary to-primary/0" />
        <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
              {icon ?? <CalendarDays className="h-4 w-4 text-primary" />}
            </div>
            <h2 className="font-black text-text-primary tracking-tight">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl border border-border/10 hover:bg-secondary/30 text-text-secondary hover:text-text-primary transition-all cursor-pointer shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 max-h-[72vh] overflow-y-auto space-y-4">{children}</div>
        <div className="px-5 py-4 border-t border-border/10 flex justify-end gap-2">{footer}</div>
      </div>
      <style>{`@keyframes sessionModalIn { from { opacity:0; transform:translateY(16px) scale(0.98); } to { opacity:1; transform:none; } }`}</style>
    </div>
  );
}

function IconButton({ icon: Icon, label, onClick, disabled }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-border/15 text-text-secondary hover:text-text-primary hover:bg-secondary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
      aria-label={label} title={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function DeleteButton({ id, onDeleted, setError, guard }: { id: string; onDeleted: () => void; setError: (s: string | null) => void; guard: () => boolean }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (guard && !guard()) return;
    if (!confirm('Διαγραφή αυτής της συνεδρίας; Αυτή η ενέργεια δεν μπορεί να ακυρωθεί.')) return;
    setBusy(true);
    const res = await supabase.functions.invoke('session-delete', { body: { id } });
    setBusy(false);
    if (res.error) { setError(res.error.message ?? 'Η διαγραφή απέτυχε'); }
    else if ((res.data as any)?.error) { setError((res.data as any).error); }
    else { setError(null); onDeleted(); }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-danger/20 text-danger hover:bg-danger/10 disabled:opacity-40 transition-all cursor-pointer"
      aria-label="Διαγραφή συνεδρίας"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}

// ── Class searchable dropdown ─────────────────────────────────────────────

function ClassDropdown({ classes, value, onChange }: { classes: GymClass[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);

  const filtered = classes.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));
  const selected = classes.find((c) => c.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-9 flex items-center justify-between gap-2 pl-3.5 pr-3 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary hover:border-primary/30 transition-all cursor-pointer"
      >
        <span className={selected ? '' : 'text-text-secondary'}>{selected ? selected.title : 'Επιλέξτε τμήμα…'}</span>
        <ChevronDown className={['h-3.5 w-3.5 text-text-secondary transition-transform', open ? 'rotate-180' : ''].join(' ')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-border/15 bg-secondary-background shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border/10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary pointer-events-none" />
              <input
                autoFocus
                className="w-full h-8 pl-7 pr-3 rounded-lg border border-border/15 bg-secondary/10 text-sm text-text-primary outline-none focus:border-primary/40 transition-all"
                placeholder="Αναζήτηση τμήματος…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && <div className="px-3 py-3 text-xs text-text-secondary">Δεν βρέθηκαν τμήματα</div>}
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onChange(c.id); setOpen(false); setSearch(''); }}
                className={['w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left hover:bg-secondary/20 transition-colors', c.id === value ? 'bg-primary/8 text-primary' : 'text-text-primary'].join(' ')}
              >
                {c.id === value && <Check className="h-3 w-3 shrink-0" />}
                {c.class_categories?.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.class_categories.color }} />}
                {c.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Session form fields (shared create/edit) ──────────────────────────────

function SessionFormFields({ classes, classId, setClassId, date, setDate, startTime, setStartTime, endTime, setEndTime, capacity, setCapacity, cancelBeforeHours, setCancelBeforeHours }: any) {
  return (
    <>
      <FormField label="Τμήμα *">
        <ClassDropdown classes={classes} value={classId} onChange={setClassId} />
      </FormField>

      <FormField label="Ημερομηνία *">
        <DatePicker
          selected={date}
          onChange={(d) => setDate(d)}
          dateFormat="dd/MM/yyyy"
          locale={el}
          placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
          className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all"
          wrapperClassName="w-full"
          showMonthDropdown showYearDropdown dropdownMode="select" scrollableYearDropdown yearDropdownItemNumber={80}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Ώρα Έναρξης *">
          <input type="time" className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </FormField>
        <FormField label="Ώρα Λήξης *">
          <input type="time" className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Χωρητικότητα">
          <div className="relative">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input type="number" min={0} className="w-full h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
          </div>
        </FormField>
        <FormField label="Ακύρωση έως (ώρες)">
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input type="number" min={0} className="w-full h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all" value={cancelBeforeHours} onChange={(e) => setCancelBeforeHours(e.target.value)} />
          </div>
        </FormField>
      </div>
    </>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────

function CreateSessionModal({ classes, tenantId, onClose, setError }: { classes: GymClass[]; tenantId: string; onClose: () => void; setError: (s: string | null) => void }) {
  const [classId, setClassId]                       = useState(classes[0]?.id ?? '');
  const [date, setDate]                             = useState<Date | null>(null);
  const [startTime, setStartTime]                   = useState('18:00');
  const [endTime, setEndTime]                       = useState('19:00');
  const [capacity, setCapacity]                     = useState(20);
  const [cancelBeforeHours, setCancelBeforeHours]   = useState('');
  const [busy, setBusy]                             = useState(false);

  const submit = async () => {
    if (!classId || !date || !startTime || !endTime) { alert('Συμπληρώστε τμήμα, ημερομηνία, ώρα έναρξης και ώρα λήξης.'); return; }
    const startsIso = dateAndTimeToUtcIso(date, startTime);
    const endsIso   = dateAndTimeToUtcIso(date, endTime);
    if (new Date(endsIso) <= new Date(startsIso)) { alert('Η ώρα λήξης πρέπει να είναι μετά την ώρα έναρξης.'); return; }
    setBusy(true);
    const res = await supabase.functions.invoke('session-create', { body: { tenant_id: tenantId, class_id: classId, starts_at: startsIso, ends_at: endsIso, capacity, cancel_before_hours: cancelBeforeHours !== '' ? Number(cancelBeforeHours) : null } });
    setBusy(false);
    if (res.error || (res.data as any)?.error) { setError(res.error?.message ?? (res.data as any)?.error ?? 'Create failed'); return; }
    setError(null); onClose();
  };

  return (
    <ModalShell
      title="Νέα Συνεδρία"
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Ακύρωση</button>
        <PrimaryButton busy={busy} busyLabel="Δημιουργία…" label="Δημιουργία" onClick={submit} />
      </>}
    >
      <SessionFormFields classes={classes} classId={classId} setClassId={setClassId} date={date} setDate={setDate} startTime={startTime} setStartTime={setStartTime} endTime={endTime} setEndTime={setEndTime} capacity={capacity} setCapacity={setCapacity} cancelBeforeHours={cancelBeforeHours} setCancelBeforeHours={setCancelBeforeHours} />
    </ModalShell>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────

function EditSessionModal({ row, classes, onClose, setError }: { row: SessionRow; classes: GymClass[]; onClose: () => void; setError: (s: string | null) => void }) {
  const [classId, setClassId]                       = useState(row.class_id);
  const [date, setDate]                             = useState<Date | null>(() => new Date(row.starts_at));
  const [startTime, setStartTime]                   = useState(() => isoToTimeInput(row.starts_at));
  const [endTime, setEndTime]                       = useState(() => isoToTimeInput(row.ends_at));
  const [capacity, setCapacity]                     = useState(row.capacity ?? 20);
  const [cancelBeforeHours, setCancelBeforeHours]   = useState(row.cancel_before_hours != null ? String(row.cancel_before_hours) : '');
  const [busy, setBusy]                             = useState(false);

  const submit = async () => {
    if (!classId || !date || !startTime || !endTime) { alert('Συμπληρώστε τμήμα, ημερομηνία, ώρα έναρξης και ώρα λήξης.'); return; }
    const startsIso = dateAndTimeToUtcIso(date, startTime);
    const endsIso   = dateAndTimeToUtcIso(date, endTime);
    if (new Date(endsIso) <= new Date(startsIso)) { alert('Η ώρα λήξης πρέπει να είναι μετά την ώρα έναρξης.'); return; }
    setBusy(true);
    const res = await supabase.functions.invoke('session-update', { body: { id: row.id, class_id: classId, starts_at: startsIso, ends_at: endsIso, capacity, cancel_before_hours: cancelBeforeHours !== '' ? Number(cancelBeforeHours) : null } });
    setBusy(false);
    if (res.error || (res.data as any)?.error) { setError(res.error?.message ?? (res.data as any)?.error ?? 'Save failed'); return; }
    setError(null); onClose();
  };

  return (
    <ModalShell
      title="Επεξεργασία Συνεδρίας"
      icon={<Pencil className="h-4 w-4 text-primary" />}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Ακύρωση</button>
        <PrimaryButton busy={busy} busyLabel="Αποθήκευση…" label="Αποθήκευση" onClick={submit} />
      </>}
    >
      <SessionFormFields classes={classes} classId={classId} setClassId={setClassId} date={date} setDate={setDate} startTime={startTime} setStartTime={setStartTime} endTime={endTime} setEndTime={setEndTime} capacity={capacity} setCapacity={setCapacity} cancelBeforeHours={cancelBeforeHours} setCancelBeforeHours={setCancelBeforeHours} />
    </ModalShell>
  );
}

function PrimaryButton({ busy, busyLabel, label, onClick }: { busy: boolean; busyLabel: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={busy} className="group relative inline-flex items-center gap-2 h-9 px-5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px disabled:opacity-50 disabled:translate-y-0 transition-all cursor-pointer overflow-hidden">
      <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
      {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /><span className="relative z-10">{busyLabel}</span></> : <span className="relative z-10">{label}</span>}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function ClassSessionsPage() {
  const { profile, subscription } = useAuth();
  const [showSubModal, setShowSubModal]       = useState(false);
  const [loading, setLoading]                 = useState(true);
  const [rows, setRows]                       = useState<SessionRow[]>([]);
  const [classes, setClasses]                 = useState<GymClass[]>([]);
  const [qClass, setQClass]                   = useState('');
  const [dateFilter, setDateFilter]           = useState<DateFilter>('');
  const [showCreate, setShowCreate]           = useState(false);
  const [editRow, setEditRow]                 = useState<SessionRow | null>(null);
  const [error, setError]                     = useState<string | null>(null);
  const [totalCount, setTotalCount]           = useState(0);
  const [page, setPage]                       = useState(1);
  const [pageSize, setPageSize]               = useState(10);
  const [attendanceSession, setAttendanceSession] = useState<SessionRow | null>(null);
  const [qrSession, setQrSession]             = useState<SessionRow | null>(null);
  const [selectedIds, setSelectedIds]         = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting]       = useState(false);

  const subscriptionInactive = !subscription?.is_active;

  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) { setShowSubModal(true); return; }
    action();
  }

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true); setError(null);
    const from = (page - 1) * pageSize;
    try {
      const [clsRes, sessRes] = await Promise.all([
        supabase.from('classes').select('id,title,class_categories(id,name,color)').eq('tenant_id', profile.tenant_id).order('title'),
        (() => {
          let q = supabase.from('class_sessions').select('id,tenant_id,class_id,starts_at,ends_at,capacity,created_at,cancel_before_hours,checkin_token', { count: 'exact' })
            .eq('tenant_id', profile.tenant_id).order('starts_at', { ascending: false });
          if (qClass) q = q.eq('class_id', qClass);
          if (dateFilter) {
            const now = new Date();
            let start: Date | null = null, end: Date | null = null;
            if (dateFilter === 'today')  { start = startOfDay(now);   end = new Date(start); end.setDate(end.getDate()+1); }
            if (dateFilter === 'week')   { start = startOfWeek(now);  end = new Date(start); end.setDate(end.getDate()+7); }
            if (dateFilter === 'month')  { start = startOfMonth(now); end = new Date(start); end.setMonth(end.getMonth()+1); }
            if (start && end) q = q.gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString());
          }
          return q.range(from, from + pageSize - 1);
        })(),
      ]);

      if (!clsRes.error) {
        setClasses(((clsRes.data as any[]) ?? []).map((row) => ({
          id: row.id, title: row.title,
          class_categories: Array.isArray(row.class_categories) ? row.class_categories[0] ?? null : row.class_categories ?? null,
        })));
      }
      if (!sessRes.error) { setRows((sessRes.data as SessionRow[]) ?? []); setTotalCount(sessRes.count ?? 0); }
      else { setRows([]); setTotalCount(0); }
      if (clsRes.error || sessRes.error) setError(clsRes.error?.message ?? sessRes.error?.message ?? null);
      setSelectedIds([]);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [profile?.tenant_id, page, pageSize, qClass, dateFilter]);
  useEffect(() => { setPage(1); }, [qClass, dateFilter, pageSize]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIdx  = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx    = Math.min(totalCount, page * pageSize);
  const getClass  = (id: string) => classes.find((c) => c.id === id);
  const pageIds   = rows.map((s) => s.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Διαγραφή ${selectedIds.length} συνεδριών; Αυτή η ενέργεια δεν μπορεί να ακυρωθεί.`)) return;
    setBulkDeleting(true); setError(null);
    try {
      const results = await Promise.all(selectedIds.map((id) => supabase.functions.invoke('session-delete', { body: { id } })));
      const firstError = results.find((r) => r.error || (r.data as any)?.error);
      if (firstError) setError(firstError.error?.message ?? (firstError.data as any)?.error ?? 'Η ομαδική διαγραφή είχε σφάλματα.');
      await load();
    } finally { setBulkDeleting(false); }
  };

  const DATE_FILTERS: { value: DateFilter; label: string }[] = [
    { value: '',       label: 'Όλες' },
    { value: 'today',  label: 'Σήμερα' },
    { value: 'week',   label: 'Εβδομάδα' },
    { value: 'month',  label: 'Μήνας' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <Calendar className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-black text-text-primary tracking-tight">Συνεδρίες</h1>
            <p className="text-xs text-text-secondary mt-px">{loading ? '…' : `${totalCount} συνεδρίες`}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Bulk delete */}
          <button
            onClick={() => requireActiveSubscription(handleBulkDelete)}
            disabled={selectedIds.length === 0 || bulkDeleting}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-danger/25 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Διαγραφή επιλεγμένων</span>
            {selectedIds.length > 0 && <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-danger/20 text-danger text-[10px] font-bold">{selectedIds.length}</span>}
          </button>

          <button
            onClick={() => requireActiveSubscription(() => setShowCreate(true))}
            className="group relative inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px transition-all cursor-pointer overflow-hidden shrink-0"
          >
            <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
            <Plus className="h-3.5 w-3.5 relative z-10" />
            <span className="relative z-10 hidden sm:inline">Νέα Συνεδρία</span>
          </button>
        </div>
      </div>

      {/* ── Filters bar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <StyledSelect value={qClass} onChange={(v) => setQClass(v)}>
          <option value="">Όλα τα τμήματα</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </StyledSelect>

        <div className="flex items-center gap-1 p-1 rounded-xl border border-border/15 bg-secondary-background">
          {DATE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setDateFilter(f.value)}
              className={[
                'h-7 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                dateFilter === f.value
                  ? 'bg-primary text-white shadow-sm shadow-primary/30'
                  : 'text-text-secondary hover:text-text-primary hover:bg-secondary/30',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* ── Table card ── */}
      <div className="rounded-2xl border border-border/10 bg-secondary-background overflow-hidden shadow-sm">

        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-205 text-sm">
            <thead>
              <tr className="border-b border-border/10 bg-secondary/5">
                <th className="px-4 py-3 w-10">
                  <div
                    onClick={() => setSelectedIds((prev) => {
                      const allSel = pageIds.length > 0 && pageIds.every((id) => prev.includes(id));
                      if (allSel) return prev.filter((id) => !pageIds.includes(id));
                      const next = new Set(prev); pageIds.forEach((id) => next.add(id)); return Array.from(next);
                    })}
                    className={['w-4 h-4 rounded-md border flex items-center justify-center cursor-pointer transition-all', allPageSelected ? 'bg-primary border-primary' : 'border-border/30 hover:border-primary/50'].join(' ')}
                  >
                    {allPageSelected && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                </th>
                {['Τμήμα', 'Έναρξη', 'Λήξη', 'Χωρητ.', 'Ακύρωση (ώρες)', ''].map((h, i) => (
                  <th key={i} className={['px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary', i === 5 ? 'text-right' : 'text-left'].join(' ')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="px-4 py-10">
                  <div className="flex items-center justify-center gap-2 text-text-secondary text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…
                  </div>
                </td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12">
                  <div className="flex flex-col items-center gap-3 text-text-secondary">
                    <Calendar className="h-8 w-8 opacity-25" />
                    <span className="text-sm">Δεν υπάρχουν συνεδρίες</span>
                  </div>
                </td></tr>
              )}
              {!loading && rows.map((s) => {
                const cls    = getClass(s.class_id);
                const hasQr  = Boolean(s.checkin_token);
                const isSel  = selectedIds.includes(s.id);

                return (
                  <tr key={s.id} className={['border-t border-border/5 transition-colors', isSel ? 'bg-primary/4' : 'hover:bg-secondary/5'].join(' ')}>
                    <td className="px-4 py-3">
                      <div
                        onClick={() => setSelectedIds((prev) => prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id])}
                        className={['w-4 h-4 rounded-md border flex items-center justify-center cursor-pointer transition-all', isSel ? 'bg-primary border-primary' : 'border-border/30 hover:border-primary/50'].join(' ')}
                      >
                        {isSel && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-text-primary">{cls?.title ?? '—'}</div>
                      {cls?.class_categories && (
                        <span className="inline-flex items-center gap-1.5 mt-1 text-[10.5px] px-2 py-0.5 rounded-full border border-border/15 bg-secondary/20">
                          {cls.class_categories.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: cls.class_categories.color }} />}
                          {cls.class_categories.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{formatDateTime(s.starts_at)}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{s.ends_at ? formatDateTime(s.ends_at) : '—'}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{s.capacity ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{s.cancel_before_hours != null ? s.cancel_before_hours : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <IconButton icon={QrCode}  label="QR check-in"    onClick={() => setQrSession(s)}                                        disabled={!hasQr} />
                        <IconButton icon={Clock}   label="Ιστορικό"        onClick={() => setAttendanceSession(s)} />
                        <IconButton icon={Pencil}  label="Επεξεργασία"     onClick={() => requireActiveSubscription(() => setEditRow(s))} />
                        <DeleteButton id={s.id} onDeleted={load} setError={setError} guard={() => { if (subscriptionInactive) { setShowSubModal(true); return false; } return true; }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-border/5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-text-secondary text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…
            </div>
          )}
          {!loading && rows.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-text-secondary">
              <Calendar className="h-8 w-8 opacity-25" />
              <span className="text-sm">Δεν υπάρχουν συνεδρίες</span>
            </div>
          )}
          {!loading && rows.map((s) => {
            const cls   = getClass(s.class_id);
            const hasQr = Boolean(s.checkin_token);
            const isSel = selectedIds.includes(s.id);
            return (
              <div key={s.id} className={['px-4 py-4 transition-colors', isSel ? 'bg-primary/4' : 'hover:bg-secondary/5'].join(' ')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      onClick={() => setSelectedIds((prev) => prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id])}
                      className={['w-4 h-4 rounded-md border flex items-center justify-center cursor-pointer transition-all mt-0.5 shrink-0', isSel ? 'bg-primary border-primary' : 'border-border/30 hover:border-primary/50'].join(' ')}
                    >
                      {isSel && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-text-primary">{cls?.title ?? '—'}</div>
                      {cls?.class_categories && (
                        <span className="inline-flex items-center gap-1.5 mt-1 text-[10.5px] px-2 py-0.5 rounded-full border border-border/15 bg-secondary/20">
                          {cls.class_categories.color && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cls.class_categories.color }} />}
                          {cls.class_categories.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <IconButton icon={QrCode} label="QR" onClick={() => setQrSession(s)} disabled={!hasQr} />
                    <IconButton icon={Clock}  label="Ιστορικό" onClick={() => setAttendanceSession(s)} />
                    <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => requireActiveSubscription(() => setEditRow(s))} />
                    <DeleteButton id={s.id} onDeleted={load} setError={setError} guard={() => { if (subscriptionInactive) { setShowSubModal(true); return false; } return true; }} />
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs pl-6">
                  {[
                    ['Έναρξη', formatDateTime(s.starts_at)],
                    ['Λήξη', s.ends_at ? formatDateTime(s.ends_at) : '—'],
                    ['Χωρητικότητα', s.capacity ?? '—'],
                    ['Ακύρωση (ώρες)', s.cancel_before_hours != null ? s.cancel_before_hours : '—'],
                  ].map(([label, val]) => (
                    <div key={label as string}>
                      <span className="text-text-secondary">{label}: </span>
                      <span className="text-text-primary font-medium">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {!loading && rows.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/10 text-xs text-text-secondary">
            <span>
              <span className="font-bold text-text-primary">{startIdx}–{endIdx}</span> από <span className="font-bold text-text-primary">{totalCount}</span>
            </span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="hidden sm:inline">Ανά σελίδα:</span>
                <div className="relative">
                  <select className="h-7 pl-2 pr-7 rounded-lg border border-border/15 bg-secondary-background text-xs appearance-none outline-none focus:border-primary/40 cursor-pointer" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    {[10,25,50].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none" />
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p-1))} disabled={page === 1} className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-all">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="px-2"><span className="font-bold text-text-primary">{page}</span> / {pageCount}</span>
                <button onClick={() => setPage((p) => Math.min(pageCount, p+1))} disabled={page === pageCount} className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-all">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showCreate    && <CreateSessionModal classes={classes} tenantId={profile?.tenant_id!} onClose={() => { setShowCreate(false); load(); }} setError={setError} />}
      {editRow       && <EditSessionModal row={editRow} classes={classes} onClose={() => { setEditRow(null); load(); }} setError={setError} />}
      {attendanceSession && profile?.tenant_id && (
        <SessionAttendanceModal
          tenantId={profile.tenant_id} sessionId={attendanceSession.id}
          sessionTitle={getClass(attendanceSession.class_id)?.title ?? '—'}
          sessionTime={`${formatDate(attendanceSession.starts_at)} • ${formatTime(attendanceSession.starts_at)}${attendanceSession.ends_at ? '–' + formatTime(attendanceSession.ends_at) : ''}`}
          onClose={() => setAttendanceSession(null)}
        />
      )}
      {qrSession && profile?.tenant_id && (
        <SessionQrModal open={true} onClose={() => setQrSession(null)} tenantId={profile.tenant_id} sessionId={qrSession.id} sessionTitle={getClass(qrSession.class_id)?.title ?? '—'} token={qrSession.checkin_token} />
      )}

      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </div>
  );
}