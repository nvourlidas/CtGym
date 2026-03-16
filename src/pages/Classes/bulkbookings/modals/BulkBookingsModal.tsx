import { useEffect, useMemo, useState } from 'react';
import { Loader2, ChevronDown } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import type { Member, SessionClassRel, BulkPreview, Feedback } from '../types';
import {
  normalizeHHMM, toDateInputValue, dateInputToLocalStart, addDaysSimple,
  pad2, isoToLocalHHMM, WEEKDAY_LABELS, isMembershipErrorMessage,
} from '../bulkBookingUtils';
import ModalShell from '../components/ModalShell';
import FormField from '../components/FormField';
import FeedbackBanner from '../components/FeedbackBanner';
import PrimaryBtn from '../components/PrimaryBtn';
import SecondaryBtn from '../components/SecondaryBtn';
import SearchableDropdown from '../components/SearchableDropdown';

export default function BulkBookingsModal({ open, tenantId, members, classes, onClose, onDone }: {
  open: boolean; tenantId: string; members: Member[]; classes: SessionClassRel[];
  onClose: () => void; onDone: () => void;
}) {
  const today = new Date();
  const [memberId, setMemberId]                   = useState('');
  const [classId, setClassId]                     = useState('');
  const [weekdayIdx, setWeekdayIdx]               = useState(0);
  const [startTime, setStartTime]                 = useState('19:00');
  const [fromDate, setFromDate]                   = useState(toDateInputValue(today));
  const [toDate, setToDate]                       = useState(toDateInputValue(addDaysSimple(today, 30)));
  const [allowDropInFallback, setAllowDropInFallback] = useState(false);
  const [preview, setPreview]                     = useState<BulkPreview | null>(null);
  const [loadingPreview, setLoadingPreview]       = useState(false);
  const [running, setRunning]                     = useState(false);
  const [progress, setProgress]                   = useState({ done: 0, total: 0 });
  const [resultMsg, setResultMsg]                 = useState<Feedback>(null);

  useEffect(() => {
    if (!open) return;
    setMemberId(''); setClassId(''); setWeekdayIdx(0); setStartTime('19:00');
    setFromDate(toDateInputValue(today)); setToDate(toDateInputValue(addDaysSimple(today, 30)));
    setAllowDropInFallback(false); setPreview(null); setLoadingPreview(false);
    setRunning(false); setProgress({ done: 0, total: 0 }); setResultMsg(null);
  }, [open]);

  const selectedClass = useMemo(() => classes.find((c) => c.id === classId) ?? null, [classes, classId]);
  const canUseDropIn  = Boolean(selectedClass?.drop_in_enabled);

  const memberOptions = useMemo(() => members.map((m) => ({ id: m.id, label: m.full_name || m.email || m.id, sublabel: m.email ?? undefined })), [members]);
  const classOptions  = useMemo(() => classes.map((c) => ({ id: c.id, label: c.title })), [classes]);

  const validate = (): string | null => {
    if (!memberId) return 'Επίλεξε μέλος.';
    if (!classId)  return 'Επίλεξε Τμήμα.';
    if (!fromDate || !toDate) return 'Συμπλήρωσε ημερομηνίες.';
    if (dateInputToLocalStart(fromDate).getTime() > dateInputToLocalStart(toDate).getTime()) return 'Το "Από" δεν μπορεί να είναι μετά το "Έως".';
    if (!/^\d{2}:\d{2}$/.test(normalizeHHMM(startTime))) return 'Η ώρα πρέπει να είναι σε μορφή HH:MM.';
    return null;
  };

  async function buildPreview(): Promise<BulkPreview | null> {
    const err = validate();
    if (err) { setResultMsg({ type: 'error', message: err }); return null; }
    setResultMsg(null); setLoadingPreview(true); setPreview(null);
    try {
      const from = dateInputToLocalStart(fromDate);
      const to   = addDaysSimple(dateInputToLocalStart(toDate), 1);
      const days = Math.round((to.getTime() - from.getTime()) / 86400000);
      if (days > 370) { setResultMsg({ type: 'error', message: 'Το εύρος ημερομηνιών είναι πολύ μεγάλο (πάνω από 12 μήνες).' }); setLoadingPreview(false); return null; }

      const { data: sessionRows, error: sessErr } = await supabase.from('class_sessions')
        .select('id,starts_at,class_id').eq('tenant_id', tenantId).eq('class_id', classId)
        .gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).order('starts_at');

      if (sessErr) { setResultMsg({ type: 'error', message: 'Σφάλμα κατά τη φόρτωση sessions.' }); setLoadingPreview(false); return null; }

      const wantedTime = normalizeHHMM(startTime);
      const matching   = (sessionRows ?? []).filter((s: any) => {
        const d   = new Date(s.starts_at);
        const dow = d.getDay();
        const mi  = dow === 0 ? 6 : dow - 1;
        return mi === weekdayIdx && `${pad2(d.getHours())}:${pad2(d.getMinutes())}` === wantedTime;
      });

      if (matching.length === 0) {
        const prev: BulkPreview = { matchingCount: 0, alreadyBookedCount: 0, toCreateCount: 0, sessionsToCreate: [] };
        setPreview(prev); setLoadingPreview(false); return prev;
      }

      const { data: existing, error: bErr } = await supabase.from('bookings')
        .select('id,session_id,status').eq('tenant_id', tenantId).eq('user_id', memberId).in('session_id', matching.map((s: any) => s.id));

      if (bErr) { setResultMsg({ type: 'error', message: 'Σφάλμα κατά τον έλεγχο κρατήσεων.' }); setLoadingPreview(false); return null; }

      const bookedIds = new Set((existing ?? []).filter((b: any) => (b.status ?? '') !== 'cancelled').map((b: any) => b.session_id));
      const sessionsToCreate = matching.filter((s: any) => !bookedIds.has(s.id)).map((s: any) => ({ id: s.id, starts_at: s.starts_at }));
      const prev: BulkPreview = { matchingCount: matching.length, alreadyBookedCount: matching.length - sessionsToCreate.length, toCreateCount: sessionsToCreate.length, sessionsToCreate };
      setPreview(prev); setLoadingPreview(false); return prev;
    } catch (e: any) { setResultMsg({ type: 'error', message: e?.message || 'Κάτι πήγε στραβά.' }); setLoadingPreview(false); return null; }
  }

  async function runBulkCreate() {
    const prev = preview ?? (await buildPreview());
    if (!prev) return;
    if (prev.toCreateCount === 0) {
      setResultMsg({ type: 'error', message: prev.matchingCount === 0 ? 'Δεν βρέθηκαν sessions που να ταιριάζουν.' : 'Όλα τα sessions είναι ήδη κλεισμένα.' });
      return;
    }
    setRunning(true); setResultMsg(null); setProgress({ done: 0, total: prev.sessionsToCreate.length });
    let ok = 0, failed = 0;
    const allowDropIn = allowDropInFallback && canUseDropIn;
    for (let i = 0; i < prev.sessionsToCreate.length; i++) {
      const s = prev.sessionsToCreate[i];
      setProgress({ done: i, total: prev.sessionsToCreate.length });
      try {
        const res = await supabase.functions.invoke('booking-create', { body: { tenant_id: tenantId, session_id: s.id, user_id: memberId, booking_type: 'membership' } });
        const errMsg = (res.data as any)?.error ?? res.error?.message ?? '';
        if (!res.error && !(res.data as any)?.error) { ok++; continue; }
        if (allowDropIn && isMembershipErrorMessage(errMsg || '')) {
          const res2 = await supabase.functions.invoke('booking-create', { body: { tenant_id: tenantId, session_id: s.id, user_id: memberId, booking_type: 'drop_in' } });
          if (!res2.error && !(res2.data as any)?.error) { ok++; continue; }
        }
        failed++;
      } catch { failed++; }
      finally { setProgress({ done: i + 1, total: prev.sessionsToCreate.length }); }
    }
    setRunning(false);
    if (ok > 0) onDone();
    setResultMsg({ type: failed === 0 ? 'success' : 'error', message: failed === 0 ? `Ολοκληρώθηκε! Δημιουργήθηκαν ${ok} κρατήσεις.` : `Ολοκληρώθηκε με σφάλματα. Επιτυχίες: ${ok} • Αποτυχίες: ${failed}` });
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
      {resultMsg && <FeedbackBanner feedback={resultMsg} onDismiss={() => setResultMsg(null)} />}

      <FormField label="Μέλος *">
        <SearchableDropdown options={memberOptions} value={memberId} onChange={setMemberId} placeholder="— επίλεξε μέλος —" disabled={running} />
      </FormField>

      <FormField label="Τμήμα *">
        <SearchableDropdown options={classOptions} value={classId} onChange={setClassId} placeholder="— επίλεξε τμήμα —" disabled={running} />
        {selectedClass && (
          <div className="text-[11px] text-text-secondary mt-1">
            Drop-in: {selectedClass.drop_in_enabled ? `Ναι (${selectedClass.drop_in_price ?? 0}€)` : 'Όχι'}
          </div>
        )}
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Ημέρα εβδομάδας">
          <div className="relative">
            <select className="w-full h-9 pl-3.5 pr-9 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary appearance-none outline-none focus:border-primary/40 transition-all cursor-pointer disabled:opacity-50"
              value={weekdayIdx} onChange={(e) => setWeekdayIdx(Number(e.target.value))} disabled={running}
            >
              {WEEKDAY_LABELS.map((l, i) => <option key={l} value={i}>{l}</option>)}
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
              { label: 'Ταιριάζουν',       value: preview.matchingCount,      color: 'text-text-primary' },
              { label: 'Ήδη κλεισμένα',    value: preview.alreadyBookedCount, color: 'text-text-secondary' },
              { label: 'Θα δημιουργηθούν', value: preview.toCreateCount,      color: 'text-primary' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center px-2 py-2 rounded-lg border border-border/10 bg-secondary/5">
                <div className={`text-lg font-black ${color}`}>{value}</div>
                <div className="text-[10px] text-text-secondary mt-0.5">{label}</div>
              </div>
            ))}
            {preview.toCreateCount > 0 && (
              <div className="col-span-3 text-[11px] text-text-secondary">
                Πρώτα: {preview.sessionsToCreate.slice(0, 5).map((s) => isoToLocalHHMM(s.starts_at)).join(', ')}
              </div>
            )}
          </div>
        )}
      </div>

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
