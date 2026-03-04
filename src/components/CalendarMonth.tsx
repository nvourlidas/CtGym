import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronLeft, ChevronRight, Calendar, Loader2, AlertTriangle, Clock, Lock } from 'lucide-react';

type Session = {
  id: string; tenant_id: string; class_id: string;
  starts_at: string; ends_at: string | null; capacity: number | null;
  classes?: { title: string }[] | { title: string } | null;
};
type ViewMode = 'month' | 'day';
type DayKey   = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type Slot     = { start: string; end: string };
type DaySchedule = { open: boolean; slots: Slot[] };
type WeekSchedule = Record<DayKey, DaySchedule>;
type TenantOpeningHoursRow = { tenant_id: string; timezone: string; week: WeekSchedule; exceptions: any[] };

const WEEKDAY_LABELS = ['Κυρ', 'Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ'];

// ── Date helpers ──────────────────────────────────────────────────────────
function startOfMonth(d: Date) { const x=new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; }
function endOfMonth(d: Date)   { const x=new Date(d); x.setMonth(x.getMonth()+1,0); x.setHours(23,59,59,999); return x; }
function startOfWeek(d: Date)  { const x=new Date(d); x.setDate(x.getDate()-x.getDay()); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function sameDay(a: Date, b: Date) { return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function fmtHM(iso?: string | null) { if (!iso) return ''; return new Date(iso).toLocaleTimeString('el-GR',{hour:'2-digit',minute:'2-digit',hour12:false}); }
function ymdLocal(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function utcMidnightISO(d: Date) { return new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate(),0,0,0)).toISOString(); }
function dayKeyFromDate(d: Date): DayKey { return (['sun','mon','tue','wed','thu','fri','sat'] as DayKey[])[d.getDay()]; }
function isoToKey(iso: string) { if (!iso||iso.length<10) return 0; const n=parseInt(iso.slice(0,4)+iso.slice(5,7)+iso.slice(8,10),10); return Number.isFinite(n)?n:0; }

function isClosedByExceptions(exceptions: any[], ymd: string) {
  const k = isoToKey(ymd);
  for (const e of Array.isArray(exceptions) ? exceptions : []) {
    const t = e?.type;
    if (t==='closure'&&e?.date&&isoToKey(e.date)===k) return true;
    if (t==='closure_range'&&e?.from&&e?.to&&k>=isoToKey(e.from)&&k<=isoToKey(e.to)) return true;
    if (t==='holiday'&&e?.date&&isoToKey(e.date)===k&&e?.closed===true) return true;
    if (t==='holiday_range'&&e?.from&&e?.to&&k>=isoToKey(e.from)&&k<=isoToKey(e.to)&&e?.closed===true) return true;
  }
  return false;
}
function isGymClosedOnDate({ ymd, date, week, exceptions }: { ymd: string; date: Date; week?: WeekSchedule | null; exceptions?: any[] | null }) {
  if (isClosedByExceptions(exceptions??[], ymd)) return true;
  if (week) { const dk=dayKeyFromDate(date); const day=week[dk]; if (day&&day.open===false) return true; }
  return false;
}

// ── Session chip ──────────────────────────────────────────────────────────

function useTheme() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') !== 'light');

  useEffect(() => {
    const handler = () => setIsDark(localStorage.getItem('theme') !== 'light');
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return isDark;
}

const SESSION_COLORS_DARK = [
  'border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20',
  'border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20',
  'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
  'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
  'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20',
  'border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20',
];

const SESSION_COLORS_LIGHT = [
  'border-sky-500/40 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20',
  'border-violet-500/40 bg-violet-500/10 text-violet-700 hover:bg-violet-500/20',
  'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20',
  'border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20',
  'border-rose-500/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20',
  'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20',
];

function sessionColor(classId: string, isDark: boolean) {
  let hash = 0;
  for (let i = 0; i < classId.length; i++)
    hash = (hash * 31 + classId.charCodeAt(i)) & 0xffff;
  const palette = isDark ? SESSION_COLORS_DARK : SESSION_COLORS_LIGHT;
  return palette[hash % palette.length];
}

function SessionChip({ s, isClosed, onSessionClick }: { s: Session; isClosed: boolean; onSessionClick?: (s: Session) => void }) {
  const isDark = useTheme();
  const color = sessionColor(s.class_id, isDark);
  const title = (() => { const c=s.classes; if (!c) return 'Class'; return Array.isArray(c)?c[0]?.title??'Class':c.title??'Class'; })();
  
  return (
    <button
      disabled={isClosed}
      onClick={() => !isClosed && onSessionClick?.(s)}
      className={`w-full text-left rounded-lg border px-2 py-1 transition-all ${isClosed ? 'opacity-40 cursor-not-allowed grayscale' : 'cursor-pointer ' + color}`}
      title={`${title} • ${fmtHM(s.starts_at)}–${fmtHM(s.ends_at)}`}
    >
      <div className="flex items-center gap-1 text-[9.5px] opacity-70">
        <Clock className="h-2.5 w-2.5 shrink-0" />
        <span>{fmtHM(s.starts_at)}{s.ends_at ? `–${fmtHM(s.ends_at)}` : ''}</span>
      </div>
      <div className="text-[11px] font-semibold truncate leading-tight mt-0.5">{title}</div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function CalendarMonth({
  tenantId, initialDate, classId, onSessionClick, header = true, height,
}: {
  tenantId: string; initialDate?: Date; classId?: string;
  onSessionClick?: (s: Session) => void; header?: boolean; height?: number | string;
}) {
  const [cursor, setCursor] = useState<Date>(() => {
    const d = initialDate ? new Date(initialDate) : new Date();
    d.setHours(0,0,0,0); return d;
  });
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [rows, setRows]         = useState<Session[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [opening, setOpening]   = useState<TenantOpeningHoursRow | null>(null);

  const monthStart = useMemo(() => startOfMonth(cursor), [cursor]);
  const gridStart  = useMemo(() => startOfWeek(monthStart), [monthStart]);
  const days       = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);

  async function load() {
    if (!tenantId) return;
    setLoading(true); setError(null);
    let fromISO: string, toISO: string;
    if (viewMode === 'day') {
      const d = new Date(cursor); d.setHours(0,0,0,0);
      fromISO = utcMidnightISO(d); toISO = utcMidnightISO(addDays(d,1));
    } else {
      fromISO = utcMidnightISO(gridStart); toISO = utcMidnightISO(addDays(gridStart,42));
    }

    const [sess, , oh] = await Promise.all([
      supabase.from('class_sessions').select('id,tenant_id,class_id,starts_at,ends_at,capacity,classes(title)').eq('tenant_id',tenantId).gte('starts_at',fromISO).lt('starts_at',toISO).order('starts_at',{ascending:true}),
      supabase.from('classes').select('id,title').eq('tenant_id',tenantId).order('title'),
      supabase.from('tenant_opening_hours').select('tenant_id,timezone,week,exceptions').eq('tenant_id',tenantId).maybeSingle(),
    ]);

    if (sess.error || oh.error) { setError(sess.error?.message ?? oh.error?.message ?? 'Failed to load'); }
    else { setRows((sess.data as Session[]) ?? []); setOpening((oh.data as TenantOpeningHoursRow) ?? null); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [tenantId, cursor, classId, viewMode]);

  const sessionsByDay = useMemo(() => {
    const map: Record<string, Session[]> = {};
    const list = classId ? rows.filter((r) => r.class_id === classId) : rows;
    for (const s of list) { const key = ymdLocal(new Date(s.starts_at)); (map[key] ||= []).push(s); }
    return map;
  }, [rows, classId]);

  const filteredDayRows = viewMode === 'day' ? (classId ? rows.filter((r) => r.class_id === classId) : rows) : [];

  const dayClosed = useMemo(() => isGymClosedOnDate({ ymd: ymdLocal(cursor), date: cursor, week: opening?.week??null, exceptions: opening?.exceptions??null }), [cursor, opening]);

  const goPrev  = () => viewMode==='day' ? setCursor(addDays(cursor,-1)) : setCursor(addDays(startOfMonth(cursor),-1));
  const goNext  = () => viewMode==='day' ? setCursor(addDays(cursor,+1)) : setCursor(addDays(endOfMonth(cursor),+1));
  const goToday = () => { const d=new Date(); d.setHours(0,0,0,0); setCursor(d); };

  const monthLabel = cursor.toLocaleString('el-GR', { month: 'long', year: 'numeric' });

  return (
    <div className="w-full rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
      {/* ── Header ── */}
      {header && (
        <div className="px-4 py-3 border-b border-border/10 flex flex-wrap items-center gap-2">
          {/* Icon chip + title */}
          <div className="flex items-center gap-2.5 mr-1">
            <div className="w-7 h-7 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
              <Calendar className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="font-black text-text-primary tracking-tight capitalize">{monthLabel}</span>
          </div>

          {/* Nav */}
          <div className="flex items-center gap-1">
            <button onClick={goPrev} className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer" aria-label="Προηγούμενο">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button onClick={goToday} className="h-7 px-3 rounded-xl border border-border/15 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">
              Σήμερα
            </button>
            <button onClick={goNext} className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer" aria-label="Επόμενο">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* View toggle */}
          <div className="ml-auto flex items-center gap-1 p-1 rounded-xl border border-border/15 bg-secondary-background">
            {(['day','month'] as ViewMode[]).map((v) => (
              <button key={v} onClick={() => setViewMode(v)}
                className={['h-6 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer', viewMode===v ? 'bg-primary text-white shadow-sm shadow-primary/30' : 'text-text-secondary hover:text-text-primary hover:bg-secondary/30'].join(' ')}
              >{v==='day' ? 'Ημέρα' : 'Μήνας'}</button>
            ))}
          </div>

          {/* Status indicators */}
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-text-secondary" />}
          {error && <div className="flex items-center gap-1 text-xs text-danger"><AlertTriangle className="h-3.5 w-3.5" />{error}</div>}
        </div>
      )}

      {/* ── Body ── */}
      <div style={height ? { height } : undefined} className="p-3 overflow-hidden">

        {/* ===== DAY VIEW ===== */}
        {viewMode === 'day' && (
          <div className="space-y-3">
            {/* Day label */}
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-widest text-text-secondary">
                {cursor.toLocaleDateString('el-GR', { weekday:'long', month:'short', day:'numeric' })}
              </div>
              {dayClosed && (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2.5 py-1 rounded-lg border border-danger/30 bg-danger/10 text-danger">
                  <Lock className="h-2.5 w-2.5" />Κλειστό
                </span>
              )}
            </div>

            {dayClosed && (
              <div className="text-xs text-text-secondary px-3 py-2 rounded-xl border border-danger/15 bg-danger/5">
                Το γυμναστήριο είναι δηλωμένο ως κλειστό για αυτή την ημέρα.
              </div>
            )}

            {filteredDayRows.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-text-secondary">
                <Calendar className="h-6 w-6 opacity-20" />
                <span className="text-sm">Καμία συνεδρία σήμερα</span>
              </div>
            )}

            <div className="space-y-2">
              {filteredDayRows.map((s) => (
                <SessionChip key={s.id} s={s} isClosed={dayClosed} onSessionClick={onSessionClick} />
              ))}
            </div>
          </div>
        )}

        {/* ===== MONTH VIEW ===== */}
        {viewMode === 'month' && (
          <>
            {/* Weekday headers */}
            <div className="hidden sm:grid grid-cols-7 mb-1">
              {WEEKDAY_LABELS.map((d) => (
                <div key={d} className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-text-secondary">{d}</div>
              ))}
            </div>

            <div className={height ? 'h-[calc(100%-28px)] overflow-auto' : ''}>
              <div className="grid grid-cols-1 sm:grid-cols-7 gap-px bg-border/8 rounded-xl overflow-hidden">
                {days.map((day, idx) => {
                  const key           = ymdLocal(day);
                  const isOtherMonth  = day.getMonth() !== monthStart.getMonth();
                  const isToday       = sameDay(day, new Date());
                  const items         = sessionsByDay[key] ?? [];
                  const weekdayLabel  = WEEKDAY_LABELS[day.getDay()];
                  const isClosed      = isGymClosedOnDate({ ymd:key, date:day, week:opening?.week??null, exceptions:opening?.exceptions??null });

                  return (
                    <div key={idx} className={['min-h-24 sm:min-h-28 bg-secondary-background p-2 relative flex flex-col', isOtherMonth ? 'opacity-35' : '', isToday ? 'ring-1 ring-inset ring-primary/30' : ''].join(' ')}>
                      {/* Closed overlay badge */}
                      {isClosed && (
                        <div className="absolute top-1.5 left-1.5">
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md border border-danger/30 bg-danger/10 text-danger">
                            <Lock className="h-2 w-2" />Κλειστό
                          </span>
                        </div>
                      )}

                      {/* Day-of-week label on mobile */}
                      <div className="sm:hidden text-[9px] font-bold uppercase tracking-widest text-text-secondary mb-1">{weekdayLabel}</div>

                      {/* Day number bubble — top right */}
                      <div className="absolute top-1.5 right-1.5">
                        <span className={['inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold', isToday ? 'bg-primary text-white shadow-sm shadow-primary/40' : 'text-text-secondary'].join(' ')}>
                          {day.getDate()}
                        </span>
                      </div>

                      {/* Sessions list */}
                      <div className={['flex flex-col gap-1 overflow-hidden', isClosed ? 'mt-5' : 'mt-6'].join(' ')}>
                        {items.length === 0 && (
                          <div className="text-[10px] text-text-secondary opacity-30 italic mt-1">—</div>
                        )}
                        {items.slice(0, 3).map((s) => (
                          <SessionChip key={s.id} s={s} isClosed={isClosed} onSessionClick={onSessionClick} />
                        ))}
                        {items.length > 3 && (
                          <div className="text-[10px] font-semibold text-text-secondary opacity-60 px-1">
                            +{items.length - 3} ακόμη
                          </div>
                        )}
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