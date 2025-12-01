import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';

type Member = { id: string; full_name: string | null; email: string | null };
type ClassRow = { id: string; title: string };

type BulkResult = {
    sessions_found: number;
    booked: number;
    skipped_existing: number;
    failed: number;
    errors: string[];
};

type CreatedSessionRow = {
    booking_id: string;
    session_id: string;
    starts_at: string;
    class_title: string;
};


function formatDateDMY(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function formatDateTimeDMY(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    // 24h format
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}



/* ---- small date helpers (no date-fns) ---- */
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

/** convert local HH:MM (admin time) -> UTC "HH:MM:SS" for Postgres time */
function localTimeToUtcTimeString(baseDate: Date, timeHHMM: string): string {
    const [hStr, mStr] = timeHHMM.split(':');
    const d = new Date(baseDate);
    d.setHours(Number(hStr), Number(mStr), 0, 0); // interpret as local
    const utcH = d.getUTCHours().toString().padStart(2, '0');
    const utcM = d.getUTCMinutes().toString().padStart(2, '0');
    return `${utcH}:${utcM}:00`;
}


const TIME_SLOTS_15M: string[] = (() => {
    const slots: string[] = [];
    for (let h = 0; h < 24; h++) {
        for (const m of [0, 15, 30, 45]) {
            const hh = h.toString().padStart(2, '0');
            const mm = m.toString().padStart(2, '0');
            slots.push(`${hh}:${mm}`); // e.g. "18:15"
        }
    }
    return slots;
})();

// Postgres EXTRACT(DOW) => 0 = Κυριακή, 1 = Δευτέρα, ... 6 = Σάββατο
const WEEKDAY_OPTIONS = [
    { value: 1, label: 'Δε' }, // Monday
    { value: 2, label: 'Τρ' },
    { value: 3, label: 'Τε' },
    { value: 4, label: 'Πε' },
    { value: 5, label: 'Πα' },
    { value: 6, label: 'Σα' },
    { value: 0, label: 'Κυ' }, // Sunday
];



export default function AdminBulkBookingsPage() {
    const { profile } = useAuth();
    const tenantId = profile?.tenant_id!;
    const [members, setMembers] = useState<Member[]>([]);
    const [classes, setClasses] = useState<ClassRow[]>([]);

    const [selectedMember, setSelectedMember] = useState<string>('');
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [timeOfDay, setTimeOfDay] = useState<string>(''); // "HH:MM"

    const [weekStart, setWeekStart] = useState<Date>(() =>
        startOfWeekMonday(new Date())
    );

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<BulkResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    // --- dropdown state for member ---
    const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
    const [memberSearch, setMemberSearch] = useState('');
    const memberDropdownRef = useRef<HTMLDivElement | null>(null);

    // --- dropdown state for class ---
    const [classDropdownOpen, setClassDropdownOpen] = useState(false);
    const [classSearch, setClassSearch] = useState('');
    const classDropdownRef = useRef<HTMLDivElement | null>(null);

    const [createdSessions, setCreatedSessions] = useState<CreatedSessionRow[]>([]);


    const [selectedDays, setSelectedDays] = useState<number[]>(
        WEEKDAY_OPTIONS.map(o => o.value)
    );


    const toggleDay = (val: number) => {
        setSelectedDays(prev => {
            if (prev.includes(val)) {
                return prev.filter(v => v !== val);
            }
            // keep stable order
            const all = [...prev, val];
            return WEEKDAY_OPTIONS
                .map(o => o.value)
                .filter(v => all.includes(v));
        });
    };


    const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);
    const timeDropdownRef = useRef<HTMLDivElement | null>(null);


    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;

            if (
                memberDropdownRef.current &&
                !memberDropdownRef.current.contains(target)
            ) {
                setMemberDropdownOpen(false);
            }
            if (
                classDropdownRef.current &&
                !classDropdownRef.current.contains(target)
            ) {
                setClassDropdownOpen(false);
            }
            if (
                timeDropdownRef.current &&
                !timeDropdownRef.current.contains(target)
            ) {
                setTimeDropdownOpen(false);
            }
        };

        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, []);



    // close dropdowns on outside click (like SessionModal)
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                memberDropdownRef.current &&
                !memberDropdownRef.current.contains(target)
            ) {
                setMemberDropdownOpen(false);
            }
            if (
                classDropdownRef.current &&
                !classDropdownRef.current.contains(target)
            ) {
                setClassDropdownOpen(false);
            }
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, []);

    // load members & classes
    useEffect(() => {
        if (!tenantId) return;

        const load = async () => {
            const [mRes, cRes] = await Promise.all([
                supabase
                    .from('profiles')
                    .select('id, full_name, email')
                    .eq('tenant_id', tenantId)
                    .order('full_name', { ascending: true }),
                supabase
                    .from('classes')
                    .select('id, title')
                    .eq('tenant_id', tenantId)
                    .order('title', { ascending: true }),
            ]);

            if (mRes.error) console.error(mRes.error);
            if (cRes.error) console.error(cRes.error);

            setMembers(mRes.data ?? []);
            setClasses(cRes.data ?? []);
        };

        load();
    }, [tenantId]);

    function handleWeekChange(direction: 'prev' | 'next' | 'this') {
        if (direction === 'this') {
            setWeekStart(startOfWeekMonday(new Date()));
        } else {
            setWeekStart(prev =>
                addDaysSimple(prev, direction === 'next' ? 7 : -7)
            );
        }
    }

    async function handleSchedule() {
        setError(null);
        setResult(null);

        if (!tenantId || !selectedMember) {
            setError('Επέλεξε μέλος πρώτα.');
            return;
        }
        if (!selectedClass) {
            setError('Επέλεξε μάθημα (π.χ. Functional).');
            return;
        }
        if (selectedDays.length === 0) {
            setError('Επέλεξε τουλάχιστον μία ημέρα της εβδομάδας.');
            return;
        }

        const start = weekStart;
        const end = addDaysSimple(weekStart, 7);

        const utcTimeForDb = timeOfDay
            ? localTimeToUtcTimeString(weekStart, timeOfDay)
            : null;

        setLoading(true);
        try {
            const { data, error } = await supabase.rpc(
                'admin_bulk_book_member_for_sessions',
                {
                    p_tenant_id: tenantId,
                    p_user_id: selectedMember,
                    p_start_at: start.toISOString(),
                    p_end_at: end.toISOString(),
                    p_class_id: selectedClass,
                    p_exact_time: utcTimeForDb,
                    p_days_of_week: selectedDays,
                }
            );

            console.log('bulk RPC result', data, error);
            if (error) throw error;
            setResult(data as BulkResult);


            // Φέρε όλες τις κρατήσεις του μέλους για αυτή την εβδομάδα & μάθημα
            const { data: bookingRows, error: bookingsError } = await supabase
                .from('bookings')
                .select(`
    id,
    class_sessions!inner (
      id,
      starts_at,
      classes!inner (
        title
      )
    )
  `)
                .eq('tenant_id', tenantId)
                .eq('user_id', selectedMember)
                .eq('status', 'booked')
                .gte('class_sessions.starts_at', start.toISOString())
                .lt('class_sessions.starts_at', end.toISOString())
                .eq('class_sessions.class_id', selectedClass)
                .order('starts_at', {
                    foreignTable: 'class_sessions',  // 👈 tell Supabase which table
                    ascending: true,
                });


            if (bookingsError) throw bookingsError;

            const mapped: CreatedSessionRow[] =
                (bookingRows ?? []).map((row: any) => ({
                    booking_id: row.id,
                    session_id: row.class_sessions.id,
                    starts_at: row.class_sessions.starts_at,
                    class_title: row.class_sessions.classes?.title ?? 'Μάθημα',
                }));

            setCreatedSessions(mapped);

        } catch (e: any) {
            console.error(e);
            setError(e?.message || 'Κάτι πήγε στραβά.');
        } finally {
            setLoading(false);
        }
    }

    const weekEnd = addDaysSimple(weekStart, 6);
    const weekLabel = `${formatDateDMY(weekStart)} – ${formatDateDMY(weekEnd)}`;


    const filteredMembers = members.filter(m => {
        const q = memberSearch.toLowerCase();
        const name = (m.full_name || '').toLowerCase();
        const email = (m.email || '').toLowerCase();
        return name.includes(q) || email.includes(q) || m.id.includes(q);
    });

    const filteredClasses = classes.filter(c =>
        c.title.toLowerCase().includes(classSearch.toLowerCase())
    );

    const selectedMemberObj = members.find(m => m.id === selectedMember);
    const selectedClassObj = classes.find(c => c.id === selectedClass);

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-lg font-semibold text-white">
                    Μαζικός Προγραμματισμός Κρατήσεων
                </h1>
                <span className="text-xs text-white/50">
                    Π.χ. «βάλε τον Γιάννη σε όλα τα Functional αυτής της εβδομάδας στις 18:00»
                </span>
            </div>

            <div className="rounded-xl border border-white/10 bg-secondary-background/60 p-5 space-y-5">
                {/* Row 1: Member + Week */}
                <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                    {/* Searchable member dropdown */}
                    <div ref={memberDropdownRef} className="relative">
                        <label className="block text-xs font-semibold text-white/70 mb-1">
                            Μέλος
                        </label>
                        <button
                            type="button"
                            onClick={() => setMemberDropdownOpen(v => !v)}
                            className="w-full rounded-md bg-slate-900/80 border border-white/15 px-3 py-2 text-sm text-left text-white flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            <span>
                                {selectedMemberObj
                                    ? selectedMemberObj.full_name ||
                                    selectedMemberObj.email ||
                                    selectedMemberObj.id
                                    : 'Επιλέξτε μέλος…'}
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
                                        className="w-full rounded-md bg-slate-900/80 border border-white/20 px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary"
                                        placeholder="Αναζήτηση μέλους…"
                                        value={memberSearch}
                                        onChange={e => setMemberSearch(e.target.value)}
                                    />
                                </div>
                                <div className="max-h-60 overflow-y-auto">
                                    {filteredMembers.length === 0 && (
                                        <div className="px-3 py-2 text-xs text-white/50">
                                            Δεν βρέθηκαν μέλη
                                        </div>
                                    )}
                                    {filteredMembers.map(m => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            className={`w-full px-3 py-2 text-left text-xs hover:bg-white/5 ${m.id === selectedMember ? 'bg-white/10' : ''
                                                }`}
                                            onClick={() => {
                                                setSelectedMember(m.id);
                                                setMemberDropdownOpen(false);
                                            }}
                                        >
                                            <div className="font-medium">
                                                {m.full_name || m.email || m.id}
                                            </div>
                                            {m.email && (
                                                <div className="text-[11px] text-white/50">
                                                    {m.email}
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Row 2: Class + Time */}
                <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                    {/* Searchable class dropdown */}
                    <div ref={classDropdownRef} className="relative">
                        <label className="block text-xs font-semibold text-white/70 mb-1">
                            Μάθημα
                        </label>
                        <button
                            type="button"
                            onClick={() => setClassDropdownOpen(v => !v)}
                            className="w-full rounded-md bg-slate-900/80 border border-white/15 px-3 py-2 text-sm text-left text-white flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            <span>
                                {selectedClassObj
                                    ? selectedClassObj.title
                                    : 'Επιλέξτε μάθημα…'}
                            </span>
                            <span className="ml-2 text-xs opacity-70">
                                {classDropdownOpen ? '▲' : '▼'}
                            </span>
                        </button>

                        {classDropdownOpen && (
                            <div className="absolute z-50 mt-1 w-full rounded-md border border-white/15 bg-secondary-background shadow-lg">
                                <div className="p-2 border-b border-white/10">
                                    <input
                                        autoFocus
                                        className="w-full rounded-md bg-slate-900/80 border border-white/20 px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary"
                                        placeholder="Αναζήτηση μαθήματος…"
                                        value={classSearch}
                                        onChange={e => setClassSearch(e.target.value)}
                                    />
                                </div>
                                <div className="max-h-60 overflow-y-auto">
                                    {filteredClasses.length === 0 && (
                                        <div className="px-3 py-2 text-xs text-white/50">
                                            Δεν βρέθηκαν μαθήματα
                                        </div>
                                    )}
                                    {filteredClasses.map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            className={`w-full px-3 py-2 text-left text-xs hover:bg.white/5 hover:bg-white/5 ${c.id === selectedClass ? 'bg-white/10' : ''
                                                }`}
                                            onClick={() => {
                                                setSelectedClass(c.id);
                                                setClassDropdownOpen(false);
                                            }}
                                        >
                                            {c.title}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <p className="mt-1 text-[11px] text-white/50">
                            Π.χ. Functional, Yoga, Cross Training κλπ.
                        </p>
                    </div>

                    {/* Time filter */}
                    <div ref={timeDropdownRef} className="relative">
                        <label className="block text-xs font-semibold text-white/70 mb-1">
                            Ώρα μαθήματος (προαιρετικό)
                        </label>

                        <button
                            type="button"
                            onClick={() => setTimeDropdownOpen(v => !v)}
                            className="w-48 rounded-md bg-slate-900/80 border border-white/15 px-3 py-2 text-sm text-white flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            <span>
                                {timeOfDay ? `${timeOfDay}` : 'Όλες οι ώρες…'}
                            </span>
                            <span className="ml-2 text-[10px] opacity-70">
                                {timeDropdownOpen ? '▲' : '▼'}
                            </span>
                        </button>

                        {timeDropdownOpen && (
                            <div className="absolute z-50 mt-1 w-56 rounded-lg border border-white/15 bg-secondary-background shadow-lg">
                                <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                                    <span className="text-[11px] text-white/60">
                                        Επιλογή ώρας ανά 15'
                                    </span>
                                    {timeOfDay && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTimeOfDay('');
                                                setTimeDropdownOpen(false);
                                            }}
                                            className="text-[11px] text-white/60 hover:text-white"
                                        >
                                            Καθαρισμός
                                        </button>
                                    )}
                                </div>
                                <div className="max-h-60 overflow-y-auto grid grid-cols-2 gap-1 p-1">
                                    {TIME_SLOTS_15M.map(t => (
                                        <button
                                            key={t}
                                            type="button"
                                            className={`w-full px-2 py-1.5 text-xs rounded-md text-left
                                                ${t === timeOfDay
                                                    ? 'bg-white/15 text-white'
                                                    : 'text-white/80 hover:bg-white/5'
                                                }`}
                                            onClick={() => {
                                                setTimeOfDay(t);
                                                setTimeDropdownOpen(false);
                                            }}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Week controls */}
                    <div>
                        <label className="block text-xs font-semibold text-white/70 mb-1">
                            Εβδομάδα
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => handleWeekChange('prev')}
                                className="rounded-md border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                            >
                                Προηγούμενη
                            </button>
                            <button
                                type="button"
                                onClick={() => handleWeekChange('this')}
                                className="rounded-md border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg.white/10 hover:bg-white/10"
                            >
                                Τρέχουσα
                            </button>
                            <button
                                type="button"
                                onClick={() => handleWeekChange('next')}
                                className="rounded-md border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                            >
                                Επόμενη
                            </button>
                            <span className="ml-2 text-xs text.white/60 text-white/60">
                                {weekLabel}
                            </span>
                        </div>

                        {/* NEW: Days of week selector */}
                        <div className="mt-3">
                            <div className="mb-1 text-[11px] text-white/60">
                                Ημέρες εβδομάδας
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {WEEKDAY_OPTIONS.map(d => (
                                    <button
                                        key={d.value}
                                        type="button"
                                        onClick={() => toggleDay(d.value)}
                                        className={
                                            'px-2 py-1 rounded-md text-[11px] border ' +
                                            (selectedDays.includes(d.value)
                                                ? 'bg-primary/80 border-primary text-white'
                                                : 'bg-slate-900/80 border-white/20 text-white/70 hover:bg-white/5')
                                        }
                                    >
                                        {d.label}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-1 text-[11px] text-white/50">
                                Αν όλα είναι επιλεγμένα, ο προγραμματισμός θα γίνει για κάθε ημέρα της εβδομάδας.
                            </p>
                        </div>
                    </div>


                </div>

                {/* Errors / result */}
                {error && (
                    <p className="text-xs text-red-400">{error}</p>
                )}

                {result && (
                    <div className="text-xs text-white/70 space-y-1 border-t border-white/10 pt-3">
                        <p>
                            🔎 Συνεδρίες που βρέθηκαν:{' '}
                            <span className="font-semibold text-white">
                                {result.sessions_found}
                            </span>
                        </p>
                        <p>
                            ✅ Νέες κρατήσεις:{' '}
                            <span className="font-semibold text-emerald-400">
                                {result.booked}
                            </span>
                        </p>
                        <p>
                            ⏭ Ήδη υπήρχαν:{' '}
                            <span className="font-semibold text-blue-300">
                                {result.skipped_existing}
                            </span>
                        </p>
                        <p>
                            ⚠️ Απέτυχαν:{' '}
                            <span className="font-semibold text-red-400">
                                {result.failed}
                            </span>
                        </p>
                        {result.errors && result.errors.length > 0 && (
                            <details className="mt-1">
                                <summary className="cursor-pointer text-white/50">
                                    Προβολή λαθών
                                </summary>
                                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                                    {result.errors.map((e, idx) => (
                                        <li key={idx}>{e}</li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </div>
                )}

                {/* Action */}
                <div className="pt-2">
                    <button
                        type="button"
                        disabled={loading}
                        onClick={handleSchedule}
                        className="inline-flex items-center rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-primary/90 disabled:opacity-50"
                    >
                        {loading ? 'Προγραμματισμός…' : 'Προγραμματισμός κρατήσεων'}
                    </button>
                </div>
            </div>

            {createdSessions.length > 0 && (
                <div className="mt-4 rounded-xl border border-white/10 bg-secondary-background/60 p-4 space-y-2">
                    <h2 className="text-sm font-semibold text-white/80 mb-2">
                        Κρατήσεις για αυτή την εβδομάδα
                    </h2>
                    <p className="text-[11px] text-white/50 mb-1">
                        Για το επιλεγμένο μέλος και το συγκεκριμένο μάθημα.
                    </p>

                    <ul className="divide-y divide-white/10 text-xs text-white/80">
                        {createdSessions.map(cs => (
                            <li key={cs.booking_id} className="flex items-center justify-between py-1.5">
                                <div className="flex flex-col">
                                    <span className="font-medium">{cs.class_title}</span>
                                    <span className="text-[11px] text-white/60">
                                        {formatDateTimeDMY(cs.starts_at)}
                                    </span>

                                </div>
                                {/* αν θες στο μέλλον μπορούμε να βάλουμε και κουμπί ακύρωσης εδώ */}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

        </div>
    );
}
