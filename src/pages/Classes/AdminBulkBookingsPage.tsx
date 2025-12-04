import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import { Trash2 } from 'lucide-react';


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

type Feedback = {
    type: 'success' | 'error';
    message: string;
} | null;

type DropInPromptState = {
    memberId: string;
    sessionId: string;
} | null;

/* ------------ small helpers ------------ */

function getSessionClass(s: SessionWithRelations): SessionClassRel | null {
    if (!s.classes) return null;
    return Array.isArray(s.classes) ? s.classes[0] ?? null : s.classes;
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

export default function AdminBulkBookingsPage() {
    const { profile } = useAuth();
    const tenantId = profile?.tenant_id ?? null;

    const [members, setMembers] = useState<Member[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [memberSearch, setMemberSearch] = useState('');

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

    function isMembershipErrorMessage(msg: string): boolean {
        return MEMBERSHIP_ERROR_CODES.some((code) => msg.includes(code));
    }

    async function createBookingForMember(memberId: string, sessionId: string) {
        if (!tenantId) return;

        const session = sessions.find((s) => s.id === sessionId);
        if (!session) return;

        // already booked?
        const alreadyBooked =
            session.bookings?.some((b) => b.user_id === memberId) ?? false;
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
            const { error } = await supabase
                .from('bookings')
                .delete()
                .eq('id', bookingId)
                .eq('tenant_id', tenantId);

            if (error) {
                console.error(error);
                setFeedback({
                    type: 'error',
                    message: 'Σφάλμα κατά τη διαγραφή της κράτησης.',
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
            <div className="flex flex-col md:flex-row h-auto md:h-[calc(100vh-80px)] gap-3 md:gap-4 p-3 md:p-6">
                {/* SIDEBAR: MEMBERS – full width on mobile, fixed width on desktop */}
                <aside className="w-full md:w-50 order-2 md:order-1 flex flex-col rounded-xl border border-white/10 bg-secondary-background/70 p-4">
                    <h2 className="text-sm font-semibold text-white mb-2">Μέλη</h2>
                    <p className="text-[11px] text-white/60 mb-3">
                        Σύρε ένα μέλος και άφησέ το πάνω σε μάθημα για να δημιουργήσεις
                        κράτηση (κυρίως σε desktop).
                    </p>

                    <input
                        className="w-full rounded-md bg-slate-900/80 border border-white/15 px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Αναζήτηση μέλους…"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                    />

                    <div className="mt-3 flex-1 overflow-y-auto pr-1 space-y-1">
                        {membersLoading && (
                            <div className="text-xs text-white/60">Φόρτωση μελών…</div>
                        )}

                        {!membersLoading && filteredMembers.length === 0 && (
                            <div className="text-xs text-white/40 italic">
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
                                    className="w-full rounded-md bg-slate-900/80 border border-white/10 px-3 py-2 text-left text-xs text-white hover:bg-white/5 cursor-grab active:cursor-grabbing"
                                    title="Σύρε για να κλείσεις θέση (σε desktop)"
                                >
                                    <div className="font-medium">
                                        {m.full_name || m.email || m.id}
                                    </div>
                                    {m.email && (
                                        <div className="text-[11px] text-white/60">{m.email}</div>
                                    )}
                                </button>
                            ))}
                    </div>
                </aside>

                {/* MAIN: WEEK CALENDAR – first on mobile */}
                <main className="order-1 md:order-2 flex-1 flex flex-col rounded-xl border border-white/10 bg-secondary-background/70 p-3 md:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
                        <div>
                            <h1 className="text-sm font-semibold text-white">
                                Πρόγραμμα εβδομάδας
                            </h1>
                            <p className="text-[11px] text-white/60">{weekLabel}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => handleWeekChange('prev')}
                                className="rounded-md border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                            >
                                ◀ Προηγούμενη
                            </button>
                            <button
                                type="button"
                                onClick={() => handleWeekChange('this')}
                                className="rounded-md border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                            >
                                Σήμερα
                            </button>
                            <button
                                type="button"
                                onClick={() => handleWeekChange('next')}
                                className="rounded-md border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                            >
                                Επόμενη ▶
                            </button>
                        </div>
                    </div>

                    {feedback && (
                        <div
                            className={`mb-3 flex items-start justify-between rounded-md px-3 py-2 text-[11px] ${feedback.type === 'success'
                                ? 'bg-emerald-900/40 text-emerald-100 border border-emerald-500/40'
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
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 md:gap-2 md:min-h-[480px]">
                        {WEEKDAY_LABELS.map((label, idx) => {
                            const dayDate = addDaysSimple(weekStart, idx);
                            const daySessions = sessionsByDay[idx] ?? [];

                            return (
                                <div
                                    key={label}
                                    className="flex flex-col rounded-lg border border-white/10 bg-slate-950/60 p-2"
                                >
                                    <div className="border-b border-white/10 pb-1 mb-1 flex items-baseline justify-between gap-2">
                                        <div>
                                            <div className="text-[11px] font-semibold text-white/90">
                                                {label}
                                            </div>
                                            <div className="text-[10px] text-white/50">
                                                {formatDateDMY(dayDate)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                                        {sessionsLoading && idx === 0 && (
                                            <div className="text-[11px] text-white/60">
                                                Φόρτωση μαθημάτων…
                                            </div>
                                        )}

                                        {!sessionsLoading && daySessions.length === 0 && (
                                            <div className="text-[11px] text-white/30 italic">
                                                Χωρίς μαθήματα.
                                            </div>
                                        )}

                                        {daySessions.map((s) => (
                                            <div
                                                key={s.id}
                                                className="rounded-md bg-slate-900/80 border border-white/15 p-2 text-[11px] text-white/90 space-y-1"
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => handleDropOnSession(e, s.id)}
                                            >
                                                <div className="flex items-center justify-between gap-1">
                                                    <span className="font-semibold truncate">
                                                        {getSessionClass(s)?.title ?? 'Μάθημα'}
                                                    </span>
                                                    <span className="text-[10px] text-white/70 whitespace-nowrap">
                                                        {formatTimeRange(s.starts_at, s.ends_at)}
                                                    </span>
                                                </div>

                                                <div className="flex items-center justify-between gap-1">
                                                    <div className="text-[10px] text-white/70">
                                                        Κρατήσεις:{' '}
                                                        <span className="font-semibold">
                                                            {s.bookings?.length ?? 0}
                                                        </span>
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

                                                <div className="text-[10px] text-white/40">
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

            {/* MODAL: ask for drop-in fallback */}
            {dropInPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-3">
                    <div className="w-full max-w-sm rounded-xl border border-white/15 bg-secondary-background p-4 shadow-xl">
                        {(() => {
                            const member = members.find((m) => m.id === dropInPrompt.memberId);
                            const session = sessions.find(
                                (s) => s.id === dropInPrompt.sessionId,
                            );
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
                                    <h3 className="text-sm font-semibold text-white mb-2">
                                        Κράτηση ως drop-in;
                                    </h3>
                                    <p className="text-[12px] text-white/80 mb-2">
                                        Το μέλος{' '}
                                        <span className="font-semibold">
                                            {member?.full_name || member?.email || '—'}
                                        </span>{' '}
                                        δεν έχει κατάλληλη ενεργή συνδρομή για το μάθημα{' '}
                                        <span className="font-semibold">
                                            {cls?.title ?? '—'}
                                        </span>
                                        .
                                    </p>
                                    <p className="text-[11px] text-white/60 mb-3">
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
                                            className="rounded-md border border-white/25 px-3 py-1.5 text-[12px] text-white/80 hover:bg-white/10"
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
                    <div className="w-full max-w-md rounded-xl border border-white/15 bg-secondary-background p-4 shadow-xl">
                        {(() => {
                            const session = sessions.find((s) => s.id === detailsSessionId);
                            if (!session) {
                                return (
                                    <div className="text-sm text-white">
                                        Το μάθημα δεν βρέθηκε.
                                    </div>
                                );
                            }

                            const cls = getSessionClass(session);
                            const when = `${formatDateDMY(
                                new Date(session.starts_at),
                            )} · ${formatTimeRange(session.starts_at, session.ends_at)}`;

                            const sortedBookings = [...(session.bookings ?? [])].sort((a, b) => {
                                const aName =
                                    a.profiles?.full_name ||
                                    a.profiles?.email ||
                                    a.user_id ||
                                    '';
                                const bName =
                                    b.profiles?.full_name ||
                                    b.profiles?.email ||
                                    b.user_id ||
                                    '';
                                return aName.localeCompare(bName, 'el');
                            });

                            return (
                                <>
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <h3 className="text-sm font-semibold text-white">
                                                {cls?.title ?? 'Μάθημα'}
                                            </h3>
                                            <p className="text-[11px] text-white/60">{when}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setDetailsSessionId(null)}
                                            className="text-xs text-white/60 hover:text-white"
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    <p className="text-[11px] text-white/60 mb-2">
                                        Σύνολο κρατήσεων:{' '}
                                        <span className="font-semibold text-white">
                                            {sortedBookings.length}
                                        </span>
                                    </p>

                                    <div className="max-h-72 overflow-y-auto space-y-1 mt-1">
                                        {sortedBookings.length === 0 && (
                                            <div className="text-[12px] text-white/50 italic">
                                                Δεν υπάρχουν κρατήσεις για αυτό το μάθημα.
                                            </div>
                                        )}

                                        {sortedBookings.map((b) => {
                                            const memberName =
                                                b.profiles?.full_name ||
                                                b.profiles?.email ||
                                                b.user_id;
                                            const isDropIn = b.booking_type === 'drop_in';

                                            return (
                                                <div
                                                    key={b.id}
                                                    className="rounded-md border border-white/15 bg-slate-900/70 px-3 py-2 text-[11px] text-white/90"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <span className="font-semibold truncate">
                                                                {memberName}
                                                            </span>
                                                        </div>

                                                        <div className="flex items-center gap-1">
                                                            <span
                                                                className={`px-2 py-0.5 rounded-full text-[10px] ${isDropIn
                                                                    ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                                                                    : 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
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
                                                        <div className="text-[10px] text-white/60">
                                                            {b.profiles.email}
                                                        </div>
                                                    )}

                                                    {isDropIn && (
                                                        <div className="mt-1 text-[10px] text-white/70">
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
        </>
    );
}
