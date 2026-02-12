// src/components/members/details/MemberHistoryCard.tsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { BookingStatus, HistoryRow } from './types';
import {
  addMonths,
  fmtDayEL,
  fmtMonthEL,
  formatDateTimeEL,
  isSameMonth,
  parseYMD,
  toYMD,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from './utils';
import CreateMemberBookingModal from './CreateMemberBookingModal';

export default function MemberHistoryCard({
  tenantId,
  memberId,
  guard,
}: {
  tenantId: string;
  memberId: string;
  guard?: () => boolean;
}) {
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [showCreateBooking, setShowCreateBooking] = useState(false);

  // optional filters kept (not rendered)
  const [historyFrom] = useState<string>('');
  const [historyTo] = useState<string>('');

  const [historyMonthCursor, setHistoryMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [historySelectedDay, setHistorySelectedDay] = useState<string>(() =>
    toYMD(new Date()),
  );

  async function loadHistory() {
    if (!tenantId || !memberId) return;

    setLoadingHistory(true);
    setHistoryError(null);

    const { data, error } = await supabase
      .from('bookings')
      .select(
        `
          id,
          status,
          created_at,
          class_sessions(
            starts_at,
            ends_at,
            classes(title)
          )
        `,
      )
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
      id: b.id,
      status: b.status,
      created_at: b.created_at,
      session_start: b.class_sessions?.starts_at ?? null,
      session_end: b.class_sessions?.ends_at ?? null,
      class_title: b.class_sessions?.classes?.title ?? null,
    }));

    setHistoryRows(mapped);
    setLoadingHistory(false);
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, memberId]);

  const filteredHistoryRows = useMemo(() => {
    if (!historyFrom && !historyTo) return historyRows;

    const fromDate = historyFrom ? new Date(historyFrom + 'T00:00:00') : null;
    const toDate = historyTo ? new Date(historyTo + 'T23:59:59') : null;

    return historyRows.filter((r) => {
      const baseIso = r.session_start ?? r.created_at;
      if (!baseIso) return false;
      const d = new Date(baseIso);
      if (Number.isNaN(d.getTime())) return false;

      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [historyRows, historyFrom, historyTo]);

  const calendarBlock = useMemo(() => {
    if (loadingHistory) {
      return (
        <div className="rounded-md border border-white/10 bg-black/10 p-4 text-sm opacity-70">
          Loading…
        </div>
      );
    }

    if (!loadingHistory && filteredHistoryRows.length === 0) {
      return (
        <div className="rounded-md border border-white/10 bg-black/10 p-4 text-sm opacity-70">
          Δεν υπάρχουν κρατήσεις
        </div>
      );
    }

    const byDay = new Map<string, typeof filteredHistoryRows>();
    for (const r of filteredHistoryRows) {
      const base = r.session_start ?? r.created_at;
      const d = new Date(base);
      const key = toYMD(d);
      const arr = byDay.get(key) ?? [];
      arr.push(r);
      byDay.set(key, arr);
    }

    const selectedHasData = byDay.has(historySelectedDay);
    const monthDaysWithData = Array.from(byDay.keys())
      .map(parseYMD)
      .filter((d) => isSameMonth(d, historyMonthCursor))
      .map(toYMD)
      .sort();

    const effectiveSelected = selectedHasData
      ? historySelectedDay
      : monthDaysWithData[0] ?? historySelectedDay;

    const firstOfMonth = new Date(
      historyMonthCursor.getFullYear(),
      historyMonthCursor.getMonth(),
      1,
    );
    const start = new Date(firstOfMonth);
    const day = start.getDay();
    const mondayIndex = (day + 6) % 7;
    start.setDate(start.getDate() - mondayIndex);

    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const dd = new Date(start);
      dd.setDate(start.getDate() + i);
      cells.push(dd);
    }

    function getCounts(dayKey: string) {
      const rows = byDay.get(dayKey) ?? [];
      const counts: Record<BookingStatus, number> = {
        booked: 0,
        checked_in: 0,
        canceled: 0,
        no_show: 0,
      };
      for (const rr of rows) {
        const s = (rr.status ?? 'booked') as BookingStatus;
        if (counts[s] !== undefined) counts[s] += 1;
      }
      return { rows, counts };
    }

    const { rows: selectedRows } = getCounts(effectiveSelected);

    return (
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <div className="rounded-md border border-white/10 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-secondary-background/60">
            <button
              className="px-2 py-1 rounded border border-white/20 hover:bg-white/5"
              onClick={() => setHistoryMonthCursor((m) => addMonths(m, -1))}
              type="button"
            >
              ‹
            </button>

            <div className="text-sm font-semibold capitalize">
              {fmtMonthEL(historyMonthCursor)}
            </div>

            <button
              className="px-2 py-1 rounded border border-white/20 hover:bg-white/5"
              onClick={() => setHistoryMonthCursor((m) => addMonths(m, +1))}
              type="button"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-px bg-white/10">
            {['Δ', 'Τ', 'Τ', 'Π', 'Π', 'Σ', 'Κ'].map((w, idx) => (
              <div
                key={idx}
                className="bg-black/10 px-2 py-1 text-[11px] text-text-secondary text-center"
              >
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px bg-border/10">
            {cells.map((d) => {
              const key = toYMD(d);
              const inMonth = isSameMonth(d, historyMonthCursor);
              const isSelected = key === effectiveSelected;
              const { counts } = getCounts(key);
              const total =
                counts.booked + counts.checked_in + counts.canceled + counts.no_show;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setHistorySelectedDay(key)}
                  className={[
                    'min-h-13.5 bg-black/10 px-2 py-1 text-left hover:bg-border/5',
                    !inMonth ? 'opacity-40' : '',
                    isSelected ? 'ring-2 ring-primary/60' : '',
                  ].join(' ')}
                  title={key}
                >
                  <div className="flex items-start justify-between">
                    <div className="text-xs">{d.getDate()}</div>
                    {total > 0 && (
                      <div className="text-[11px] text-text-secondary">{total}</div>
                    )}
                  </div>

                  {total > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {counts.booked > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                      {counts.checked_in > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      )}
                      {counts.canceled > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-danger" />
                      )}
                      {counts.no_show > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="px-3 py-2 text-[11px] text-text-secondary border-t border-white/10">
            Dots: Κρατήθηκε / Checked in / Ακυρώθηκε / Απουσία
          </div>
        </div>

        <div className="rounded-md border border-white/10 overflow-hidden min-w-9">
          <div className="px-3 py-2 bg-secondary-background/60">
            <div className="text-sm font-semibold">{fmtDayEL(effectiveSelected)}</div>
            <div className="text-xs text-text-secondary">
              {selectedRows.length} Συνεδρία(ες)
            </div>
          </div>

          {selectedRows.length === 0 ? (
            <div className="p-4 text-sm opacity-70">Καμία Συνεδρία.</div>
          ) : (
            <div className="divide-y divide-border/10">
              {selectedRows
                .slice()
                .sort((a, b) => {
                  const aa = new Date(a.session_start ?? a.created_at).getTime();
                  const bb = new Date(b.session_start ?? b.created_at).getTime();
                  return aa - bb;
                })
                .map((r) => {
                  const status = (r.status ?? 'booked') as BookingStatus;
                  const start = r.session_start ? new Date(r.session_start) : null;

                  return (
                    <div key={r.id} className="p-3 hover:bg-secondary/10">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">
                            {r.class_title ?? '—'}
                          </div>
                          <div className="text-xs text-text-secondary">
                            {start
                              ? `${start.toLocaleDateString('el-GR')} • ${start.toLocaleTimeString(
                                  'el-GR',
                                  { hour: '2-digit', minute: '2-digit' },
                                )}`
                              : '—'}
                          </div>
                        </div>

                        <div className="shrink-0">
                          <span
                            className={[
                              'text-xs px-2 py-1 rounded border capitalize',
                              STATUS_BADGE_CLASS[status],
                            ].join(' ')}
                          >
                            {STATUS_LABEL[status] ?? status}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 text-[11px] text-text-secondary">
                        Κράτηση έγινε: {formatDateTimeEL(r.created_at)}
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
    <div className="rounded-xl border border-border/10 bg-secondary-background text-text-primary shadow 3xl:col-span-1 2xl:col-span-2 xl:col-span-2 md:col-span-2">
      <div className="border-b border-border/10 px-6 py-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Ιστορικό</h2>
          <div className="text-xs text-text-secondary mt-0.5">
            Επιλέξτε ημερομηνία για να δείτε τις συνεδρίες.
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (guard && !guard()) return;
            setShowCreateBooking(true);
          }}
          className="shrink-0 px-3 py-1.5 rounded-md text-xs bg-primary text-white hover:bg-primary/90"
        >
          Νέα Κράτηση
        </button>
      </div>

      <div className="p-6 space-y-4">
        {historyError && (
          <div className="text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">
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
          onCreated={() => {
            setShowCreateBooking(false);
            loadHistory(); // ✅ real refresh
          }}
          guard={guard}
        />
      )}
    </div>
  );
}
