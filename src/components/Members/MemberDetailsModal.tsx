// src/components/MemberDetailsModal.tsx
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';

type MemberDetailsModalProps = {
  member: {
    id: string;
    full_name: string | null;
    phone: string | null;
    created_at: string;
    email: string | null;
    birth_date?: string | null;
    address?: string | null;
    afm?: string | null;
    max_dropin_debt?: number | null;
  };
  tenantId: string;
  onClose: () => void;
  subscriptionInactive?: boolean;
  onSubscriptionBlocked?: () => void;
};

type HistoryRow = {
  id: string;
  status: string | null;
  created_at: string;
  session_start: string | null;
  session_end: string | null;
  class_title: string | null;
};

type EconomicSummary = {
  membershipDebt: number;
  dropinDebt: number;
  membershipTotal: number;
  dropinTotal: number;
  combinedTotal: number;
};

type MembershipDebtRow = {
  id: string;
  debt: number;
  planPrice: number | null;
  customPrice: number | null;
};


type DropinDebtRow = {
  id: string;
  price: number;
  sessionTitle: string | null;
  sessionDate: string | null;
};

function calculateAge(birthDateStr?: string | null): number | null {
  if (!birthDateStr) return null;
  const birthDate = new Date(birthDateStr);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }
  return age >= 0 ? age : null;
}


export default function MemberDetailsModal({
  member,
  tenantId,
  onClose,
  subscriptionInactive,
  onSubscriptionBlocked,
}: MemberDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'economic'>('details');

  // History state
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [historyFrom, setHistoryFrom] = useState<string>('');  // yyyy-mm-dd
  const [historyTo, setHistoryTo] = useState<string>('');      // yyyy-mm-dd
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);

  // Economic state
  const [economicSummary, setEconomicSummary] = useState<EconomicSummary | null>(null);
  const [loadingEconomic, setLoadingEconomic] = useState(false);
  const [economicError, setEconomicError] = useState<string | null>(null);
  const [economicRefreshKey, setEconomicRefreshKey] = useState(0);

  // Debt modals state
  const [showMembershipDebtModal, setShowMembershipDebtModal] = useState(false);
  const [showDropinDebtModal, setShowDropinDebtModal] = useState(false);


  useEffect(() => {
    setHistoryPage(1);
  }, [historyFrom, historyTo, historyPageSize]);


  const guard = () => {
    if (subscriptionInactive) {
      onSubscriptionBlocked?.();
      return false;
    }
    return true;
  };



  const filteredHistoryRows = useMemo(() => {
    if (!historyFrom && !historyTo) return historyRows;

    const fromDate = historyFrom
      ? new Date(historyFrom + 'T00:00:00')
      : null;
    const toDate = historyTo
      ? new Date(historyTo + 'T23:59:59')
      : null;

    return historyRows.filter((r) => {
      // Φιλτράρουμε με βάση τη session_start αν υπάρχει, αλλιώς created_at
      const baseIso = r.session_start ?? r.created_at;
      if (!baseIso) return false;
      const d = new Date(baseIso);
      if (Number.isNaN(d.getTime())) return false;

      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [historyRows, historyFrom, historyTo]);




  // Load history when history tab opens
  useEffect(() => {
    if (activeTab !== 'history') return;

    const loadHistory = async () => {
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
        `
        )
        .eq('tenant_id', tenantId)
        .eq('user_id', member.id)
        .order('created_at', { ascending: false });

      if (error) {
        setHistoryError(error.message);
        setHistoryRows([]);
      } else {
        const mapped: HistoryRow[] = (data as any[] ?? []).map((b) => ({
          id: b.id,
          status: b.status,
          created_at: b.created_at,
          session_start: b.class_sessions?.starts_at ?? null,
          session_end: b.class_sessions?.ends_at ?? null,
          class_title: b.class_sessions?.classes?.title ?? null,
        }));
        setHistoryRows(mapped);
      }

      setLoadingHistory(false);
    };

    loadHistory();
  }, [activeTab, tenantId, member.id]);

  // Load economic summary when economic tab opens or refresh key changes
  useEffect(() => {
    if (activeTab !== 'economic') return;

    const loadEconomic = async () => {
      setLoadingEconomic(true);
      setEconomicError(null);

      // 1) Memberships: user_id + debt + membership_plans.price
      const { data: memberships, error: membErr } = await supabase
        .from('memberships')
        .select('debt, plan_price, custom_price')
        .eq('tenant_id', tenantId)
        .eq('user_id', member.id);


      if (membErr) {
        setEconomicError(membErr.message);
        setLoadingEconomic(false);
        return;
      }

      // 2) Bookings: user_id + drop_in_price + booking_type + drop_in_paid
      const { data: bookings, error: bookErr } = await supabase
        .from('bookings')
        .select('drop_in_price, booking_type, drop_in_paid')
        .eq('tenant_id', tenantId)
        .eq('user_id', member.id);

      if (bookErr) {
        setEconomicError(bookErr.message);
        setLoadingEconomic(false);
        return;
      }

      const summary = calculateEconomicSummary(
        (memberships as any[]) ?? [],
        (bookings as any[]) ?? [],
      );

      setEconomicSummary(summary);
      setLoadingEconomic(false);
    };

    loadEconomic();
  }, [activeTab, tenantId, member.id, economicRefreshKey]);

  const calculateEconomicSummary = (
    memberships: any[],
    bookings: any[],
  ): EconomicSummary => {
    let membershipDebt = 0;
    let membershipTotal = 0;

    // Membership debt = sum(memberships.debt)
    // Membership total = sum(membership_plans.price)
    for (const m of memberships) {
      const debtVal = Number(m.debt ?? 0);

      // prefer custom_price (με έκπτωση), αλλιώς snapshot plan_price
      const effectivePrice = m.custom_price ?? m.plan_price ?? 0;
      const priceVal = Number(effectivePrice);

      if (Number.isFinite(debtVal)) {
        membershipDebt += debtVal;
      }
      if (Number.isFinite(priceVal)) {
        membershipTotal += priceVal;
      }
    }

    let dropinDebt = 0;
    let dropinTotal = 0;

    // Drop-in debt = sum(drop_in_price where drop_in_paid = false)
    // Drop-in total = sum(drop_in_price for all drop_in bookings)
    for (const b of bookings) {
      if (b.booking_type !== 'drop_in') continue;

      const priceVal = Number(b.drop_in_price ?? 0);
      if (!Number.isFinite(priceVal)) continue;

      // total cost regardless of paid
      dropinTotal += priceVal;

      // unpaid portion → debt
      if (b.drop_in_paid === false) {
        dropinDebt += priceVal;
      }
    }

    const combinedTotal = membershipTotal + dropinTotal;

    return {
      membershipDebt,
      dropinDebt,
      membershipTotal,
      dropinTotal,
      combinedTotal,
    };
  };

  const formatDateTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('el-GR') : '—';

  const formatMoney = (value: number) => `${value.toFixed(2)} €`;

  const age = calculateAge(member.birth_date);

  const triggerEconomicRefresh = () =>
    setEconomicRefreshKey((key) => key + 1);


  // ✅ Calendar state for history tab
  const [historyMonthCursor, setHistoryMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [historySelectedDay, setHistorySelectedDay] = useState<string>(() => {
    // default selected day: today (yyyy-mm-dd)
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
  });

  // --- helpers ---
  function toYMD(d: Date) {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
  }
  function parseYMD(ymd: string) {
    // ymd: yyyy-mm-dd (local)
    const [y, m, day] = ymd.split('-').map(Number);
    return new Date(y, m - 1, day);
  }
  function addMonths(d: Date, delta: number) {
    return new Date(d.getFullYear(), d.getMonth() + delta, 1);
  }
  function isSameMonth(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  }
  function fmtMonthEL(d: Date) {
    return d.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' });
  }
  function fmtDayEL(ymd: string) {
    const d = parseYMD(ymd);
    return d.toLocaleDateString('el-GR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  type BookingStatus = 'booked' | 'checked_in' | 'canceled' | 'no_show';
  const STATUS_LABEL: Record<BookingStatus, string> = {
    booked: 'Κράτηση',
    checked_in: 'Checked in',
    canceled: 'Ακυρώθηκε',
    no_show: 'Απουσία',
  };



  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-xl border border-border/10 bg-secondary-background text-text-primary shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">
              Μέλος: {member.full_name ?? '—'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-text-secondary hover:bg-border/5"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-border/10 px-6">
          <nav className="flex space-x-4 text-sm">
            <button
              onClick={() => setActiveTab('details')}
              className={`px-3 py-2 font-medium ${activeTab === 'details'
                ? 'border-b-2 border-accent text-accent'
                : 'text-text-secondary hover:text-text-primary'
                }`}
            >
              Στοιχεία
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-2 font-medium ${activeTab === 'history'
                ? 'border-b-2 border-accent text-accent'
                : 'text-text-secondary hover:text-text-primary'
                }`}
            >
              Ιστορικό
            </button>
            <button
              onClick={() => setActiveTab('economic')}
              className={`px-3 py-2 font-medium ${activeTab === 'economic'
                ? 'border-b-2 border-accent text-accent'
                : 'text-text-secondary hover:text-text-primary'
                }`}
            >
              Οφειλές & Οικονομικά
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
          {/* DETAILS TAB */}
          {activeTab === 'details' && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <DetailField label="Ονοματεπώνυμο" value={member.full_name} />
              <DetailField label="Τηλέφωνο" value={member.phone} />
              <DetailField label="Email" value={member.email ?? null} />
              <DetailField
                label="Ηλικία"
                value={age != null ? age.toString() : null}
              />
              <DetailField
                label="Ημ. γέννησης"
                value={
                  member.birth_date
                    ? new Date(member.birth_date).toLocaleDateString('el-GR')
                    : null
                }
              />
              <DetailField label="Διεύθυνση" value={member.address ?? null} />
              <DetailField label="ΑΦΜ" value={member.afm ?? null} />
              <DetailField
                label="Μέγιστο χρέος drop-in"
                value={
                  member.max_dropin_debt != null
                    ? member.max_dropin_debt.toString() + '€'
                    : null
                }
              />
              <DetailField
                label="Ημερομηνία εγγραφής"
                value={formatDateTime(member.created_at)}
              />
            </div>
          )}


          {/* HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {historyError && (
                <div className="mb-3 text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">
                  {historyError}
                </div>
              )}

              {/* Filters (keep) */}
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between text-sm">

                {/* Removed page size / pagination because calendar */}
                <div className="text-xs text-text-secondary">
                  Επιλέξτε Ημερομηνία για να δείτε τις συνεδρίες.
                </div>
              </div>

              {loadingHistory && (
                <div className="rounded-md border border-white/10 bg-black/10 p-4 text-sm opacity-70">
                  Loading…
                </div>
              )}

              {!loadingHistory && filteredHistoryRows.length === 0 && (
                <div className="rounded-md border border-white/10 bg-black/10 p-4 text-sm opacity-70">
                  Δεν υπάρχουν κρατήσεις
                </div>
              )}

              {!loadingHistory && filteredHistoryRows.length > 0 && (() => {
                // Group rows by day (yyyy-mm-dd) using session_start if present, else created_at
                const byDay = new Map<string, typeof filteredHistoryRows>();

                for (const r of filteredHistoryRows) {
                  const base = r.session_start ?? r.created_at;
                  const d = new Date(base);
                  const key = toYMD(d);
                  const arr = byDay.get(key) ?? [];
                  arr.push(r);
                  byDay.set(key, arr);
                }

                // Ensure selected day exists; if not, select first day that has data in current month,
                // else keep selection
                const selectedHasData = byDay.has(historySelectedDay);
                const monthDaysWithData = Array.from(byDay.keys())
                  .map(parseYMD)
                  .filter((d) => isSameMonth(d, historyMonthCursor))
                  .map(toYMD)
                  .sort();

                const effectiveSelected =
                  selectedHasData
                    ? historySelectedDay
                    : (monthDaysWithData[0] ?? historySelectedDay);

                // Build calendar grid (6 weeks)
                const firstOfMonth = new Date(historyMonthCursor.getFullYear(), historyMonthCursor.getMonth(), 1);
                const start = new Date(firstOfMonth);
                // Monday as start of week (el-GR vibe)
                const day = start.getDay(); // 0 Sun ... 6 Sat
                const mondayIndex = (day + 6) % 7; // convert so Monday=0
                start.setDate(start.getDate() - mondayIndex);

                const cells: Date[] = [];
                for (let i = 0; i < 42; i++) {
                  const d = new Date(start);
                  d.setDate(start.getDate() + i);
                  cells.push(d);
                }

                // status counts for a day
                function getCounts(dayKey: string) {
                  const rows = byDay.get(dayKey) ?? [];
                  const counts: Record<BookingStatus, number> = {
                    booked: 0,
                    checked_in: 0,
                    canceled: 0,
                    no_show: 0,
                  };
                  for (const rr of rows) {
                    const s = ((rr.status ?? 'booked') as BookingStatus);
                    if (counts[s] !== undefined) counts[s] += 1;
                  }
                  return { rows, counts };
                }

                const { rows: selectedRows } = getCounts(effectiveSelected);

                const STATUS_BADGE_CLASS: Record<BookingStatus, string> = {
                  booked:
                    'border-primary bg-primary/10 text-primary',
                  checked_in:
                    'border-success/40 bg-success/10 text-success',
                  no_show:
                    'border-warning/40 bg-warning/10 text-warning',
                  canceled:
                    'border-danger/40 bg-danger/10 text-danger',
                }


                return (
                  <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
                    {/* Calendar */}
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

                      {/* Weekday header */}
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

                      {/* Day cells */}
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
                                  <div className="text-[11px] text-text-secondary">
                                    {total}
                                  </div>
                                )}
                              </div>

                              {/* tiny status dots (no colors required; use opacity differences) */}
                              {total > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {counts.booked > 0 && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Booked" />
                                  )}
                                  {counts.checked_in > 0 && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-success" title="Checked in" />
                                  )}
                                  {counts.canceled > 0 && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-danger" title="Canceled" />
                                  )}
                                  {counts.no_show > 0 && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-warning" title="No show" />
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

                    {/* Selected day list */}
                    <div className="rounded-md border border-white/10 overflow-hidden">
                      <div className="px-3 py-2 bg-secondary-background/60">
                        <div className="text-sm font-semibold">
                          {fmtDayEL(effectiveSelected)}
                        </div>
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
                              const status = ((r.status ?? 'booked') as BookingStatus);
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
                                          ? `${start.toLocaleDateString('el-GR')} • ${start.toLocaleTimeString('el-GR', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}`
                                          : '—'}
                                      </div>
                                    </div>

                                    <div className="shrink-0">
                                      <span
                                        className={[
                                          'text-xs px-2 py-1 rounded border capitalize',
                                          STATUS_BADGE_CLASS[status] ??
                                          'border-white/20 bg-black/20 text-text-secondary',
                                        ].join(' ')}
                                      >
                                        {STATUS_LABEL[status] ?? status}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="mt-2 text-[11px] text-text-secondary">
                                    Κράτηση έγινε: {formatDateTime(r.created_at)}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}



          {/* ECONOMIC TAB */}
          {activeTab === 'economic' && (
            <div className="space-y-6">
              {economicError && (
                <div className="mb-3 text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">
                  {economicError}
                </div>
              )}

              {loadingEconomic && !economicError && (
                <p className="text-sm text-text-secondary">
                  Υπολογισμός οικονομικών…
                </p>
              )}

              {!loadingEconomic && !economicError && economicSummary && (
                <>
                  {/* Section 1: Debts */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2 text-text-primary">
                      Οφειλές
                    </h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {/* Membership Debt Card (clickable) */}
                      <button
                        type="button"
                        onClick={() => {
                          if (!guard()) return;
                          setShowMembershipDebtModal(true);
                        }}
                        className="text-left rounded-lg border border-border/10 bg-black/10 p-4 hover:border-primary/60 hover:bg-primary/5 transition cursor-pointer"
                      >
                        <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                          Οφειλή Συνδρομών
                        </div>
                        <div className="mt-2 text-xl font-semibold">
                          {formatMoney(economicSummary.membershipDebt)}
                        </div>
                        <div className="mt-1 text-xs text-text-secondary">
                          Κλικ για προβολή / αλλαγή οφειλής συνδρομών
                        </div>
                      </button>

                      {/* Drop-in Debt Card (clickable) */}
                      <button
                        type="button"
                        onClick={() => {
                          if (!guard()) return;
                          setShowDropinDebtModal(true);
                        }}
                        className="text-left rounded-lg border border-border/10 bg-black/10 p-4 hover:border-primary/60 hover:bg-primary/5 transition cursor-pointer"
                      >
                        <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                          Οφειλή Drop-in
                        </div>
                        <div className="mt-2 text-xl font-semibold">
                          {formatMoney(economicSummary.dropinDebt)}
                        </div>
                        <div className="mt-1 text-xs text-text-secondary">
                          Κλικ για προβολή / εξόφληση drop-in
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Section 2: Totals */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2 text-text-primary">
                      Συνολικό Κόστος
                    </h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div className="rounded-lg border border-border/10 bg-black/10 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                          Σύνολο Συνδρομών
                        </div>
                        <div className="mt-2 text-xl font-semibold">
                          {formatMoney(economicSummary.membershipTotal)}
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/10 bg-black/10 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                          Σύνολο Drop-in
                        </div>
                        <div className="mt-2 text-xl font-semibold">
                          {formatMoney(economicSummary.dropinTotal)}
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/10 bg-black/10 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                          Σύνολο (Όλα)
                        </div>
                        <div className="mt-2 text-xl font-semibold">
                          {formatMoney(economicSummary.combinedTotal)}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {!loadingEconomic && !economicError && !economicSummary && (
                <p className="text-sm text-text-secondary">
                  Δεν βρέθηκαν οικονομικά στοιχεία για αυτό το μέλος.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-border/10 px-6 py-3">
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            Κλείσιμο
          </button>
        </div>
      </div>

      {/* Membership Debt Modal */}
      {showMembershipDebtModal && (
        <MembershipDebtModal
          tenantId={tenantId}
          memberId={member.id}
          onClose={() => setShowMembershipDebtModal(false)}
          onUpdated={triggerEconomicRefresh}
          guard={guard}
        />
      )}

      {/* Drop-in Debt Modal */}
      {showDropinDebtModal && (
        <DropinDebtModal
          tenantId={tenantId}
          memberId={member.id}
          onClose={() => setShowDropinDebtModal(false)}
          onUpdated={triggerEconomicRefresh}
          guard={guard}
        />
      )}
    </div>
  );
}

/* ---------- EXTRA MODALS ---------- */

function MembershipDebtModal({
  tenantId,
  memberId,
  onClose,
  onUpdated,
  guard,
}: {
  tenantId: string;
  memberId: string;
  onClose: () => void;
  onUpdated: () => void;
  guard?: () => boolean;
}) {
  const [rows, setRows] = useState<MembershipDebtRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('memberships')
        .select('id, debt, plan_price, custom_price')
        .eq('tenant_id', tenantId)
        .eq('user_id', memberId)
        .gt('debt', 0);

      if (error) {
        setError(error.message);
        setRows([]);
      } else {
        const mapped: MembershipDebtRow[] = (data as any[] ?? []).map((m) => ({
          id: m.id,
          debt: Number(m.debt ?? 0),
          planPrice: m.plan_price ?? null,
          customPrice: m.custom_price ?? null,
        }));

        setRows(mapped);
      }

      setLoading(false);
    })();
  }, [tenantId, memberId]);


  const onChangeDebt = (id: string, newValue: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, debt: Number.isNaN(Number(newValue)) ? r.debt : Number(newValue) }
          : r
      )
    );
  };

  const onSave = async () => {
    if (guard && !guard()) return;
    setSaving(true);
    setError(null);

    try {
      for (const r of rows) {
        await supabase
          .from('memberships')
          .update({ debt: r.debt })
          .eq('id', r.id);
      }
      onUpdated();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Σφάλμα κατά την αποθήκευση');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-lg border border-border/10 bg-secondary-background text-text-primary shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/10 px-4 py-3">
          <h3 className="text-sm font-semibold">Οφειλή Συνδρομών</h3>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-text-secondary hover:bg-border/5"
          >
            ✕
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto text-sm">
          {error && (
            <div className="mb-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-danger text-xs">
              {error}
            </div>
          )}

          {loading && <div>Φόρτωση…</div>}

          {!loading && rows.length === 0 && (
            <div className="text-text-secondary text-sm">
              Δεν υπάρχουν συνδρομές με οφειλή.
            </div>
          )}

          {!loading && rows.length > 0 && (
            <div className="space-y-3">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="rounded border border-border/10  p-3"
                >
                  <div className="text-xs text-text-secondary mb-1">
                    Συνδρομή μέλους
                  </div>
                  {r.planPrice != null && (
                    <div className="text-xs text-text-secondary mb-1">
                      Βασική τιμή πλάνου: {r.planPrice.toFixed(2)} €
                    </div>
                  )}
                  {r.customPrice != null && (
                    <div className="text-xs text-text-secondary mb-1">
                      Τιμή μέλους (με έκπτωση): {r.customPrice.toFixed(2)} €
                    </div>
                  )}

                  <label className="block text-xs mb-1">
                    Οφειλή (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full rounded border border-border/20 bg-black/10 px-2 py-1 text-sm"
                    value={r.debt}
                    onChange={(e) => onChangeDebt(r.id, e.target.value)}
                  />
                </div>
              ))}

            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3 text-sm">
          <button className="btn-secondary" onClick={onClose}>
            Ακύρωση
          </button>
          <button
            className="btn-primary"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DropinDebtModal({
  tenantId,
  memberId,
  onClose,
  onUpdated,
  guard,
}: {
  tenantId: string;
  memberId: string;
  onClose: () => void;
  onUpdated: () => void;
  guard?: () => boolean;
}) {
  const [rows, setRows] = useState<(DropinDebtRow & { markPaid: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('bookings')
        .select(
          `
          id,
          drop_in_price,
          drop_in_paid,
          class_sessions(
            starts_at,
            classes(title)
          )
        `
        )
        .eq('tenant_id', tenantId)
        .eq('user_id', memberId)
        .eq('booking_type', 'drop_in')
        .eq('drop_in_paid', false);

      if (error) {
        setError(error.message);
        setRows([]);
      } else {
        const mapped: (DropinDebtRow & { markPaid: boolean })[] =
          (data as any[] ?? []).map((b) => ({
            id: b.id,
            price: Number(b.drop_in_price ?? 0),
            sessionTitle: b.class_sessions?.classes?.title ?? null,
            sessionDate: b.class_sessions?.starts_at
              ? new Date(b.class_sessions.starts_at).toLocaleString('el-GR')
              : null,
            markPaid: true, // default: mark all as paid
          }));
        setRows(mapped);
      }

      setLoading(false);
    })();
  }, [tenantId, memberId]);

  const toggleMarkPaid = (id: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, markPaid: !r.markPaid } : r
      )
    );
  };

  const onSave = async () => {
    if (guard && !guard()) return;
    setSaving(true);
    setError(null);
    try {
      const toPay = rows.filter((r) => r.markPaid);
      for (const r of toPay) {
        await supabase
          .from('bookings')
          .update({ drop_in_paid: true })
          .eq('id', r.id);
      }
      onUpdated();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Σφάλμα κατά την αποθήκευση');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-lg border border-border/10 bg-secondary-background text-text-primary shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/10 px-4 py-3">
          <h3 className="text-sm font-semibold">Οφειλή Drop-in</h3>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-text-secondary hover:bg-border/5"
          >
            ✕
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto text-sm">
          {error && (
            <div className="mb-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-danger text-xs">
              {error}
            </div>
          )}

          {loading && <div>Φόρτωση…</div>}

          {!loading && rows.length === 0 && (
            <div className="text-text-secondary text-sm">
              Δεν υπάρχουν απλήρωτα drop-in.
            </div>
          )}

          {!loading && rows.length > 0 && (
            <div className="space-y-3">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="rounded border border-border/10 bg-black/5 p-3 flex flex-col gap-1"
                >
                  <div className="text-xs text-text-secondary">
                    {r.sessionTitle ?? 'Drop-in χωρίς τίτλο'}
                  </div>
                  {r.sessionDate && (
                    <div className="text-xs text-text-secondary">
                      Ημ/νία: {r.sessionDate}
                    </div>
                  )}
                  <div className="text-xs text-text-secondary">
                    Ποσό: {r.price.toFixed(2)} €
                  </div>
                  <label className="mt-1 inline-flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/30 bg-transparent"
                      checked={r.markPaid}
                      onChange={() => toggleMarkPaid(r.id)}
                    />
                    <span>Εξόφληση αυτού του drop-in</span>
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3 text-sm">
          <button className="btn-secondary" onClick={onClose}>
            Ακύρωση
          </button>
          <button
            className="btn-primary"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- SMALL HELPERS ---------- */

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </span>
      <span className="text-sm text-text-primary">
        {value && value !== '' ? value : '—'}
      </span>
    </div>
  );
}
