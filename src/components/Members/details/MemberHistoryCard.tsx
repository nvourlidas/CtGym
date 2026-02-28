// src/components/members/details/MemberHistoryCard.tsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { BookingStatus, HistoryRow } from './types';
import {
  addMonths, fmtDayEL, fmtMonthEL, formatDateTimeEL,
  isSameMonth, parseYMD, toYMD,
  STATUS_BADGE_CLASS, STATUS_LABEL,
} from './utils';
import CreateMemberBookingModal from './CreateMemberBookingModal';
import { ChevronLeft, ChevronRight, CalendarDays, Plus, Loader2, Clock } from 'lucide-react';

export default function MemberHistoryCard({
  tenantId, memberId, guard,
}: {
  tenantId: string;
  memberId: string;
  guard?: () => boolean;
}) {
  const [historyRows, setHistoryRows]         = useState<HistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory]   = useState(false);
  const [historyError, setHistoryError]       = useState<string | null>(null);
  const [showCreateBooking, setShowCreateBooking] = useState(false);

  const [historyFrom] = useState<string>('');
  const [historyTo]   = useState<string>('');

  const [historyMonthCursor, setHistoryMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [historySelectedDay, setHistorySelectedDay] = useState<string>(() => toYMD(new Date()));

  async function loadHistory() {
    if (!tenantId || !memberId) return;
    setLoadingHistory(true);
    setHistoryError(null);

    const { data, error } = await supabase
      .from('bookings')
      .select(`id, status, created_at, class_sessions(starts_at, ends_at, classes(title))`)
      .eq('tenant_id', tenantId)
      .eq('user_id', memberId)
      .order('created_at', { ascending: false });

    if (error) {
      setHistoryError(error.message);
      setHistoryRows([]);
      setLoadingHistory(false);
      return;
    }

    const mapped: HistoryRow[] = ((data as any[]) ?? []).map((b) => ({
      id:            b.id,
      status:        b.status,
      created_at:    b.created_at,
      session_start: b.class_sessions?.starts_at ?? null,
      session_end:   b.class_sessions?.ends_at   ?? null,
      class_title:   b.class_sessions?.classes?.title ?? null,
    }));

    setHistoryRows(mapped);
    setLoadingHistory(false);
  }

  useEffect(() => { loadHistory(); }, [tenantId, memberId]);

  const filteredHistoryRows = useMemo(() => {
    if (!historyFrom && !historyTo) return historyRows;
    const fromDate = historyFrom ? new Date(historyFrom + 'T00:00:00') : null;
    const toDate   = historyTo   ? new Date(historyTo   + 'T23:59:59') : null;
    return historyRows.filter((r) => {
      const baseIso = r.session_start ?? r.created_at;
      if (!baseIso) return false;
      const d = new Date(baseIso);
      if (Number.isNaN(d.getTime())) return false;
      if (fromDate && d < fromDate) return false;
      if (toDate   && d > toDate)   return false;
      return true;
    });
  }, [historyRows, historyFrom, historyTo]);

  const calendarBlock = useMemo(() => {
    // Loading
    if (loadingHistory) {
      return (
        <div className="flex items-center justify-center gap-2 py-12 text-text-secondary text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Φόρτωση…
        </div>
      );
    }

    // Empty
    if (filteredHistoryRows.length === 0) {
      return (
        <div className="flex flex-col items-center gap-3 py-12 text-text-secondary">
          <CalendarDays className="h-8 w-8 opacity-30" />
          <span className="text-sm">Δεν υπάρχουν κρατήσεις</span>
        </div>
      );
    }

    const byDay = new Map<string, typeof filteredHistoryRows>();
    for (const r of filteredHistoryRows) {
      const base = r.session_start ?? r.created_at;
      const key  = toYMD(new Date(base));
      const arr  = byDay.get(key) ?? [];
      arr.push(r);
      byDay.set(key, arr);
    }

    const monthDaysWithData = Array.from(byDay.keys())
      .map(parseYMD)
      .filter((d) => isSameMonth(d, historyMonthCursor))
      .map(toYMD)
      .sort();

    const selectedHasData  = byDay.has(historySelectedDay);
    const effectiveSelected = selectedHasData ? historySelectedDay : (monthDaysWithData[0] ?? historySelectedDay);

    // Build calendar cells
    const firstOfMonth = new Date(historyMonthCursor.getFullYear(), historyMonthCursor.getMonth(), 1);
    const start = new Date(firstOfMonth);
    const mondayIndex = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayIndex);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const dd = new Date(start);
      dd.setDate(start.getDate() + i);
      cells.push(dd);
    }

    function getCounts(dayKey: string) {
      const rows = byDay.get(dayKey) ?? [];
      const counts: Record<BookingStatus, number> = { booked: 0, checked_in: 0, canceled: 0, no_show: 0 };
      for (const rr of rows) {
        const s = (rr.status ?? 'booked') as BookingStatus;
        if (counts[s] !== undefined) counts[s] += 1;
      }
      return { rows, counts };
    }

    const { rows: selectedRows } = getCounts(effectiveSelected);

    const DOT_COLORS: Record<BookingStatus, string> = {
      booked:     'bg-primary',
      checked_in: 'bg-success',
      canceled:   'bg-danger',
      no_show:    'bg-warning',
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-3">

        {/* ── Calendar ── */}
        <div className="rounded-xl border border-border/10 overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/10 bg-secondary/5">
            <button
              type="button"
              onClick={() => setHistoryMonthCursor((m) => addMonths(m, -1))}
              className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 text-text-secondary hover:text-text-primary transition-all cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-sm font-bold text-text-primary capitalize">
              {fmtMonthEL(historyMonthCursor)}
            </span>
            <button
              type="button"
              onClick={() => setHistoryMonthCursor((m) => addMonths(m, +1))}
              className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 text-text-secondary hover:text-text-primary transition-all cursor-pointer"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-border/10">
            {['Δ','Τ','Τ','Π','Π','Σ','Κ'].map((w, idx) => (
              <div key={idx} className="py-1.5 text-[10px] font-bold text-text-secondary text-center uppercase tracking-wider">
                {w}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7">
            {cells.map((d) => {
              const key       = toYMD(d);
              const inMonth   = isSameMonth(d, historyMonthCursor);
              const isSelected = key === effectiveSelected;
              const { counts } = getCounts(key);
              const total = counts.booked + counts.checked_in + counts.canceled + counts.no_show;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setHistorySelectedDay(key)}
                  title={key}
                  className={[
                    'relative min-h-11.5 px-1.5 py-1 text-left border-b border-r border-border/5 transition-all duration-100',
                    !inMonth ? 'opacity-30' : '',
                    isSelected
                      ? 'bg-primary/12 ring-1 ring-inset ring-primary/40'
                      : 'hover:bg-secondary/15 cursor-pointer',
                    total > 0 && !isSelected ? 'bg-secondary/5' : '',
                  ].join(' ')}
                >
                  <div className={['text-[11px] font-semibold', isSelected ? 'text-primary' : total > 0 ? 'text-text-primary' : 'text-text-secondary'].join(' ')}>
                    {d.getDate()}
                  </div>
                  {total > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-0.5">
                      {(Object.entries(counts) as [BookingStatus, number][]).map(([status, count]) =>
                        count > 0
                          ? <span key={status} className={`h-1.5 w-1.5 rounded-full ${DOT_COLORS[status]}`} />
                          : null
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="px-3 py-2 border-t border-border/10 flex flex-wrap gap-x-3 gap-y-1">
            {[
              { label: 'Κράτηση',   color: 'bg-primary'  },
              { label: 'Check-in',  color: 'bg-success'  },
              { label: 'Ακύρωση',   color: 'bg-danger'   },
              { label: 'Απουσία',   color: 'bg-warning'  },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1 text-[10px] text-text-secondary">
                <span className={`h-1.5 w-1.5 rounded-full ${item.color}`} />
                {item.label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Day detail panel ── */}
        <div className="rounded-xl border border-border/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/10 bg-secondary/5">
            <div className="text-sm font-bold text-text-primary capitalize">{fmtDayEL(effectiveSelected)}</div>
            <div className="text-xs text-text-secondary mt-0.5">
              {selectedRows.length} Συνεδρία{selectedRows.length !== 1 ? 'ες' : ''}
            </div>
          </div>

          {selectedRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-text-secondary">
              <CalendarDays className="h-6 w-6 opacity-30" />
              <span className="text-xs">Καμία συνεδρία</span>
            </div>
          ) : (
            <div className="divide-y divide-border/10">
              {selectedRows
                .slice()
                .sort((a, b) => new Date(a.session_start ?? a.created_at).getTime() - new Date(b.session_start ?? b.created_at).getTime())
                .map((r) => {
                  const status = (r.status ?? 'booked') as BookingStatus;
                  const start  = r.session_start ? new Date(r.session_start) : null;

                  return (
                    <div key={r.id} className="px-4 py-3 hover:bg-secondary/5 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-text-primary truncate">
                            {r.class_title ?? '—'}
                          </div>
                          {start && (
                            <div className="flex items-center gap-1 mt-0.5 text-xs text-text-secondary">
                              <Clock className="h-3 w-3 opacity-60" />
                              {start.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                        </div>
                        <span className={['text-[11px] px-2 py-0.5 rounded-lg border font-semibold shrink-0', STATUS_BADGE_CLASS[status]].join(' ')}>
                          {STATUS_LABEL[status] ?? status}
                        </span>
                      </div>
                      <div className="mt-1.5 text-[10.5px] text-text-secondary opacity-60">
                        Κράτηση: {formatDateTimeEL(r.created_at)}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    );
  }, [filteredHistoryRows, historyMonthCursor, historySelectedDay, loadingHistory]);

  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-sm 3xl:col-span-1 2xl:col-span-2 xl:col-span-2 md:col-span-2 overflow-hidden">

      {/* Card header */}
      <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <CalendarDays className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-black text-text-primary tracking-tight">Ιστορικό</h2>
            <p className="text-[11px] text-text-secondary mt-px">Επιλέξτε ημερομηνία για να δείτε τις συνεδρίες.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => { if (guard && !guard()) return; setShowCreateBooking(true); }}
          className="
            group relative inline-flex items-center gap-1.5 h-8 px-3 rounded-xl
            text-xs font-bold text-white bg-primary hover:bg-primary/90
            shadow-sm shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-px
            active:translate-y-0 transition-all duration-150 cursor-pointer overflow-hidden shrink-0
          "
        >
          <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          <Plus className="h-3.5 w-3.5 relative z-10" />
          <span className="relative z-10 hidden sm:inline">Νέα Κράτηση</span>
        </button>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        {historyError && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
            <span className="mt-px shrink-0">⚠</span>
            {historyError}
          </div>
        )}
        {calendarBlock}
      </div>

      {showCreateBooking && (
        <CreateMemberBookingModal
          tenantId={tenantId}
          memberId={memberId}
          onClose={() => setShowCreateBooking(false)}
          onCreated={() => { setShowCreateBooking(false); loadHistory(); }}
          guard={guard}
        />
      )}
    </div>
  );
}