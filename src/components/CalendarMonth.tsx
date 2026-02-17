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

const WEEKDAY_LABELS = ['Κυρ', 'Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ'];

function startOfMonth(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfMonth(d: Date) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + 1, 0);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  const dow = x.getDay(); // 0=Sun..6=Sat
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function fmtHM(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type Slot = { start: string; end: string };

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type DaySchedule = { open: boolean; slots: Slot[] };
type WeekSchedule = Record<DayKey, DaySchedule>;

type TenantOpeningHoursRow = {
  tenant_id: string;
  timezone: string;
  week: WeekSchedule;
  exceptions: any[];
};

function dayKeyFromDate(d: Date): DayKey {
  // JS: 0=Sun..6=Sat
  const map: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[d.getDay()];
}

function isoToKey(iso: string) {
  if (!iso || iso.length < 10) return 0;
  const y = iso.slice(0, 4);
  const m = iso.slice(5, 7);
  const d = iso.slice(8, 10);
  const n = parseInt(`${y}${m}${d}`, 10);
  return Number.isFinite(n) ? n : 0;
}

function isClosedByExceptions(exceptions: any[], ymd: string) {
  const k = isoToKey(ymd);

  for (const e of Array.isArray(exceptions) ? exceptions : []) {
    const t = e?.type;

    // closures: always closed
    if (t === "closure" && e?.date && isoToKey(e.date) === k) return true;
    if (t === "closure_range" && e?.from && e?.to) {
      const a = isoToKey(e.from);
      const b = isoToKey(e.to);
      if (k >= a && k <= b) return true;
    }

    // holidays: closed only if closed=true
    if (t === "holiday" && e?.date && isoToKey(e.date) === k) {
      if (e?.closed === true) return true;
    }
    if (t === "holiday_range" && e?.from && e?.to) {
      const a = isoToKey(e.from);
      const b = isoToKey(e.to);
      if (k >= a && k <= b) {
        if (e?.closed === true) return true;
      }
    }
  }

  return false;
}

function isGymClosedOnDate(params: {
  ymd: string; // local YYYY-MM-DD
  date: Date;  // local date object
  week?: WeekSchedule | null;
  exceptions?: any[] | null;
}) {
  const { ymd, date, week, exceptions } = params;

  // 1) Exceptions override everything
  if (isClosedByExceptions(exceptions ?? [], ymd)) return true;

  // 2) Weekly schedule (if present)
  if (week) {
    const dk = dayKeyFromDate(date);
    const day = week[dk];
    if (day && day.open === false) return true;
  }

  return false;
}


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
  classId?: string; // optional filter
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monthStart = useMemo(() => startOfMonth(cursor), [cursor]);
  const gridStart = useMemo(() => startOfWeek(monthStart), [monthStart]);
  const gridDays = 42; // 6 weeks

  const [opening, setOpening] = useState<TenantOpeningHoursRow | null>(null);


  function sessionTitle(s: Session) {
    const c = s.classes;
    if (!c) return 'Class';
    return Array.isArray(c) ? c[0]?.title ?? 'Class' : c.title ?? 'Class';
  }

  function ymdLocal(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`; // local YYYY-MM-DD
  }

  function utcMidnightISO(d: Date) {
    // UTC midnight for the same local calendar day
    return new Date(
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0),
    ).toISOString();
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

    const [sess, cls, oh] = await Promise.all([
      supabase
        .from("class_sessions")
        .select("id, tenant_id, class_id, starts_at, ends_at, capacity, classes(title)")
        .eq("tenant_id", tenantId)
        .gte("starts_at", fromISO)
        .lt("starts_at", toISO)
        .order("starts_at", { ascending: true }),

      supabase
        .from("classes")
        .select("id, title")
        .eq("tenant_id", tenantId)
        .order("title"),

      supabase
        .from("tenant_opening_hours")
        .select("tenant_id, timezone, week, exceptions")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
    ]);

    if (sess.error || cls.error || oh.error) {
      setError(
        sess.error?.message ??
        cls.error?.message ??
        oh.error?.message ??
        "Failed to load",
      );
    } else {
      setRows((sess.data as Session[]) ?? []);
      setOpening((oh.data as TenantOpeningHoursRow) ?? null);
    }
    setLoading(false);


    if (sess.error || cls.error) {
      setError(
        sess.error?.message ?? cls.error?.message ?? 'Failed to load sessions',
      );
    } else {
      setRows((sess.data as Session[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, cursor, classId, viewMode]);

  const sessionsByDay = useMemo(() => {
    const map: Record<string, Session[]> = {};
    const list = classId ? rows.filter((r) => r.class_id === classId) : rows;
    for (const s of list) {
      const key = ymdLocal(new Date(s.starts_at));
      (map[key] ||= []).push(s);
    }
    return map;
  }, [rows, classId]);

  const days = useMemo(
    () => Array.from({ length: gridDays }, (_, i) => addDays(gridStart, i)),
    [gridStart],
  );

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

  const filteredDayRows =
    viewMode === 'day'
      ? classId
        ? rows.filter((r) => r.class_id === classId)
        : rows
      : [];


  const dayClosed = useMemo(() => {
    const key = ymdLocal(cursor);
    return isGymClosedOnDate({
      ymd: key,
      date: cursor,
      week: opening?.week ?? null,
      exceptions: opening?.exceptions ?? null,
    });
  }, [cursor, opening, ymdLocal]);


  return (
    <div className="w-full rounded-md border border-border/10 bg-secondary-background/60">
      {header && (
        <div className="px-2 sm:px-3 py-2 border-b border-border/10 flex flex-wrap items-center gap-2">
          <button
            className="h-8 w-8 rounded-md border border-border/10 hover:bg-white/5"
            onClick={goPrev}
            aria-label="Prev"
          >
            ‹
          </button>

          <button
            className="h-8 rounded-md border border-border/10 px-2 hover:bg-white/5 text-xs sm:text-sm"
            onClick={goToday}
          >
            Σήμερα
          </button>

          <button
            className="h-8 w-8 rounded-md border border-border/10 hover:bg-white/5"
            onClick={goNext}
            aria-label="Next"
          >
            ›
          </button>

          <div className="ml-0 sm:ml-2 font-semibold text-sm sm:text-base">
            {cursor.toLocaleString(undefined, {
              month: 'long',
              year: 'numeric',
            })}
          </div>

          <div className="ml-auto flex items-center gap-1 mt-1 sm:mt-0">
            <button
              onClick={() => setViewMode('day')}
              className={`h-8 px-3 rounded-md border text-xs sm:text-sm ${viewMode === 'day'
                ? 'bg-primary/90 border-primary/70 text-white'
                : 'border-border/10 hover:bg-border/5'
                }`}
            >
              Ημέρα
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`h-8 px-3 rounded-md border text-xs sm:text-sm ${viewMode === 'month'
                ? 'bg-primary/90 border-primary/70 text-white'
                : 'border-border/10 hover:bg-border/5'
                }`}
            >
              Μήνας
            </button>
          </div>

          {error && (
            <div className="w-full sm:w-auto text-[11px] text-red-400 mt-1 sm:mt-0">
              {error}
            </div>
          )}
          {loading && !error && (
            <div className="text-[11px] opacity-60 mt-1 sm:mt-0">Loading…</div>
          )}
        </div>
      )}

      {/* BODY */}
      <div
        style={height ? { height } : undefined}
        className="p-2 sm:p-3 overflow-hidden"
      >
        {viewMode === 'day' ? (
          // ===== DAY VIEW =====
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-wide opacity-70">
                {cursor.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </div>

              {dayClosed && (
                <span className="text-[10px] px-2 py-1 rounded-full border border-danger/30 bg-danger/15 text-danger">
                  Κλειστό
                </span>
              )}
            </div>

            <div className="space-y-2">
              {dayClosed && (
                <div className="text-[11px] text-text-secondary">
                  Το γυμναστήριο είναι δηλωμένο ως κλειστό για αυτή την ημέρα.
                </div>
              )}

              {filteredDayRows.length === 0 && (
                <div className="text-sm opacity-50 italic">Καμία συνεδρία σήμερα</div>
              )}

              {filteredDayRows.map((s) => (
                <button
                  key={s.id}
                  disabled={dayClosed}
                  onClick={() => !dayClosed && onSessionClick?.(s)}
                  className={`w-full text-left truncate rounded-md border border-border/10 px-2 py-1 hover:bg-border/5
                                  ${dayClosed ? "opacity-50 cursor-not-allowed" : ""}`}
                  title={`${sessionTitle(s)} • ${fmtHM(s.starts_at)}–${fmtHM(s.ends_at)}`}
                >
                  <div className="text-[11px] opacity-70">
                    {fmtHM(s.starts_at)}–{fmtHM(s.ends_at)}
                  </div>
                  <div className="text-sm font-medium truncate">{sessionTitle(s)}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          // ===== MONTH VIEW =====
          <>
            {/* Weekday header: only on ≥ sm */}
            <div className="hidden sm:grid grid-cols-7 text-[10px] uppercase tracking-wide opacity-70 mb-1">
              {WEEKDAY_LABELS.map((d) => (
                <div key={d} className="px-1 py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className={height ? 'h-[calc(100%-22px)] overflow-auto' : ''}>
              <div className="grid grid-cols-1 sm:grid-cols-7 gap-2 bg-border/10 rounded-md overflow-hidden">
                {days.map((day, idx) => {
                  const key = ymdLocal(day);
                  const isOtherMonth =
                    day.getMonth() !== monthStart.getMonth();
                  const isToday = sameDay(day, new Date());
                  const items = sessionsByDay[key] ?? [];

                  const weekdayLabel = WEEKDAY_LABELS[day.getDay()];

                  const isClosed = isGymClosedOnDate({
                    ymd: key,
                    date: day,
                    week: opening?.week ?? null,
                    exceptions: opening?.exceptions ?? null,
                  });


                  return (
                    <div
                      key={idx}
                      className={`min-h-20 sm:min-h-22.5 bg-secondary-background/60 p-2 relative ${isOtherMonth ? "opacity-60" : ""
                        }`}
                    >
                      {isClosed && (
                        <div className="absolute top-2 left-2">
                          <span className="text-[10px] px-2 py-1 rounded-full border border-danger/30 bg-danger/15 text-danger">
                            Κλειστό
                          </span>
                        </div>
                      )}
                      {/* Day-of-week label for mobile */}
                      <div className="sm:hidden text-[10px] uppercase tracking-wide opacity-70 mb-1">
                        {weekdayLabel}
                      </div>

                      {/* Day bubble */}
                      <div className="absolute top-2 right-2 text-[10px]">
                        <span
                          className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${isToday
                            ? 'bg-primary/80 text-white'
                            : 'bg-transparent text-text-primary/70'
                            }`}
                        >
                          {day.getDate()}
                        </span>
                      </div>

                      <div className="mt-6 sm:mt-5 flex flex-col gap-1">
                        {items.length === 0 && (
                          <div className="text-[11px] opacity-40 italic">
                            —
                          </div>
                        )}
                        {items.map((s) => (
                          <button
                            key={s.id}
                            disabled={isClosed}
                            onClick={() => !isClosed && onSessionClick?.(s)}
                            className={`w-full text-left truncate rounded-md border border-border/10 px-2 py-1 hover:bg-border/5
                                  ${isClosed ? "opacity-50 cursor-not-allowed" : ""}`}
                            title={`${sessionTitle(s)} • ${fmtHM(
                              s.starts_at,
                            )}–${fmtHM(s.ends_at)}`}
                          >
                            <div className="text-[10px] opacity-70">
                              {fmtHM(s.starts_at)}–{fmtHM(s.ends_at)}
                            </div>
                            <div className="text-[12px] font-medium truncate">
                              {sessionTitle(s)}
                            </div>
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
