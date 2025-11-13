import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Session = {
    id: string;
    tenant_id: string;
    class_id: string;
    starts_at: string; // ISO
    ends_at: string | null;
    capacity: number | null;
    classes?: { title: string }[] | { title: string } | null;
};
type ViewMode = 'month' | 'day';
type GymClass = { id: string; title: string };

function startOfMonth(d: Date) { const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x; }
function endOfMonth(d: Date) { const x = new Date(d); x.setMonth(x.getMonth() + 1, 0); x.setHours(23, 59, 59, 999); return x; }
function startOfWeek(d: Date) { const x = new Date(d); const dow = x.getDay(); x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function fmtHM(iso?: string | null) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

export function CalendarMonth({
    tenantId,
    initialDate,
    classId,
    onSessionClick,
    header = true,
    height,
}: {
    tenantId: string;
    initialDate?: Date;
    classId?: string;   // optional filter
    onSessionClick?: (s: Session) => void;
    header?: boolean;
    height?: number | string;
}) {
    const [cursor, setCursor] = useState<Date>(() => {
        const d = initialDate ? new Date(initialDate) : new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    });

    const [viewMode, setViewMode] = useState<ViewMode>('month');
    const [rows, setRows] = useState<Session[]>([]);
    const [classes, setClasses] = useState<GymClass[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const monthStart = useMemo(() => startOfMonth(cursor), [cursor]);
    const monthEnd = useMemo(() => endOfMonth(cursor), [cursor]);
    const gridStart = useMemo(() => startOfWeek(monthStart), [monthStart]);
    const gridDays = 42; // 6 weeks

    function sessionTitle(s: Session) {
        const c = s.classes;
        if (!c) return 'Class';
        return Array.isArray(c) ? (c[0]?.title ?? 'Class') : (c.title ?? 'Class');
    }

    function ymdLocal(d: Date) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`; // local YYYY-MM-DD
    }

    function utcMidnightISO(d: Date) {
        // UTC midnight for the same local calendar day
        return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)).toISOString();
    }



    async function load() {
        if (!tenantId) return;
        setLoading(true);
        setError(null);

        let fromISO: string, toISO: string;
        if (viewMode === 'day') {
            const d = new Date(cursor);
            d.setHours(0, 0, 0, 0);
            fromISO = utcMidnightISO(d);
            toISO = utcMidnightISO(addDays(d, 1));
        } else {
            const gridStart = startOfWeek(monthStart);
            const gridDays = 42;
            fromISO = utcMidnightISO(gridStart);
            toISO = utcMidnightISO(addDays(gridStart, gridDays));
        }
        const [sess, cls] = await Promise.all([
            supabase
                .from('class_sessions')
                .select('id, tenant_id, class_id, starts_at, ends_at, capacity, classes(title)')
                .eq('tenant_id', tenantId)
                .gte('starts_at', fromISO)
                .lt('starts_at', toISO)
                .order('starts_at', { ascending: true }),
            supabase
                .from('classes').select('id, title')
                .eq('tenant_id', tenantId).order('title'),
        ]);

        if (sess.error || cls.error) {
            setError(sess.error?.message ?? cls.error?.message ?? 'Failed to load');
        } else {
            setRows((sess.data as Session[]) ?? []);
            setClasses((cls.data as GymClass[]) ?? []);
        }
        setLoading(false);
    }

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [tenantId, cursor, classId, viewMode]);

    const filtered = useMemo(
        () => (classId ? rows.filter(r => r.class_id === classId) : rows),
        [rows, classId]
    );

    const sessionsByDay = useMemo(() => {
        const map: Record<string, Session[]> = {};
        const list = classId ? rows.filter(r => r.class_id === classId) : rows;
        for (const s of list) {
            const key = ymdLocal(new Date(s.starts_at)); // <- was toISOString().slice(0,10)
            (map[key] ||= []).push(s);
        }
        return map;
    }, [rows, classId]);


    const days = useMemo(() => Array.from({ length: gridDays }, (_, i) => addDays(gridStart, i)), [gridStart]);

    const goPrev = () => {
        if (viewMode === 'day') {
            setCursor(addDays(cursor, -1));
        } else {
            setCursor(addDays(startOfMonth(cursor), -1)); // previous month
        }
    };

    const goNext = () => {
        if (viewMode === 'day') {
            setCursor(addDays(cursor, +1));
        } else {
            setCursor(addDays(endOfMonth(cursor), +1)); // next month
        }
    };

    const goToday = () => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        setCursor(d);
    };


    return (
        <div className="rounded-md border border-white/10 bg-secondary-background/60">
            {header && (
                <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2">
                    <button className="h-8 w-8 rounded-md border border-white/10 hover:bg-white/5"
                        onClick={goPrev} aria-label="Prev">‹</button>

                    <button className="h-8 rounded-md border border-white/10 px-2 hover:bg-white/5"
                        onClick={goToday}>Σήμερα</button>

                    <button className="h-8 w-8 rounded-md border border-white/10 hover:bg-white/5"
                        onClick={goNext} aria-label="Next">›</button>
                    <div className="ml-2 font-semibold">
                        {cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                    </div>

                    <div className="ml-auto flex items-center gap-1">
                        {/* NEW: view toggle */}
                        <button
                            onClick={() => setViewMode('day')}
                            className={`h-8 px-3 rounded-md border text-sm ${viewMode === 'day' ? 'bg-primary/70 border-primary/70' : 'border-white/10 hover:bg-white/5'}`}
                        >
                            Ημέρα
                        </button>
                        <button
                            onClick={() => setViewMode('month')}
                            className={`h-8 px-3 rounded-md border text-sm ${viewMode === 'month' ? 'bg-primary/70 border-primary/70' : 'border-white/10 hover:bg白/5'.replace('白', 'white')}`}
                        >
                            Μήνας
                        </button>
                    </div>

                    {error && <div className="ml-3 text-xs text-danger">{error}</div>}
                    {loading && <div className="ml-3 text-xs opacity-60">Loading…</div>}
                </div>
            )}

            {/* BODY */}
            <div style={height ? { height } : undefined} className="p-2">
                {viewMode === 'day' ? (
                    // ===== DAY VIEW =====
                    <div className="space-y-2">
                        <div className="text-xs uppercase tracking-wide opacity-70">
                            {cursor.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                        </div>
                        <div className="space-y-2">
                            {(classId ? rows.filter(r => r.class_id === classId) : rows).length === 0 && (
                                <div className="text-sm opacity-50 italic">Καμία Συνεδρία Σήμερα</div>
                            )}
                            {(classId ? rows.filter(r => r.class_id === classId) : rows).map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => onSessionClick?.(s)}
                                    className="w-full text-left truncate rounded-md border border-white/10 px-3 py-2 hover:bg-white/5"
                                    title={`${sessionTitle(s)} • ${fmtHM(s.starts_at)}–${fmtHM(s.ends_at)}`}
                                >
                                    <div className="text-[11px] opacity-70">{fmtHM(s.starts_at)}–{fmtHM(s.ends_at)}</div>
                                    <div className="text-sm font-medium truncate">{sessionTitle(s)}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    // ===== MONTH VIEW (existing grid) =====
                    <>
                        <div className="grid grid-cols-7 text-[10px] uppercase tracking-wide opacity-70 mb-1">
                            {['Κυρ', 'Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ'].map(d => <div key={d} className="px-1 py-1">{d}</div>)}
                        </div>
                        <div className={height ? 'h-[calc(100%-22px)] overflow-auto' : ''}>
                            <div className="grid grid-cols-7 gap-[1px] bg-white/10 rounded-md overflow-hidden">
                                {days.map((day, idx) => {
                                    const key = ymdLocal(day); // important: local key
                                    const isOtherMonth = day.getMonth() !== monthStart.getMonth();
                                    const isToday = sameDay(day, new Date());
                                    const items = sessionsByDay[key] ?? [];
                                    return (
                                        <div key={idx} className={`min-h-[90px] bg-secondary-background/60 p-1 relative ${isOtherMonth ? 'opacity-60' : ''}`}>
                                            <div className="absolute top-1 right-1 text-[10px]">
                                                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${isToday ? 'bg-primary/80 text-white' : 'opacity-70'}`}>
                                                    {day.getDate()}
                                                </span>
                                            </div>
                                            <div className="mt-5 flex flex-col gap-1">
                                                {items.length === 0 && <div className="text-[11px] opacity-40 italic">—</div>}
                                                {items.map((s) => (
                                                    <button
                                                        key={s.id}
                                                        onClick={() => onSessionClick?.(s)}
                                                        className="w-full text-left truncate rounded-md border border-white/10 px-2 py-1 hover:bg-white/5"
                                                        title={`${sessionTitle(s)} • ${fmtHM(s.starts_at)}–${fmtHM(s.ends_at)}`}
                                                    >
                                                        <div className="text-[10px] opacity-70">{fmtHM(s.starts_at)}–{fmtHM(s.ends_at)}</div>
                                                        <div className="text-sm font-medium truncate">{sessionTitle(s)}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
