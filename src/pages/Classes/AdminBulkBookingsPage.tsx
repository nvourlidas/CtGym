import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import type { DragEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import {
  Trash2, ChevronLeft, ChevronRight, CalendarDays, Users, Search,
  X, AlertTriangle, CheckCircle2, Loader2, Check, ChevronDown,
  CalendarPlus, GripVertical, Eye, Zap, Clock,
} from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';

type Member = { id: string; full_name: string | null; email: string | null };
type SessionClassRel = {
  id: string; title: string;
  drop_in_enabled: boolean | null; drop_in_price: number | null; member_drop_in_price: number | null;
};
type BookingWithProfile = {
  id: string; user_id: string; status: string | null; booking_type: string | null;
  drop_in_price: number | null; drop_in_paid: boolean | null;
  profiles: { id: string; full_name: string | null; email: string | null } | null;
};
type SessionWithRelations = {
  id: string; tenant_id: string; class_id: string | null; starts_at: string; ends_at: string | null;
  classes: SessionClassRel | SessionClassRel[] | null; bookings: BookingWithProfile[];
};
type Feedback = { type: 'success' | 'error'; message: string } | null;
type DropInPromptState = { memberId: string; sessionId: string } | null;
type BulkPreview = {
  matchingCount: number; alreadyBookedCount: number; toCreateCount: number;
  sessionsToCreate: { id: string; starts_at: string }[];
};

// ── Helpers ───────────────────────────────────────────────────────────────

function getSessionClass(s: SessionWithRelations): SessionClassRel | null {
  if (!s.classes) return null;
  return Array.isArray(s.classes) ? s.classes[0] ?? null : s.classes;
}
function pad2(n: number) { return String(n).padStart(2, '0'); }
function isoToLocalHHMM(iso: string) { const d = new Date(iso); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function normalizeHHMM(v: string) { const [h,m] = v.split(':'); return `${pad2(Number(h||0))}:${pad2(Number(m||0))}`; }
function toDateInputValue(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function dateInputToLocalStart(v: string) { const [y,m,d] = v.split('-').map(Number); return new Date(y,(m||1)-1,d||1,0,0,0,0); }
function formatDateDMY(date: Date) { return `${pad2(date.getDate())}/${pad2(date.getMonth()+1)}/${date.getFullYear()}`; }
function startOfWeekMonday(date: Date) { const d = new Date(date); const day = d.getDay(); const diff = day===0?-6:1-day; d.setDate(d.getDate()+diff); d.setHours(0,0,0,0); return d; }
function addDaysSimple(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate()+days); return d; }
function formatTimeRange(startIso: string, endIso: string | null) {
  const s = new Date(startIso);
  const base = `${pad2(s.getHours())}:${pad2(s.getMinutes())}`;
  if (!endIso) return base;
  const e = new Date(endIso);
  return `${base} – ${pad2(e.getHours())}:${pad2(e.getMinutes())}`;
}

const WEEKDAY_LABELS = ['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ'];
const MEMBERSHIP_ERROR_CODES = ['no_active_membership', 'membership_category_mismatch', 'no_eligible_membership_for_booking'];
function isMembershipErrorMessage(msg: string) { return MEMBERSHIP_ERROR_CODES.some((c) => msg.includes(c)); }

// ── Shared mini UI ────────────────────────────────────────────────────────

function FeedbackBanner({ feedback, onDismiss }: { feedback: Feedback; onDismiss: () => void }) {
  if (!feedback) return null;
  const isOk = feedback.type === 'success';
  return (
    <div className={['flex items-start justify-between gap-3 px-4 py-3 rounded-xl border text-sm mb-4', isOk ? 'border-success/30 bg-success/8 text-success' : 'border-danger/30 bg-danger/8 text-danger'].join(' ')}>
      <div className="flex items-start gap-2">
        {isOk ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
        <span>{feedback.message}</span>
      </div>
      <button onClick={onDismiss} className="opacity-60 hover:opacity-100 shrink-0 cursor-pointer"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function ModalShell({ title, icon, subtitle, onClose, children, footer, maxW = 'max-w-lg' }: { title: string; icon?: React.ReactNode; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; maxW?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-3">
      <div className={`w-full ${maxW} rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-2xl overflow-hidden`} style={{ animation: 'bulkModalIn 0.2s ease' }}>
        <div className="h-0.75 bg-linear-to-r from-primary/0 via-primary to-primary/0" />
        <div className="px-5 py-4 border-b border-border/10 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
              {icon ?? <CalendarPlus className="h-4 w-4 text-primary" />}
            </div>
            <div>
              <h2 className="font-black text-text-primary tracking-tight">{title}</h2>
              {subtitle && <p className="text-[11px] text-text-secondary mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl border border-border/10 hover:bg-secondary/30 text-text-secondary hover:text-text-primary transition-all cursor-pointer shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 max-h-[75vh] overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-border/10 flex justify-end gap-2">{footer}</div>}
      </div>
      <style>{`@keyframes bulkModalIn { from { opacity:0; transform:translateY(16px) scale(0.98); } to { opacity:1; transform:none; } }`}</style>
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

function PrimaryBtn({ busy, busyLabel, label, onClick, disabled }: { busy: boolean; busyLabel: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy || disabled} className="group relative inline-flex items-center gap-2 h-9 px-5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px disabled:opacity-50 disabled:translate-y-0 transition-all cursor-pointer overflow-hidden">
      <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
      {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /><span className="relative z-10">{busyLabel}</span></> : <span className="relative z-10">{label}</span>}
    </button>
  );
}

function SecondaryBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 disabled:opacity-40 transition-all cursor-pointer">
      {label}
    </button>
  );
}

// Searchable dropdown shared
function SearchableDropdown({ options, value, onChange, placeholder, disabled }: { options: { id: string; label: string; sublabel?: string }[]; value: string; onChange: (v: string) => void; placeholder: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);

  const filtered = options.filter((o) => !search || o.label.toLowerCase().includes(search.toLowerCase()) || (o.sublabel ?? '').toLowerCase().includes(search.toLowerCase()));
  const selected = options.find((o) => o.id === value);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => !disabled && setOpen((v) => !v)} disabled={disabled}
        className="w-full h-9 flex items-center justify-between gap-2 pl-3.5 pr-3 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary hover:border-primary/30 disabled:opacity-50 transition-all cursor-pointer"
      >
        <span className={selected ? 'text-text-primary truncate' : 'text-text-secondary truncate'}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={['h-3.5 w-3.5 text-text-secondary transition-transform shrink-0', open ? 'rotate-180' : ''].join(' ')} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-border/15 bg-secondary-background shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border/10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary pointer-events-none" />
              <input autoFocus className="w-full h-8 pl-7 pr-3 rounded-lg border border-border/15 bg-secondary/10 text-sm text-text-primary outline-none focus:border-primary/40 transition-all" placeholder="Αναζήτηση…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && <div className="px-3 py-3 text-xs text-text-secondary">Δεν βρέθηκαν αποτελέσματα</div>}
            {filtered.map((o) => (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false); setSearch(''); }}
                className={['w-full flex items-start gap-2 px-3.5 py-2.5 text-sm text-left hover:bg-secondary/20 transition-colors', o.id === value ? 'bg-primary/8' : ''].join(' ')}
              >
                {o.id === value && <Check className="h-3 w-3 text-primary mt-0.5 shrink-0" />}
                <div className={o.id === value ? '' : 'pl-5'}>
                  <div className={o.id === value ? 'text-primary font-semibold' : 'text-text-primary'}>{o.label}</div>
                  {o.sublabel && <div className="text-[11px] text-text-secondary">{o.sublabel}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bulk Bookings Modal ───────────────────────────────────────────────────

function BulkBookingsModal({ open, tenantId, members, classes, onClose, onDone }: {
  open: boolean; tenantId: string; members: Member[]; classes: SessionClassRel[];
  onClose: () => void; onDone: () => void;
}) {
  const today = new Date();
  const [memberId, setMemberId]                     = useState('');
  const [classId, setClassId]                       = useState('');
  const [weekdayIdx, setWeekdayIdx]                 = useState(0);
  const [startTime, setStartTime]                   = useState('19:00');
  const [fromDate, setFromDate]                     = useState(toDateInputValue(today));
  const [toDate, setToDate]                         = useState(toDateInputValue(addDaysSimple(today,30)));
  const [allowDropInFallback, setAllowDropInFallback] = useState(false);
  const [preview, setPreview]                       = useState<BulkPreview | null>(null);
  const [loadingPreview, setLoadingPreview]         = useState(false);
  const [running, setRunning]                       = useState(false);
  const [progress, setProgress]                     = useState({ done: 0, total: 0 });
  const [resultMsg, setResultMsg]                   = useState<Feedback>(null);

  useEffect(() => {
    if (!open) return;
    setMemberId(''); setClassId(''); setWeekdayIdx(0); setStartTime('19:00');
    setFromDate(toDateInputValue(today)); setToDate(toDateInputValue(addDaysSimple(today,30)));
    setAllowDropInFallback(false); setPreview(null); setLoadingPreview(false);
    setRunning(false); setProgress({ done:0, total:0 }); setResultMsg(null);
  }, [open]);

  const selectedClass  = useMemo(() => classes.find((c) => c.id === classId) ?? null, [classes, classId]);
  const canUseDropIn   = Boolean(selectedClass?.drop_in_enabled);

  const memberOptions  = useMemo(() => members.map((m) => ({ id: m.id, label: m.full_name || m.email || m.id, sublabel: m.email ?? undefined })), [members]);
  const classOptions   = useMemo(() => classes.map((c) => ({ id: c.id, label: c.title })), [classes]);

  const validate = (): string | null => {
    if (!memberId) return 'Επίλεξε μέλος.';
    if (!classId) return 'Επίλεξε Τμήμα.';
    if (!fromDate || !toDate) return 'Συμπλήρωσε ημερομηνίες.';
    if (dateInputToLocalStart(fromDate).getTime() > dateInputToLocalStart(toDate).getTime()) return 'Το "Από" δεν μπορεί να είναι μετά το "Έως".';
    if (!/^\d{2}:\d{2}$/.test(normalizeHHMM(startTime))) return 'Η ώρα πρέπει να είναι σε μορφή HH:MM.';
    return null;
  };

  async function buildPreview(): Promise<BulkPreview | null> {
    const err = validate();
    if (err) { setResultMsg({ type:'error', message: err }); return null; }
    setResultMsg(null); setLoadingPreview(true); setPreview(null);
    try {
      const from = dateInputToLocalStart(fromDate);
      const to   = addDaysSimple(dateInputToLocalStart(toDate), 1);
      const days = Math.round((to.getTime() - from.getTime()) / 86400000);
      if (days > 370) { setResultMsg({ type:'error', message:'Το εύρος ημερομηνιών είναι πολύ μεγάλο (πάνω από 12 μήνες).' }); setLoadingPreview(false); return null; }

      const { data: sessionRows, error: sessErr } = await supabase.from('class_sessions')
        .select('id,starts_at,class_id').eq('tenant_id', tenantId).eq('class_id', classId)
        .gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).order('starts_at');

      if (sessErr) { setResultMsg({ type:'error', message:'Σφάλμα κατά τη φόρτωση sessions.' }); setLoadingPreview(false); return null; }

      const wantedTime = normalizeHHMM(startTime);
      const matching = (sessionRows ?? []).filter((s: any) => {
        const d = new Date(s.starts_at);
        const dow = d.getDay();
        const mi  = dow===0?6:dow-1;
        return mi === weekdayIdx && `${pad2(d.getHours())}:${pad2(d.getMinutes())}` === wantedTime;
      });

      if (matching.length === 0) {
        const prev: BulkPreview = { matchingCount:0, alreadyBookedCount:0, toCreateCount:0, sessionsToCreate:[] };
        setPreview(prev); setLoadingPreview(false); return prev;
      }

      const { data: existing, error: bErr } = await supabase.from('bookings')
        .select('id,session_id,status').eq('tenant_id', tenantId).eq('user_id', memberId).in('session_id', matching.map((s: any) => s.id));

      if (bErr) { setResultMsg({ type:'error', message:'Σφάλμα κατά τον έλεγχο κρατήσεων.' }); setLoadingPreview(false); return null; }

      const bookedIds = new Set((existing ?? []).filter((b: any) => (b.status ?? '') !== 'canceled').map((b: any) => b.session_id));
      const sessionsToCreate = matching.filter((s: any) => !bookedIds.has(s.id)).map((s: any) => ({ id: s.id, starts_at: s.starts_at }));
      const prev: BulkPreview = { matchingCount: matching.length, alreadyBookedCount: matching.length - sessionsToCreate.length, toCreateCount: sessionsToCreate.length, sessionsToCreate };
      setPreview(prev); setLoadingPreview(false); return prev;
    } catch(e: any) { setResultMsg({ type:'error', message: e?.message || 'Κάτι πήγε στραβά.' }); setLoadingPreview(false); return null; }
  }

  async function runBulkCreate() {
    const prev = preview ?? (await buildPreview());
    if (!prev) return;
    if (prev.toCreateCount === 0) {
      setResultMsg({ type:'error', message: prev.matchingCount===0 ? 'Δεν βρέθηκαν sessions που να ταιριάζουν.' : 'Όλα τα sessions είναι ήδη κλεισμένα.' });
      return;
    }
    setRunning(true); setResultMsg(null); setProgress({ done:0, total:prev.sessionsToCreate.length });
    let ok=0, failed=0;
    const allowDropIn = allowDropInFallback && canUseDropIn;
    for (let i=0; i<prev.sessionsToCreate.length; i++) {
      const s = prev.sessionsToCreate[i];
      setProgress({ done:i, total:prev.sessionsToCreate.length });
      try {
        const { error } = await supabase.rpc('book_session', { p_tenant_id:tenantId, p_session_id:s.id, p_user_id:memberId, p_booking_type:'membership' });
        if (!error) { ok++; continue; }
        if (allowDropIn && isMembershipErrorMessage(error.message || '')) {
          const { error: e2 } = await supabase.rpc('book_session', { p_tenant_id:tenantId, p_session_id:s.id, p_user_id:memberId, p_booking_type:'drop_in' });
          if (!e2) { ok++; continue; }
        }
        failed++;
      } catch { failed++; }
      finally { setProgress({ done:i+1, total:prev.sessionsToCreate.length }); }
    }
    setRunning(false);
    if (ok > 0) onDone();
    setResultMsg({ type:failed===0?'success':'error', message:failed===0 ? `Ολοκληρώθηκε! Δημιουργήθηκαν ${ok} κρατήσεις.` : `Ολοκληρώθηκε με σφάλματα. Επιτυχίες: ${ok} • Αποτυχίες: ${failed}` });
    await buildPreview();
  }

  if (!open) return null;

  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <ModalShell
      title="Μαζικές Κρατήσεις"
      subtitle="Δημιουργία κρατήσεων για ένα μέλος σε εύρος ημερομηνιών"
      onClose={onClose}
      footer={<>
        <SecondaryBtn label="Κλείσιμο" onClick={onClose} disabled={running} />
        <PrimaryBtn busy={running} busyLabel="Δημιουργία…" label="Δημιουργία κρατήσεων" onClick={runBulkCreate} />
      </>}
    >
      {/* Feedback */}
      {resultMsg && <FeedbackBanner feedback={resultMsg} onDismiss={() => setResultMsg(null)} />}

      {/* Member */}
      <FormField label="Μέλος *">
        <SearchableDropdown options={memberOptions} value={memberId} onChange={setMemberId} placeholder="— επίλεξε μέλος —" disabled={running} />
      </FormField>

      {/* Class */}
      <FormField label="Τμήμα *">
        <SearchableDropdown options={classOptions} value={classId} onChange={setClassId} placeholder="— επίλεξε τμήμα —" disabled={running} />
        {selectedClass && (
          <div className="text-[11px] text-text-secondary mt-1">
            Drop-in: {selectedClass.drop_in_enabled ? `Ναι (${selectedClass.drop_in_price ?? 0}€)` : 'Όχι'}
          </div>
        )}
      </FormField>

      {/* Weekday + Time */}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Ημέρα εβδομάδας">
          <div className="relative">
            <select
              className="w-full h-9 pl-3.5 pr-9 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary appearance-none outline-none focus:border-primary/40 transition-all cursor-pointer disabled:opacity-50"
              value={weekdayIdx} onChange={(e) => setWeekdayIdx(Number(e.target.value))} disabled={running}
            >
              {WEEKDAY_LABELS.map((l,i) => <option key={l} value={i}>{l}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
          </div>
        </FormField>
        <FormField label="Ώρα έναρξης">
          <input type="time" disabled={running}
            className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all disabled:opacity-50"
            value={normalizeHHMM(startTime)} onChange={(e) => setStartTime(e.target.value)}
          />
        </FormField>
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Από">
          <input type="date" disabled={running}
            className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all disabled:opacity-50"
            value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          />
        </FormField>
        <FormField label="Έως">
          <input type="date" disabled={running}
            className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all disabled:opacity-50"
            value={toDate} onChange={(e) => setToDate(e.target.value)}
          />
        </FormField>
      </div>

      {/* Drop-in fallback */}
      <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-border/10 bg-secondary/5">
        <div>
          <div className="text-sm font-semibold text-text-primary">Fallback σε Drop-in</div>
          <div className="text-[11px] text-text-secondary mt-0.5">Αν δεν υπάρχει συνδρομή, κάνε κράτηση ως drop-in (μόνο αν επιτρέπεται).</div>
        </div>
        <div
          onClick={() => !running && canUseDropIn && setAllowDropInFallback((v) => !v)}
          className={['w-10 h-6 rounded-full border-2 flex items-center transition-all cursor-pointer shrink-0', allowDropInFallback && canUseDropIn ? 'bg-primary border-primary justify-end' : 'bg-secondary/20 border-border/30 justify-start', running || !canUseDropIn ? 'opacity-40 cursor-not-allowed' : ''].join(' ')}
        >
          <div className="w-4 h-4 rounded-full bg-white shadow mx-0.5" />
        </div>
      </div>
      {!canUseDropIn && allowDropInFallback && (
        <p className="text-[11px] text-warning">Το Τμήμα δεν επιτρέπει drop-in — το fallback δεν θα χρησιμοποιηθεί.</p>
      )}

      {/* Preview */}
      <div className="rounded-xl border border-border/10 bg-secondary/5 px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">Προεπισκόπηση</span>
          <button type="button" onClick={buildPreview} disabled={running || loadingPreview}
            className="h-7 px-3 rounded-lg border border-border/15 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 disabled:opacity-40 transition-all cursor-pointer"
          >
            {loadingPreview ? <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Υπολογισμός…</span> : 'Υπολογισμός'}
          </button>
        </div>

        {preview && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Ταιριάζουν', value: preview.matchingCount, color: 'text-text-primary' },
              { label: 'Ήδη κλεισμένα', value: preview.alreadyBookedCount, color: 'text-text-secondary' },
              { label: 'Θα δημιουργηθούν', value: preview.toCreateCount, color: 'text-primary' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center px-2 py-2 rounded-lg border border-border/10 bg-secondary/5">
                <div className={`text-lg font-black ${color}`}>{value}</div>
                <div className="text-[10px] text-text-secondary mt-0.5">{label}</div>
              </div>
            ))}
            {preview.toCreateCount > 0 && (
              <div className="col-span-3 text-[11px] text-text-secondary">
                Πρώτα: {preview.sessionsToCreate.slice(0,5).map((s) => isoToLocalHHMM(s.starts_at)).join(', ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {running && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-text-secondary">
            <span>Εκτέλεση…</span>
            <span className="font-bold text-text-primary">{progress.done}/{progress.total}</span>
          </div>
          <div className="h-2 rounded-full bg-secondary/20 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function AdminBulkBookingsPage() {
  const { profile, subscription } = useAuth();
  const tenantId = profile?.tenant_id ?? null;

  const [showSubModal, setShowSubModal]               = useState(false);
  const [members, setMembers]                         = useState<Member[]>([]);
  const [membersLoading, setMembersLoading]           = useState(false);
  const [memberSearch, setMemberSearch]               = useState('');
  const [classes, setClasses]                         = useState<SessionClassRel[]>([]);
  const [sessions, setSessions]                       = useState<SessionWithRelations[]>([]);
  const [sessionsLoading, setSessionsLoading]         = useState(false);
  const [weekStart, setWeekStart]                     = useState<Date>(() => startOfWeekMonday(new Date()));
  const [creatingBookingForSession, setCreatingBookingForSession] = useState<string | null>(null);
  const [feedback, setFeedback]                       = useState<Feedback>(null);
  const [dropInPrompt, setDropInPrompt]               = useState<DropInPromptState>(null);
  const [dropInLoading, setDropInLoading]             = useState(false);
  const [detailsSessionId, setDetailsSessionId]       = useState<string | null>(null);
  const [deletingBookingId, setDeletingBookingId]     = useState<string | null>(null);
  const [bulkModalOpen, setBulkModalOpen]             = useState(false);

  const subscriptionInactive = !subscription?.is_active;
  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) { setShowSubModal(true); return; }
    action();
  }

  useEffect(() => {
    if (!tenantId) return;
    setMembersLoading(true);
    supabase.from('profiles').select('id,full_name,email').eq('tenant_id', tenantId).eq('role','member').order('full_name')
      .then(({ data, error }) => {
        if (error) setFeedback({ type:'error', message:'Σφάλμα κατά τη φόρτωση μελών.' });
        else setMembers(data ?? []);
        setMembersLoading(false);
      });
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from('classes').select('id,title,drop_in_enabled,drop_in_price,member_drop_in_price').eq('tenant_id', tenantId).order('title')
      .then(({ data }) => setClasses((data ?? []) as unknown as SessionClassRel[]));
  }, [tenantId]);

  const loadSessions = useCallback(async () => {
    if (!tenantId) return;
    setSessionsLoading(true);
    const weekEnd = addDaysSimple(weekStart, 7);
    const { data, error } = await supabase.from('class_sessions')
      .select(`id,tenant_id,class_id,starts_at,ends_at,classes(id,title,drop_in_enabled,drop_in_price,member_drop_in_price),bookings(id,user_id,status,booking_type,drop_in_price,drop_in_paid,profiles(id,full_name,email))`)
      .eq('tenant_id', tenantId).gte('starts_at', weekStart.toISOString()).lt('starts_at', weekEnd.toISOString()).order('starts_at');
    if (error) setFeedback({ type:'error', message:'Σφάλμα κατά τη φόρτωση μαθημάτων.' });
    else setSessions((data ?? []) as unknown as SessionWithRelations[]);
    setSessionsLoading(false);
  }, [tenantId, weekStart]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const weekLabel = useMemo(() => `${formatDateDMY(weekStart)} – ${formatDateDMY(addDaysSimple(weekStart, 6))}`, [weekStart]);
  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => (m.full_name||'').toLowerCase().includes(q) || (m.email||'').toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }, [members, memberSearch]);

  const sessionsByDay: Record<number, SessionWithRelations[]> = useMemo(() => {
    const map: Record<number, SessionWithRelations[]> = {};
    for (const s of sessions) {
      const dow = new Date(s.starts_at).getDay();
      const mi  = dow===0?6:dow-1;
      if (!map[mi]) map[mi] = [];
      map[mi].push(s);
    }
    return map;
  }, [sessions]);

  function handleWeekChange(dir: 'prev' | 'next' | 'this') {
    if (dir === 'this') setWeekStart(startOfWeekMonday(new Date()));
    else setWeekStart((prev) => addDaysSimple(prev, dir==='next'?7:-7));
  }

  function handleMemberDragStart(e: DragEvent<HTMLButtonElement>, memberId: string) {
    e.dataTransfer.setData('text/plain', memberId);
    e.dataTransfer.effectAllowed = 'copyMove';
  }

  async function handleDropOnSession(e: DragEvent<HTMLDivElement>, sessionId: string) {
    e.preventDefault(); e.stopPropagation();
    const memberId = e.dataTransfer.getData('text/plain');
    if (memberId) await createBookingForMember(memberId, sessionId);
  }

  async function createBookingForMember(memberId: string, sessionId: string) {
    if (!tenantId) return;
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    if (session.bookings?.some((b) => b.user_id === memberId && (b.status ?? '') !== 'canceled')) {
      setFeedback({ type:'error', message:'Το μέλος είναι ήδη κλεισμένο σε αυτό το μάθημα.' }); return;
    }
    setCreatingBookingForSession(sessionId); setFeedback(null);
    try {
      const { error } = await supabase.rpc('book_session', { p_tenant_id:tenantId, p_session_id:sessionId, p_user_id:memberId, p_booking_type:'membership' });
      if (error) {
        const msg = error.message || '';
        if (!isMembershipErrorMessage(msg)) { setFeedback({ type:'error', message: msg || 'Κάτι πήγε στραβά.' }); return; }
        const cls = getSessionClass(session);
        if (!cls?.drop_in_enabled) { setFeedback({ type:'error', message:'Το μέλος δεν έχει κατάλληλη συνδρομή και το μάθημα δεν επιτρέπει drop-in.' }); return; }
        setDropInPrompt({ memberId, sessionId }); return;
      }
      await loadSessions();
      setFeedback({ type:'success', message:'Η κράτηση με συνδρομή δημιουργήθηκε με επιτυχία.' });
    } catch(e: any) { setFeedback({ type:'error', message: e?.message || 'Κάτι πήγε στραβά.' }); }
    finally { setCreatingBookingForSession(null); }
  }

  async function handleDeleteBooking(bookingId: string) {
    if (!tenantId || !window.confirm('Να διαγραφεί οριστικά αυτή η κράτηση;')) return;
    setDeletingBookingId(bookingId); setFeedback(null);
    try {
      const res = await supabase.functions.invoke('booking-delete', { body: { id: bookingId } });
      const errMsg = (res.data as any)?.error ?? res.error?.message ?? '';
      if (res.error || (res.data as any)?.error) { setFeedback({ type:'error', message: errMsg || 'Σφάλμα κατά τη διαγραφή.' }); return; }
      await loadSessions();
      setFeedback({ type:'success', message:'Η κράτηση διαγράφηκε.' });
    } catch(e: any) { setFeedback({ type:'error', message: e?.message || 'Κάτι πήγε στραβά.' }); }
    finally { setDeletingBookingId(null); }
  }

  async function confirmDropIn() {
    if (!tenantId || !dropInPrompt) return;
    const { memberId, sessionId } = dropInPrompt;
    setDropInLoading(true); setFeedback(null);
    try {
      const { error } = await supabase.rpc('book_session', { p_tenant_id:tenantId, p_session_id:sessionId, p_user_id:memberId, p_booking_type:'drop_in' });
      if (error) { setFeedback({ type:'error', message: error.message || 'Κάτι πήγε στραβά.' }); return; }
      await loadSessions();
      setFeedback({ type:'success', message:'Η κράτηση ως drop-in δημιουργήθηκε με επιτυχία.' });
      setDropInPrompt(null);
    } catch(e: any) { setFeedback({ type:'error', message: e?.message || 'Κάτι πήγε στραβά.' }); }
    finally { setDropInLoading(false); }
  }

  if (!tenantId) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />Δεν βρέθηκε tenant_id στο προφίλ διαχειριστή.
        </div>
      </div>
    );
  }

  const detailsSession = sessions.find((s) => s.id === detailsSessionId) ?? null;

  return (
    <>
      <div className="flex flex-col md:flex-row gap-3 md:gap-4 p-3 md:p-4 h-full">

        {/* ── Sidebar: Members ── */}
        <aside className="w-full md:w-68 order-2 md:order-1 flex flex-col rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-4 pt-4 pb-3 border-b border-border/10">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                <Users className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-black text-text-primary tracking-tight">Μέλη</h2>
                <p className="text-[10px] text-text-secondary">{membersLoading ? '…' : `${filteredMembers.length} μέλη`}</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary pointer-events-none" />
              <input
                className="w-full h-8 pl-8 pr-3 rounded-xl border border-border/15 bg-secondary/10 text-xs text-text-primary placeholder:text-text-secondary outline-none focus:border-primary/40 transition-all"
                placeholder="Αναζήτηση μέλους…"
                value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
              />
            </div>
            <p className="text-[10px] text-text-secondary mt-2 opacity-70">Σύρε ένα μέλος σε μάθημα για κράτηση</p>
          </div>

          {/* Member list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {membersLoading && <div className="flex items-center justify-center gap-1.5 py-6 text-text-secondary text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin" />Φόρτωση…</div>}
            {!membersLoading && filteredMembers.length === 0 && <div className="text-xs text-text-secondary opacity-50 text-center py-6 italic">Δεν βρέθηκαν μέλη.</div>}
            {!membersLoading && filteredMembers.map((m) => (
              <button
                key={m.id} type="button" draggable
                onDragStart={(e) => handleMemberDragStart(e, m.id)}
                className="w-full flex items-center gap-2.5 rounded-xl border border-border/10 bg-secondary/5 hover:bg-secondary/20 px-3 py-2 text-left transition-colors cursor-grab active:cursor-grabbing group"
              >
                <GripVertical className="h-3 w-3 text-text-secondary opacity-30 group-hover:opacity-60 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-text-primary truncate">{m.full_name || m.email || m.id}</div>
                  {m.email && <div className="text-[10px] text-text-secondary truncate">{m.email}</div>}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* ── Main: Week calendar ── */}
        <main className="order-1 md:order-2 flex-1 flex flex-col rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-border/10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <h1 className="text-sm font-black text-text-primary tracking-tight">Πρόγραμμα εβδομάδας</h1>
                  <p className="text-[10px] text-text-secondary">{weekLabel}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button onClick={() => handleWeekChange('prev')}
                  className="h-8 w-8 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => handleWeekChange('this')}
                  className="h-8 px-3 rounded-xl border border-border/15 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">
                  Σήμερα
                </button>
                <button onClick={() => handleWeekChange('next')}
                  className="h-8 w-8 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">
                  <ChevronRight className="h-4 w-4" />
                </button>

                <button
                  onClick={() => requireActiveSubscription(() => setBulkModalOpen(true))}
                  className="group relative inline-flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px transition-all cursor-pointer overflow-hidden"
                >
                  <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                  <CalendarPlus className="h-3.5 w-3.5 relative z-10" />
                  <span className="relative z-10 hidden sm:inline">Μαζικές κρατήσεις</span>
                </button>
              </div>
            </div>

            {/* Feedback */}
            {feedback && (
              <div className="mt-3">
                <FeedbackBanner feedback={feedback} onDismiss={() => setFeedback(null)} />
              </div>
            )}
          </div>

          {/* Week grid */}
          <div className="flex-1 p-3 overflow-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2 h-full min-h-80">
              {WEEKDAY_LABELS.map((label, idx) => {
                const dayDate     = addDaysSimple(weekStart, idx);
                const daySessions = sessionsByDay[idx] ?? [];
                const isToday     = formatDateDMY(dayDate) === formatDateDMY(new Date());

                return (
                  <div key={label} className={['flex flex-col rounded-xl border overflow-hidden', isToday ? 'border-primary/30 bg-primary/3' : 'border-border/10 bg-secondary/3'].join(' ')}>
                    {/* Day header */}
                    <div className={['px-2.5 py-2 border-b flex items-center justify-between', isToday ? 'border-primary/20 bg-primary/8' : 'border-border/8 bg-secondary/5'].join(' ')}>
                      <div>
                        <div className={['text-[11px] font-black uppercase tracking-wider', isToday ? 'text-primary' : 'text-text-secondary'].join(' ')}>{label}</div>
                        <div className="text-[10px] text-text-secondary">{formatDateDMY(dayDate)}</div>
                      </div>
                      {isToday && <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                    </div>

                    {/* Sessions */}
                    <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto">
                      {sessionsLoading && idx === 0 && (
                        <div className="flex items-center justify-center gap-1 py-4 text-text-secondary text-[11px]">
                          <Loader2 className="h-3 w-3 animate-spin" />
                        </div>
                      )}
                      {!sessionsLoading && daySessions.length === 0 && (
                        <div className="text-[10px] text-text-secondary opacity-30 text-center py-4 italic">Χωρίς μαθήματα</div>
                      )}
                      {daySessions.map((s) => {
                        const cls         = getSessionClass(s);
                        const bookingCount = s.bookings?.length ?? 0;
                        const isCreating  = creatingBookingForSession === s.id;

                        return (
                          <div
                            key={s.id}
                            className="rounded-lg border border-border/10 bg-secondary-background/80 p-2 text-[11px] space-y-1.5 hover:border-primary/20 hover:bg-primary/3 transition-all"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => requireActiveSubscription(() => handleDropOnSession(e, s.id))}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="font-bold text-text-primary truncate leading-tight">{cls?.title ?? 'Μάθημα'}</span>
                              {isCreating && <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />}
                            </div>

                            <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                              <Clock className="h-2.5 w-2.5 shrink-0" />
                              {formatTimeRange(s.starts_at, s.ends_at)}
                            </div>

                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                                <Users className="h-2.5 w-2.5 shrink-0" />
                                <span className="font-semibold text-text-primary">{bookingCount}</span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setDetailsSessionId(s.id); }}
                                className="flex items-center gap-0.5 text-[10px] text-primary hover:text-primary/80 font-semibold cursor-pointer"
                              >
                                <Eye className="h-2.5 w-2.5" />Προβολή
                              </button>
                            </div>

                            <div className="text-[9px] text-text-secondary opacity-30 border-t border-border/5 pt-1">
                              Ρίξε μέλος εδώ
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {/* ── Bulk modal ── */}
      {tenantId && (
        <BulkBookingsModal
          open={bulkModalOpen} tenantId={tenantId} members={members} classes={classes}
          onClose={() => setBulkModalOpen(false)} onDone={loadSessions}
        />
      )}

      {/* ── Drop-in prompt modal ── */}
      {dropInPrompt && (() => {
        const member  = members.find((m) => m.id === dropInPrompt.memberId);
        const session = sessions.find((s) => s.id === dropInPrompt.sessionId);
        const cls     = session ? getSessionClass(session) : null;
        const when    = session ? `${formatDateDMY(new Date(session.starts_at))} · ${formatTimeRange(session.starts_at, session.ends_at)}` : '';
        return (
          <ModalShell
            title="Κράτηση ως drop-in;"
            icon={<Zap className="h-4 w-4 text-warning" />}
            onClose={() => setDropInPrompt(null)}
            footer={<>
              <SecondaryBtn label="Ακύρωση" onClick={() => setDropInPrompt(null)} disabled={dropInLoading} />
              <PrimaryBtn busy={dropInLoading} busyLabel="Γίνεται κράτηση…" label="Ναι, ως drop-in" onClick={confirmDropIn} />
            </>}
          >
            <div className="text-sm text-text-secondary leading-relaxed">
              Το μέλος <span className="font-bold text-text-primary">{member?.full_name || member?.email || '—'}</span> δεν έχει κατάλληλη ενεργή συνδρομή για το μάθημα <span className="font-bold text-text-primary">{cls?.title ?? '—'}</span>.
            </div>
            <div className="px-4 py-3 rounded-xl border border-border/10 bg-secondary/5 space-y-1 text-xs text-text-secondary">
              {when && <div className="flex items-center gap-1.5"><CalendarDays className="h-3 w-3" />{when}</div>}
              {cls?.drop_in_price != null && <div className="flex items-center gap-1.5"><span className="font-bold text-text-primary">{cls.drop_in_price}€</span> τιμή drop-in</div>}
            </div>
          </ModalShell>
        );
      })()}

      {/* ── Session details modal ── */}
      {detailsSession && (() => {
        const cls   = getSessionClass(detailsSession);
        const when  = `${formatDateDMY(new Date(detailsSession.starts_at))} · ${formatTimeRange(detailsSession.starts_at, detailsSession.ends_at)}`;
        const sorted = [...(detailsSession.bookings ?? [])].sort((a,b) => {
          const an = a.profiles?.full_name || a.profiles?.email || a.user_id || '';
          const bn = b.profiles?.full_name || b.profiles?.email || b.user_id || '';
          return an.localeCompare(bn, 'el');
        });

        return (
          <ModalShell
            title={cls?.title ?? 'Μάθημα'}
            icon={<CalendarDays className="h-4 w-4 text-primary" />}
            subtitle={when}
            onClose={() => setDetailsSessionId(null)}
          >
            <div className="text-xs text-text-secondary">
              Σύνολο κρατήσεων: <span className="font-bold text-text-primary">{sorted.length}</span>
            </div>

            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {sorted.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-text-secondary">
                  <Users className="h-6 w-6 opacity-25" />
                  <span className="text-xs">Δεν υπάρχουν κρατήσεις για αυτό το μάθημα.</span>
                </div>
              )}
              {sorted.map((b) => {
                const name    = b.profiles?.full_name || b.profiles?.email || b.user_id;
                const isDropIn = b.booking_type === 'drop_in';
                const isDeleting = deletingBookingId === b.id;
                return (
                  <div key={b.id} className="flex items-start justify-between gap-3 rounded-xl border border-border/10 bg-secondary/5 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text-primary truncate">{name}</div>
                      {b.profiles?.email && <div className="text-[11px] text-text-secondary">{b.profiles.email}</div>}
                      {isDropIn && (
                        <div className="text-[11px] text-text-secondary mt-0.5">
                          {b.drop_in_price ?? 0}€ · {b.drop_in_paid ? <span className="text-success">Πληρωμένο</span> : <span className="text-warning">Οφειλή</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${isDropIn ? 'border-warning/40 bg-warning/10 text-warning' : 'border-success/40 bg-success/10 text-success'}`}>
                        {isDropIn ? 'Drop-in' : 'Συνδρομή'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteBooking(b.id)}
                        disabled={isDeleting}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-xl border border-danger/20 text-danger hover:bg-danger/10 disabled:opacity-40 transition-all cursor-pointer"
                      >
                        {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ModalShell>
        );
      })()}

      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </>
  );
}