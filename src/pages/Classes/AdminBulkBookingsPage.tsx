import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import { Trash2 } from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';

type Member = { id: string; full_name: string | null; email: string | null };

type SessionClassRel = {
  id: string;
  title: string;
  drop_in_enabled: boolean | null;
  drop_in_price: number | null;
  member_drop_in_price: number | null;
};

type BookingWithProfile = {
  id: string;
  user_id: string;
  status: string | null;
  booking_type: string | null;
  drop_in_price: number | null;
  drop_in_paid: boolean | null;
  profiles: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
};

type SessionWithRelations = {
  id: string;
  tenant_id: string;
  class_id: string | null;
  starts_at: string;
  ends_at: string | null;
  // μπορεί να έρθει σαν object ή array
  classes: SessionClassRel | SessionClassRel[] | null;
  bookings: BookingWithProfile[];
};

type Feedback =
  | {
    type: 'success' | 'error';
    message: string;
  }
  | null;

type DropInPromptState = {
  memberId: string;
  sessionId: string;
} | null;

/* ------------ small helpers ------------ */

function getSessionClass(s: SessionWithRelations): SessionClassRel | null {
  if (!s.classes) return null;
  return Array.isArray(s.classes) ? s.classes[0] ?? null : s.classes;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoToLocalHHMM(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function normalizeHHMM(value: string): string {
  // handles "9:0" -> "09:00"
  const [hRaw, mRaw] = value.split(':');
  const h = pad2(Number(hRaw || 0));
  const m = pad2(Number(mRaw || 0));
  return `${h}:${m}`;
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function dateInputToLocalStart(value: string): Date {
  const [y, m, d] = value.split('-').map((x) => Number(x));
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

function formatDateDMY(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun,1=Mon,...6=Sat
  const diff = day === 0 ? -6 : 1 - day; // Monday as first
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDaysSimple(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatTimeRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  const sh = String(start.getHours()).padStart(2, '0');
  const sm = String(start.getMinutes()).padStart(2, '0');

  if (!endIso) return `${sh}:${sm}`;

  const end = new Date(endIso);
  const eh = String(end.getHours()).padStart(2, '0');
  const em = String(end.getMinutes()).padStart(2, '0');
  return `${sh}:${sm} – ${eh}:${em}`;
}

// Monday–Sunday labels (we'll display columns Monday-first)
const WEEKDAY_LABELS = ['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ'];

// errors from book_session that mean: "no valid membership"
const MEMBERSHIP_ERROR_CODES = [
  'no_active_membership',
  'membership_category_mismatch',
  'no_eligible_membership_for_booking',
];

function isMembershipErrorMessage(msg: string): boolean {
  return MEMBERSHIP_ERROR_CODES.some((code) => msg.includes(code));
}

/* ------------ Bulk Bookings Modal ------------ */

type BulkModalProps = {
  open: boolean;
  tenantId: string;
  members: Member[];
  classes: SessionClassRel[];
  onClose: () => void;
  onDone: () => void; // refresh current week after success
};

type BulkPreview = {
  matchingCount: number;
  alreadyBookedCount: number;
  toCreateCount: number;
  sessionsToCreate: { id: string; starts_at: string }[];
};

function BulkBookingsModal({
  open,
  tenantId,
  members,
  classes,
  onClose,
  onDone,
}: BulkModalProps) {
  const today = new Date();
  const defaultFrom = toDateInputValue(today);
  const defaultTo = toDateInputValue(addDaysSimple(today, 30));

  const [memberSearch, setMemberSearch] = useState('');
  const [memberId, setMemberId] = useState<string>('');
  const [classId, setClassId] = useState<string>('');
  const [weekdayIdx, setWeekdayIdx] = useState<number>(0); // 0=Mon ... 6=Sun
  const [startTime, setStartTime] = useState<string>('19:00');
  const [fromDate, setFromDate] = useState<string>(defaultFrom);
  const [toDate, setToDate] = useState<string>(defaultTo);

  const [allowDropInFallback, setAllowDropInFallback] = useState<boolean>(false);

  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  const [resultMsg, setResultMsg] = useState<Feedback>(null);

  useEffect(() => {
    if (!open) return;

    // reset when opened
    setMemberSearch('');
    setMemberId('');
    setClassId('');
    setWeekdayIdx(0);
    setStartTime('19:00');
    setFromDate(defaultFrom);
    setToDate(defaultTo);
    setAllowDropInFallback(false);

    setPreview(null);
    setLoadingPreview(false);
    setRunning(false);
    setProgress({ done: 0, total: 0 });
    setResultMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const name = (m.full_name || '').toLowerCase();
      const email = (m.email || '').toLowerCase();
      return (
        name.includes(q) ||
        email.includes(q) ||
        m.id.toLowerCase().includes(q)
      );
    });
  }, [members, memberSearch]);

  const selectedMember = useMemo(
    () => members.find((m) => m.id === memberId) ?? null,
    [members, memberId],
  );

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? null,
    [classes, classId],
  );

  const canUseDropInFallback = Boolean(selectedClass?.drop_in_enabled);

  const validate = (): string | null => {
    if (!memberId) return 'Επίλεξε μέλος.';
    if (!classId) return 'Επίλεξε Τμήμα.';
    if (!fromDate || !toDate) return 'Συμπλήρωσε ημερομηνίες.';
    const a = dateInputToLocalStart(fromDate);
    const b = dateInputToLocalStart(toDate);
    if (a.getTime() > b.getTime()) return 'Το "Από" δεν μπορεί να είναι μετά το "Έως".';
    const hhmm = normalizeHHMM(startTime);
    if (!/^\d{2}:\d{2}$/.test(hhmm)) return 'Η ώρα πρέπει να είναι σε μορφή HH:MM.';
    return null;
  };

  async function buildPreview(): Promise<BulkPreview | null> {
    const validation = validate();
    if (validation) {
      setResultMsg({ type: 'error', message: validation });
      return null;
    }

    setResultMsg(null);
    setLoadingPreview(true);
    setPreview(null);

    try {
      const from = dateInputToLocalStart(fromDate);
      const to = dateInputToLocalStart(toDate);
      const toExclusive = addDaysSimple(to, 1); // inclusive range

      // hard guard for huge ranges (optional safety)
      const days = Math.round((toExclusive.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
      if (days > 370) {
        setResultMsg({
          type: 'error',
          message: 'Το εύρος ημερομηνιών είναι πολύ μεγάλο (πάνω από 12 μήνες).',
        });
        setLoadingPreview(false);
        return null;
      }

      // fetch sessions in range (for selected class)
      const { data: sessionRows, error: sessErr } = await supabase
        .from('class_sessions')
        .select('id, starts_at, class_id')
        .eq('tenant_id', tenantId)
        .eq('class_id', classId)
        .gte('starts_at', from.toISOString())
        .lt('starts_at', toExclusive.toISOString())
        .order('starts_at', { ascending: true });

      if (sessErr) {
        console.error(sessErr);
        setResultMsg({ type: 'error', message: 'Σφάλμα κατά τη φόρτωση sessions.' });
        setLoadingPreview(false);
        return null;
      }

      const wantedTime = normalizeHHMM(startTime);

      const matching = (sessionRows ?? []).filter((s: any) => {
        const d = new Date(s.starts_at);
        const dow = d.getDay(); // Sunday=0
        const mondayIndex = dow === 0 ? 6 : dow - 1; // 0=Mon..6=Sun
        if (mondayIndex !== weekdayIdx) return false;

        const hhmm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
        return hhmm === wantedTime;
      });

      if (matching.length === 0) {
        const prev: BulkPreview = {
          matchingCount: 0,
          alreadyBookedCount: 0,
          toCreateCount: 0,
          sessionsToCreate: [],
        };
        setPreview(prev);
        setLoadingPreview(false);
        return prev;
      }

      const sessionIds = matching.map((s: any) => s.id);

      // check existing bookings for that member in those sessions
      const { data: existing, error: bErr } = await supabase
        .from('bookings')
        .select('id, session_id, status')
        .eq('tenant_id', tenantId)
        .eq('user_id', memberId)
        .in('session_id', sessionIds);

      if (bErr) {
        console.error(bErr);
        setResultMsg({ type: 'error', message: 'Σφάλμα κατά τον έλεγχο υπαρχουσών κρατήσεων.' });
        setLoadingPreview(false);
        return null;
      }

      const activeBookedSessionIds = new Set(
        (existing ?? [])
          .filter((b: any) => (b.status ?? '') !== 'canceled')
          .map((b: any) => b.session_id),
      );

      const sessionsToCreate = matching
        .filter((s: any) => !activeBookedSessionIds.has(s.id))
        .map((s: any) => ({ id: s.id, starts_at: s.starts_at }));

      const prev: BulkPreview = {
        matchingCount: matching.length,
        alreadyBookedCount: matching.length - sessionsToCreate.length,
        toCreateCount: sessionsToCreate.length,
        sessionsToCreate,
      };

      setPreview(prev);
      setLoadingPreview(false);
      return prev;
    } catch (e: any) {
      console.error(e);
      setResultMsg({ type: 'error', message: e?.message || 'Κάτι πήγε στραβά.' });
      setLoadingPreview(false);
      return null;
    }
  }

  async function runBulkCreate() {
    const prev = preview ?? (await buildPreview());
    if (!prev) return;

    if (prev.toCreateCount === 0) {
      setResultMsg({
        type: 'error',
        message:
          prev.matchingCount === 0
            ? 'Δεν βρέθηκαν sessions που να ταιριάζουν.'
            : 'Όλα τα sessions είναι ήδη κλεισμένα για αυτό το μέλος.',
      });
      return;
    }

    setRunning(true);
    setResultMsg(null);
    setProgress({ done: 0, total: prev.sessionsToCreate.length });

    let ok = 0;
    let failed = 0;

    const allowDropIn = allowDropInFallback && canUseDropInFallback;

    for (let i = 0; i < prev.sessionsToCreate.length; i++) {
      const s = prev.sessionsToCreate[i];
      setProgress({ done: i, total: prev.sessionsToCreate.length });

      try {
        // 1) membership attempt
        const { error } = await supabase.rpc('book_session', {
          p_tenant_id: tenantId,
          p_session_id: s.id,
          p_user_id: memberId,
          p_booking_type: 'membership',
        });

        if (!error) {
          ok++;
          continue;
        }

        const msg = error.message || '';

        // 2) optional drop-in fallback
        if (allowDropIn && isMembershipErrorMessage(msg)) {
          const { error: e2 } = await supabase.rpc('book_session', {
            p_tenant_id: tenantId,
            p_session_id: s.id,
            p_user_id: memberId,
            p_booking_type: 'drop_in',
          });

          if (!e2) {
            ok++;
            continue;
          }

          failed++;
          continue;
        }

        // other errors
        failed++;
      } catch (e) {
        failed++;
      } finally {
        setProgress({ done: i + 1, total: prev.sessionsToCreate.length });
      }
    }

    setRunning(false);

    if (ok > 0) {
      onDone(); // refresh current week view
    }

    setResultMsg({
      type: failed === 0 ? 'success' : 'error',
      message:
        failed === 0
          ? `Ολοκληρώθηκε! Δημιουργήθηκαν ${ok} κρατήσεις.`
          : `Ολοκληρώθηκε με σφάλματα. Επιτυχίες: ${ok} • Αποτυχίες: ${failed}`,
    });

    // refresh preview after run
    await buildPreview();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-3">
      <div className="w-full max-w-lg rounded-xl border border-border/15 bg-secondary-background p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Μαζικές κρατήσεις</h3>
            <p className="text-[11px] text-text-primary/60">
              Θα δημιουργηθούν κρατήσεις για όλα τα sessions στο εύρος ημερομηνιών που
              είναι στην επιλεγμένη ημέρα και ξεκινάνε στην επιλεγμένη ώρα.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-text-primary/60 hover:text-text-primary"
            disabled={running}
          >
            ✕
          </button>
        </div>

        {resultMsg && (
          <div
            className={`mb-3 rounded-md px-3 py-2 text-[11px] ${resultMsg.type === 'success'
              ? 'bg-emerald-900/40 text-emerald-500 border border-emerald-500/40'
              : 'bg-red-900/40 text-red-100 border border-red-500/40'
              }`}
          >
            {resultMsg.message}
          </div>
        )}

        {/* Member picker */}
        <div className="mb-3">
          <div className="mb-1 text-[11px] text-text-primary/70">Μέλος</div>
          <input
            className="w-full rounded-md bg-bulk-bg/20 border border-border/15 px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Αναζήτηση μέλους…"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            disabled={running}
          />
          <div className="mt-2 max-h-36 overflow-y-auto rounded-md border border-border/10 bg-bulk-bg/20 p-1">
            {filteredMembers.slice(0, 50).map((m) => {
              const selected = m.id === memberId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMemberId(m.id)}
                  disabled={running}
                  className={`w-full rounded-md px-3 py-2 text-left text-xs ${selected
                    ? 'bg-primary/20 border border-primary/40 text-text-primary'
                    : 'bg-transparent hover:bg-border/5 text-text-primary/90'
                    }`}
                >
                  <div className="font-medium">
                    {m.full_name || m.email || m.id}
                  </div>
                  {m.email && (
                    <div className="text-[11px] text-text-primary/50">{m.email}</div>
                  )}
                </button>
              );
            })}
            {filteredMembers.length === 0 && (
              <div className="px-3 py-2 text-xs text-text-primary/40 italic">
                Δεν βρέθηκαν μέλη.
              </div>
            )}
          </div>

          {selectedMember && (
            <div className="mt-2 text-[11px] text-text-primary/60">
              Επιλεγμένο: <span className="font-semibold text-text-primary">{selectedMember.full_name || selectedMember.email || selectedMember.id}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Class */}
          <div>
            <div className="mb-1 text-[11px] text-text-primary/70">Τμήμα</div>
            <select
              className="w-full rounded-md bg-bulk-bg/20 border border-border/15 px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              disabled={running}
            >
              <option value="">— Επιλογή Τμήματος —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            {selectedClass && (
              <div className="mt-1 text-[11px] text-text-primary/50">
                Drop-in: {selectedClass.drop_in_enabled ? 'Ναι' : 'Όχι'}
              </div>
            )}
          </div>

          {/* Weekday */}
          <div>
            <div className="mb-1 text-[11px] text-text-primary/70">Ημέρα εβδομάδας</div>
            <select
              className="w-full rounded-md bg-bulk-bg/20 border border-border/15 px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
              value={weekdayIdx}
              onChange={(e) => setWeekdayIdx(Number(e.target.value))}
              disabled={running}
            >
              {WEEKDAY_LABELS.map((l, idx) => (
                <option key={l} value={idx}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          {/* Start time */}
          <div>
            <div className="mb-1 text-[11px] text-text-primary/70">Ώρα έναρξης</div>
            <input
              type="time"
              className="w-full rounded-md bg-bulk-bg/20 border border-border/15 px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
              value={normalizeHHMM(startTime)}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={running}
            />
          </div>

          {/* Date range */}
          <div>
            <div className="mb-1 text-[11px] text-text-primary/70">Από</div>
            <input
              type="date"
              className="w-full rounded-md bg-bulk-bg/20 border border-border/15 px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              disabled={running}
            />
          </div>

          <div className="md:col-span-2">
            <div className="mb-1 text-[11px] text-text-primary/70">Έως</div>
            <input
              type="date"
              className="w-full rounded-md bg-bulk-bg/20 border border-border/15 px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              disabled={running}
            />
          </div>
        </div>

        {/* Drop-in fallback */}
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-border/10 bg-bulk-bg/20 px-3 py-2">
          <div>
            <div className="text-[12px] text-text-primary/90 font-semibold">Fallback σε Drop-in</div>
            <div className="text-[11px] text-text-primary/60">
              Αν δεν υπάρχει συνδρομή, κάνε κράτηση ως drop-in (μόνο αν επιτρέπεται).
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-text-primary/80">
            <input
              type="checkbox"
              checked={allowDropInFallback}
              onChange={(e) => setAllowDropInFallback(e.target.checked)}
              disabled={running || !canUseDropInFallback}
            />
            Ενεργό
          </label>
        </div>
        {!canUseDropInFallback && allowDropInFallback && (
          <div className="mt-1 text-[11px] text-accent">
            Το Τμήμα δεν επιτρέπει drop-in — το fallback δεν θα χρησιμοποιηθεί.
          </div>
        )}

        {/* Preview */}
        <div className="mt-3 rounded-md border border-border/10 bg-bulk-bg/20 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-text-primary/70">Προεπισκόπηση</div>
            <button
              type="button"
              onClick={buildPreview}
              disabled={running || loadingPreview}
              className="rounded-md border border-border/20 px-2 py-1 text-[11px] text-text-primary/80 hover:bg-white/10 disabled:opacity-50"
            >
              {loadingPreview ? 'Υπολογισμός…' : 'Υπολογισμός'}
            </button>
          </div>

          {preview && (
            <div className="mt-2 text-[11px] text-text-primary/70 space-y-1">
              <div>
                Sessions που ταιριάζουν: <span className="font-semibold text-text-primary">{preview.matchingCount}</span>
              </div>
              <div>
                Ήδη κλεισμένα: <span className="font-semibold text-text-primary">{preview.alreadyBookedCount}</span>
              </div>
              <div>
                Θα δημιουργηθούν: <span className="font-semibold text-text-primary">{preview.toCreateCount}</span>
              </div>
              {preview.toCreateCount > 0 && (
                <div className="mt-2 text-[11px] text-text-primary/50">
                  Πρώτα 5:{" "}
                  {preview.sessionsToCreate.slice(0, 5).map((s) => isoToLocalHHMM(s.starts_at)).join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Progress */}
        {running && (
          <div className="mt-3 text-[11px] text-text-primary/70">
            Εκτέλεση: <span className="font-semibold text-text-primary">{progress.done}</span> /{' '}
            <span className="font-semibold text-text-primary">{progress.total}</span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="rounded-md border border-border/20 px-3 py-1.5 text-[12px] text-text-primary/80 hover:bg-border/10 disabled:opacity-50"
          >
            Κλείσιμο
          </button>
          <button
            type="button"
            onClick={runBulkCreate}
            disabled={running}
            className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {running ? 'Δημιουργία…' : 'Δημιουργία κρατήσεων'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------ Page ------------ */

export default function AdminBulkBookingsPage() {
  const { profile, subscription } = useAuth();
  const tenantId = profile?.tenant_id ?? null;

  const [showSubModal, setShowSubModal] = useState(false);

  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  const [classes, setClasses] = useState<SessionClassRel[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);

  console.log('classes', classesLoading);

  const [sessions, setSessions] = useState<SessionWithRelations[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeekMonday(new Date()),
  );

  const [creatingBookingForSession, setCreatingBookingForSession] =
    useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [dropInPrompt, setDropInPrompt] = useState<DropInPromptState>(null);
  const [dropInLoading, setDropInLoading] = useState(false);

  // session details modal state
  const [detailsSessionId, setDetailsSessionId] = useState<string | null>(null);

  const [deletingBookingId, setDeletingBookingId] = useState<string | null>(null);

  // bulk modal
  const [bulkModalOpen, setBulkModalOpen] = useState(false);


  const subscriptionInactive = !subscription?.is_active;

  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) {
      setShowSubModal(true);
      return;
    }
    action();
  }


  /* ------------ load members ------------ */

  useEffect(() => {
    if (!tenantId) return;

    const loadMembers = async () => {
      setMembersLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('tenant_id', tenantId)
          .eq('role', 'member')
          .order('full_name', { ascending: true });

        if (error) {
          console.error(error);
          setFeedback({
            type: 'error',
            message: 'Σφάλμα κατά τη φόρτωση μελών.',
          });
        } else {
          setMembers(data ?? []);
        }
      } finally {
        setMembersLoading(false);
      }
    };

    loadMembers();
  }, [tenantId]);

  /* ------------ load classes ------------ */

  useEffect(() => {
    if (!tenantId) return;

    const loadClasses = async () => {
      setClassesLoading(true);
      try {
        const { data, error } = await supabase
          .from('classes')
          .select('id, title, drop_in_enabled, drop_in_price, member_drop_in_price')
          .eq('tenant_id', tenantId)
          .order('title', { ascending: true });

        if (error) {
          console.error(error);
          setFeedback({
            type: 'error',
            message: 'Σφάλμα κατά τη φόρτωση τμημάτων.',
          });
        } else {
          setClasses(((data ?? []) as unknown) as SessionClassRel[]);
        }
      } finally {
        setClassesLoading(false);
      }
    };

    loadClasses();
  }, [tenantId]);

  /* ------------ load sessions for current week ------------ */

  const loadSessions = useCallback(async () => {
    if (!tenantId) return;

    setSessionsLoading(true);
    try {
      const weekEnd = addDaysSimple(weekStart, 7); // [weekStart, weekEnd)

      const { data, error } = await supabase
        .from('class_sessions')
        .select(
          `
          id,
          tenant_id,
          class_id,
          starts_at,
          ends_at,
          classes (
            id,
            title,
            drop_in_enabled,
            drop_in_price,
            member_drop_in_price
          ),
          bookings (
            id,
            user_id,
            status,
            booking_type,
            drop_in_price,
            drop_in_paid,
            profiles (
              id,
              full_name,
              email
            )
          )
        `,
        )
        .eq('tenant_id', tenantId)
        .gte('starts_at', weekStart.toISOString())
        .lt('starts_at', weekEnd.toISOString())
        .order('starts_at', { ascending: true });

      if (error) {
        console.error(error);
        setFeedback({
          type: 'error',
          message: 'Σφάλμα κατά τη φόρτωση μαθημάτων.',
        });
      } else {
        setSessions(((data ?? []) as unknown) as SessionWithRelations[]);
      }
    } finally {
      setSessionsLoading(false);
    }
  }, [tenantId, weekStart]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  /* ------------ computed helpers ------------ */

  const weekLabel = (() => {
    const end = addDaysSimple(weekStart, 6);
    return `${formatDateDMY(weekStart)} – ${formatDateDMY(end)}`;
  })();

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;

    return members.filter((m) => {
      const name = (m.full_name || '').toLowerCase();
      const email = (m.email || '').toLowerCase();
      return (
        name.includes(q) ||
        email.includes(q) ||
        m.id.toLowerCase().includes(q)
      );
    });
  }, [members, memberSearch]);

  // group sessions by weekday (0 = Monday, ..., 6 = Sunday)
  const sessionsByDay: Record<number, SessionWithRelations[]> = useMemo(() => {
    const map: Record<number, SessionWithRelations[]> = {};
    for (const s of sessions) {
      const d = new Date(s.starts_at);
      const dow = d.getDay(); // 0-6, Sunday=0
      const mondayIndex = dow === 0 ? 6 : dow - 1; // 0=Mon,6=Sun
      if (!map[mondayIndex]) map[mondayIndex] = [];
      map[mondayIndex].push(s);
    }
    return map;
  }, [sessions]);

  /* ------------ week navigation ------------ */

  function handleWeekChange(direction: 'prev' | 'next' | 'this') {
    if (direction === 'this') {
      setWeekStart(startOfWeekMonday(new Date()));
    } else {
      setWeekStart((prev) =>
        addDaysSimple(prev, direction === 'next' ? 7 : -7),
      );
    }
  }

  /* ------------ drag & drop handlers ------------ */

  function handleMemberDragStart(
    e: DragEvent<HTMLButtonElement>,
    memberId: string,
  ) {
    e.dataTransfer.setData('text/plain', memberId);
    e.dataTransfer.effectAllowed = 'copyMove';
  }

  async function handleDropOnSession(
    e: DragEvent<HTMLDivElement>,
    sessionId: string,
  ) {
    e.preventDefault();
    e.stopPropagation();

    const memberId = e.dataTransfer.getData('text/plain');
    if (!memberId) return;

    await createBookingForMember(memberId, sessionId);
  }

  /* ------------ booking logic ------------ */

  async function createBookingForMember(memberId: string, sessionId: string) {
    if (!tenantId) return;

    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    // already booked?
    const alreadyBooked =
      session.bookings?.some((b) => b.user_id === memberId && (b.status ?? '') !== 'canceled') ??
      false;
    if (alreadyBooked) {
      setFeedback({
        type: 'error',
        message: 'Το μέλος είναι ήδη κλεισμένο σε αυτό το μάθημα.',
      });
      return;
    }

    setCreatingBookingForSession(sessionId);
    setFeedback(null);

    try {
      // 1️⃣ Try membership booking first
      const { error } = await supabase.rpc('book_session', {
        p_tenant_id: tenantId,
        p_session_id: sessionId,
        p_user_id: memberId,
        p_booking_type: 'membership',
      });

      if (error) {
        const msg = error.message || '';

        // Capacity or other hard errors -> just show them
        if (!isMembershipErrorMessage(msg)) {
          setFeedback({
            type: 'error',
            message: msg || 'Κάτι πήγε στραβά κατά την κράτηση.',
          });
          return;
        }

        // 2️⃣ Membership problem but class may allow drop-in → ask with modal
        const cls = getSessionClass(session);
        const dropInAllowed = Boolean(cls?.drop_in_enabled);

        if (!dropInAllowed) {
          setFeedback({
            type: 'error',
            message:
              'Το μέλος δεν έχει κατάλληλη ενεργή συνδρομή και το μάθημα δεν επιτρέπει drop-in.',
          });
          return;
        }

        // open modal and let the user decide
        setDropInPrompt({ memberId, sessionId });
        return;
      }

      // success as membership
      await loadSessions();
      setFeedback({
        type: 'success',
        message: 'Η κράτηση με συνδρομή δημιουργήθηκε με επιτυχία.',
      });
    } catch (e: any) {
      console.error(e);
      setFeedback({
        type: 'error',
        message: e?.message || 'Κάτι πήγε στραβά κατά την κράτηση.',
      });
    } finally {
      setCreatingBookingForSession(null);
    }
  }

  async function handleDeleteBooking(bookingId: string) {
    if (!tenantId) return;

    if (!window.confirm('Να διαγραφεί οριστικά αυτή η κράτηση;')) return;

    setDeletingBookingId(bookingId);
    setFeedback(null);

    try {
      const res = await supabase.functions.invoke('booking-delete', {
        body: { id: bookingId },
      });

      const errMsg = (res.data as any)?.error ?? res.error?.message ?? '';

      if (res.error || (res.data as any)?.error) {
        console.error(res.error, res.data);
        setFeedback({
          type: 'error',
          message: errMsg || 'Σφάλμα κατά τη διαγραφή της κράτησης.',
        });
        return;
      }

      await loadSessions(); // refresh modal + grid

      setFeedback({
        type: 'success',
        message: 'Η κράτηση διαγράφηκε.',
      });
    } catch (e: any) {
      console.error(e);
      setFeedback({
        type: 'error',
        message: e?.message || 'Κάτι πήγε στραβά κατά τη διαγραφή.',
      });
    } finally {
      setDeletingBookingId(null);
    }
  }

  async function confirmDropIn() {
    if (!tenantId || !dropInPrompt) return;

    const { memberId, sessionId } = dropInPrompt;
    setDropInLoading(true);
    setFeedback(null);

    try {
      const { error } = await supabase.rpc('book_session', {
        p_tenant_id: tenantId,
        p_session_id: sessionId,
        p_user_id: memberId,
        p_booking_type: 'drop_in',
      });

      if (error) {
        const msg = error.message || '';
        setFeedback({
          type: 'error',
          message: msg || 'Κάτι πήγε στραβά κατά την κράτηση drop-in.',
        });
        return;
      }

      await loadSessions();
      setFeedback({
        type: 'success',
        message: 'Η κράτηση ως drop-in δημιουργήθηκε με επιτυχία.',
      });
      setDropInPrompt(null);
    } catch (e: any) {
      console.error(e);
      setFeedback({
        type: 'error',
        message: e?.message || 'Κάτι πήγε στραβά κατά την κράτηση drop-in.',
      });
    } finally {
      setDropInLoading(false);
    }
  }

  /* ------------ render ------------ */

  if (!tenantId) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-sm text-red-300">
          Δεν βρέθηκε tenant_id στο προφίλ διαχειριστή.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* MAIN LAYOUT – responsive */}
      <div className="flex flex-col md:flex-row gap-3 md:gap-4 p-3 md:p-6">
        {/* SIDEBAR: MEMBERS – full width on mobile, fixed width on desktop */}
        <aside className="w-full md:w-70 md:h-[calc(100vh)] order-2 md:order-1 flex flex-col rounded-xl border border-border/10 bg-secondary-background/70 p-4">
          <h2 className="text-sm font-semibold text-text-primary mb-2">Μέλη</h2>
          <p className="text-[11px] text-text-primary/60 mb-3">
            Σύρε ένα μέλος και άφησέ το πάνω σε μάθημα για να δημιουργήσεις κράτηση (κυρίως σε desktop).
          </p>

          <input
            className="w-full rounded-md bg-secondary-background border border-border/15 px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Αναζήτηση μέλους…"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
          />

          <div className="mt-3 flex-1 overflow-y-auto pr-1 space-y-1">
            {membersLoading && (
              <div className="text-xs text-text-primary/60">Φόρτωση μελών…</div>
            )}

            {!membersLoading && filteredMembers.length === 0 && (
              <div className="text-xs text-text-primary/40 italic">
                Δεν βρέθηκαν μέλη.
              </div>
            )}

            {!membersLoading &&
              filteredMembers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  draggable
                  onDragStart={(e) => handleMemberDragStart(e, m.id)}
                  className="w-full rounded-md bg-bulk-bg/20 border border-border/10 px-3 py-2 text-left text-xs text-text-primary hover:bg-white/5 cursor-grab active:cursor-grabbing"
                  title="Σύρε για να κλείσεις θέση (σε desktop)"
                >
                  <div className="font-medium">
                    {m.full_name || m.email || m.id}
                  </div>
                  {m.email && (
                    <div className="text-[11px] text-text-primary/60">{m.email}</div>
                  )}
                </button>
              ))}
          </div>
        </aside>

        {/* MAIN: WEEK CALENDAR – first on mobile */}
        <main className="order-1 md:order-2 flex-1 flex flex-col rounded-xl border border-border/10 bg-secondary-background/70 p-3 md:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
            <div>
              <h1 className="text-sm font-semibold text-text-primary">Πρόγραμμα εβδομάδας</h1>
              <p className="text-[11px] text-text-primary/60">{weekLabel}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleWeekChange('prev')}
                className="rounded-md border border-border/20 px-2 py-1 text-xs text-text-primary/80 hover:bg-border/10"
              >
                ◀ Προηγούμενη
              </button>
              <button
                type="button"
                onClick={() => handleWeekChange('this')}
                className="rounded-md border border-border/20 px-2 py-1 text-xs text-text-primary/80 hover:bg-border/10"
              >
                Σήμερα
              </button>
              <button
                type="button"
                onClick={() => handleWeekChange('next')}
                className="rounded-md border border-border/20 px-2 py-1 text-xs text-text-primary/80 hover:bg-border/10"
              >
                Επόμενη ▶
              </button>

              {/* ✅ NEW: Bulk bookings button */}
              <button
                type="button"
                onClick={() => requireActiveSubscription(() => setBulkModalOpen(true))}
                className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-slate-900 hover:bg-amber-300"
                title="Δημιουργία κρατήσεων για ένα μέλος σε εύρος ημερομηνιών"
              >
                Μαζικές κρατήσεις
              </button>
            </div>
          </div>

          {feedback && (
            <div
              className={`mb-3 flex items-start justify-between rounded-md px-3 py-2 text-[11px] ${feedback.type === 'success'
                ? 'bg-emerald-900/40 text-white border border-emerald-500/40'
                : 'bg-red-900/40 text-red-100 border border-red-500/40'
                }`}
            >
              <span>{feedback.message}</span>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="ml-2 text-xs opacity-70 hover:opacity-100"
              >
                ×
              </button>
            </div>
          )}

          {/* grid: 1 column on mobile, 2 on small tablets, 7 on desktop */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 md:gap-2 md:min-h-120">
            {WEEKDAY_LABELS.map((label, idx) => {
              const dayDate = addDaysSimple(weekStart, idx);
              const daySessions = sessionsByDay[idx] ?? [];

              return (
                <div
                  key={label}
                  className="flex flex-col rounded-lg border border-border/10 bg-secondary-background p-2"
                >
                  <div className="border-b border-border/10 pb-1 mb-1 flex items-baseline justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold text-text-primary/90">
                        {label}
                      </div>
                      <div className="text-[10px] text-text-primary/50">
                        {formatDateDMY(dayDate)}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                    {sessionsLoading && idx === 0 && (
                      <div className="text-[11px] text-text-primary/60">Φόρτωση μαθημάτων…</div>
                    )}

                    {!sessionsLoading && daySessions.length === 0 && (
                      <div className="text-[11px] text-text-primary/30 italic">Χωρίς μαθήματα.</div>
                    )}

                    {daySessions.map((s) => (
                      <div
                        key={s.id}
                        className="rounded-md bg-bulk-bg/20 border border-border/15 p-2 text-[11px] text-text-primary/90 space-y-1"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => requireActiveSubscription(() => handleDropOnSession(e, s.id))}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold truncate">
                            {getSessionClass(s)?.title ?? 'Μάθημα'}
                          </span>
                          <span className="text-[10px] text-text-primary/70 whitespace-nowrap">
                            {formatTimeRange(s.starts_at, s.ends_at)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-1">
                          <div className="text-[10px] text-text-primary/70">
                            Κρατήσεις:{' '}
                            <span className="font-semibold">{s.bookings?.length ?? 0}</span>
                          </div>

                          {/* Button: open details modal */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailsSessionId(s.id);
                            }}
                            className="text-[10px] text-accent hover:accent/80 cursor-pointer"
                          >
                            Προβολή μελών
                          </button>
                        </div>

                        <div className="text-[10px] text-text-primary/40">
                          Ρίξε μέλος εδώ για κράτηση (desktop)
                        </div>

                        {creatingBookingForSession === s.id && (
                          <div className="text-[10px] text-primary mt-1">
                            Δημιουργία κράτησης…
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>

      {/* ✅ NEW: Bulk bookings modal */}
      {tenantId && (
        <BulkBookingsModal
          open={bulkModalOpen}
          tenantId={tenantId}
          members={members}
          classes={classes}
          onClose={() => setBulkModalOpen(false)}
          onDone={loadSessions}
        />
      )}

      {/* MODAL: ask for drop-in fallback */}
      {dropInPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-3">
          <div className="w-full max-w-sm rounded-xl border border-border/15 bg-secondary-background p-4 shadow-xl">
            {(() => {
              const member = members.find((m) => m.id === dropInPrompt.memberId);
              const session = sessions.find((s) => s.id === dropInPrompt.sessionId);
              const cls = session ? getSessionClass(session) : null;
              const when =
                session != null
                  ? `${formatDateDMY(new Date(session.starts_at))} · ${formatTimeRange(
                    session.starts_at,
                    session.ends_at,
                  )}`
                  : '';

              return (
                <>
                  <h3 className="text-sm font-semibold text-text-primary mb-2">
                    Κράτηση ως drop-in;
                  </h3>
                  <p className="text-[12px] text-text-primary/80 mb-2">
                    Το μέλος{' '}
                    <span className="font-semibold">
                      {member?.full_name || member?.email || '—'}
                    </span>{' '}
                    δεν έχει κατάλληλη ενεργή συνδρομή για το μάθημα{' '}
                    <span className="font-semibold">{cls?.title ?? '—'}</span>.
                  </p>
                  <p className="text-[11px] text-text-primary/60 mb-3">
                    {when && <span>{when}</span>}
                    {cls?.drop_in_price != null && (
                      <>
                        <br />
                        Τιμή drop-in: {cls.drop_in_price}€
                      </>
                    )}
                  </p>

                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setDropInPrompt(null)}
                      className="rounded-md border border-border/25 px-3 py-1.5 text-[12px] text-text-primary/80 hover:bg-white/10"
                      disabled={dropInLoading}
                    >
                      Ακύρωση
                    </button>
                    <button
                      type="button"
                      onClick={confirmDropIn}
                      disabled={dropInLoading}
                      className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                    >
                      {dropInLoading ? 'Γίνεται κράτηση…' : 'Ναι, ως drop-in'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL: session details with all booked members */}
      {detailsSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-3">
          <div className="w-full max-w-md rounded-xl border border-border/15 bg-secondary-background p-4 shadow-xl">
            {(() => {
              const session = sessions.find((s) => s.id === detailsSessionId);
              if (!session) {
                return <div className="text-sm text-text-primary">Το μάθημα δεν βρέθηκε.</div>;
              }

              const cls = getSessionClass(session);
              const when = `${formatDateDMY(new Date(session.starts_at))} · ${formatTimeRange(
                session.starts_at,
                session.ends_at,
              )}`;

              const sortedBookings = [...(session.bookings ?? [])].sort((a, b) => {
                const aName =
                  a.profiles?.full_name || a.profiles?.email || a.user_id || '';
                const bName =
                  b.profiles?.full_name || b.profiles?.email || b.user_id || '';
                return aName.localeCompare(bName, 'el');
              });

              return (
                <>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary">
                        {cls?.title ?? 'Μάθημα'}
                      </h3>
                      <p className="text-[11px] text-text-primary/60">{when}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailsSessionId(null)}
                      className="text-xs text-text-primary/60 hover:text-text-primary"
                    >
                      ✕
                    </button>
                  </div>

                  <p className="text-[11px] text-text-primary/60 mb-2">
                    Σύνολο κρατήσεων:{' '}
                    <span className="font-semibold text-text-primary">{sortedBookings.length}</span>
                  </p>

                  <div className="max-h-72 overflow-y-auto space-y-1 mt-1">
                    {sortedBookings.length === 0 && (
                      <div className="text-[12px] text-text-primary/50 italic">
                        Δεν υπάρχουν κρατήσεις για αυτό το μάθημα.
                      </div>
                    )}

                    {sortedBookings.map((b) => {
                      const memberName =
                        b.profiles?.full_name || b.profiles?.email || b.user_id;
                      const isDropIn = b.booking_type === 'drop_in';

                      return (
                        <div
                          key={b.id}
                          className="rounded-md border border-border/15 bg-bulk-bg/20 px-3 py-2 text-[11px] text-text-primary/90"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="font-semibold truncate">{memberName}</span>
                            </div>

                            <div className="flex items-center gap-1">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] ${isDropIn
                                  ? 'bg-amber-500/20 text-warning border border-amber-500/40'
                                  : 'bg-emerald-500/20 text-success border border-emerald-500/40'
                                  }`}
                              >
                                {isDropIn ? 'Drop-in' : 'Συνδρομή'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteBooking(b.id)}
                                disabled={deletingBookingId === b.id}
                                className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-400/70 text-red-300 hover:bg-red-500/15 disabled:opacity-50"
                                title="Διαγραφή κράτησης"
                              >
                                {deletingBookingId === b.id ? (
                                  <span className="text-[9px]">…</span>
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </div>
                          {b.profiles?.email && (
                            <div className="text-[10px] text-text-primary/60">{b.profiles.email}</div>
                          )}

                          {isDropIn && (
                            <div className="mt-1 text-[10px] text-text-primary/70">
                              Τιμή: {b.drop_in_price ?? 0}€ ·{' '}
                              {b.drop_in_paid ? 'Πληρωμένο' : 'Οφειλή'}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}


      <SubscriptionRequiredModal
        open={showSubModal}
        onClose={() => setShowSubModal(false)}
      />
    </>
  );
}
