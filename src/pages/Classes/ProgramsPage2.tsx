// src/pages/ProgramsPage.tsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type FormEvent,
  type ChangeEvent,
} from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

// type-only imports
import type { DateClickArg, EventResizeDoneArg } from '@fullcalendar/interaction';
import type { EventClickArg, EventDropArg, DatesSetArg } from '@fullcalendar/core';
import elLocale from '@fullcalendar/core/locales/el';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import SessionModal from '../../components/Programs/SessionModal';
import ProgramGeneratorModal from '../../components/Programs/ProgramGeneratorModal';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';

export type SessionRowFromDb = {
  id: string;
  tenant_id: string;
  class_id: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  classes?: { title: string }[] | null;
  cancel_before_hours: number | null;
};

export type SessionRow = {
  id: string;
  tenant_id: string;
  class_id: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  classes?: { title: string } | null;
  cancel_before_hours: number | null;
};

type CalendarView = 'month' | 'week' | 'day';

export default function ProgramsPage() {
  const { profile, subscription } = useAuth();
  const tenantId = profile?.tenant_id;

  const [showSubModal, setShowSubModal] = useState(false);

  const [view, setView] = useState<CalendarView>('month');
  const [currentRange, setCurrentRange] = useState<{ start: string; end: string } | null>(null);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionRow | null>(null);
  const [defaultDate, setDefaultDate] = useState<Date | null>(null);

  const [programModalOpen, setProgramModalOpen] = useState(false);

  // delete-program modal open state
  const [deleteProgramModalOpen, setDeleteProgramModalOpen] = useState(false);

  const calendarRef = useRef<any>(null);

  // track mobile vs desktop to tweak header & layout
  const [isMobile, setIsMobile] = useState(false);


  const subscriptionInactive = !subscription?.is_active;

  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) {
      setShowSubModal(true);
      return;
    }
    action();
  }


  useEffect(() => {
    const updateIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    updateIsMobile();
    window.addEventListener('resize', updateIsMobile);
    return () => window.removeEventListener('resize', updateIsMobile);
  }, []);

  // ----- Load sessions for current range -----
  useEffect(() => {
    if (!tenantId || !currentRange) return;

    const fetchSessions = async () => {
      setLoading(true);
      const { start, end } = currentRange;

      const { data, error } = await supabase
        .from('class_sessions')
        .select(
          `
          id,
          tenant_id,
          class_id,
          starts_at,
          ends_at,
          capacity,
          cancel_before_hours,
          classes:classes(title)
        `,
        )
        .eq('tenant_id', tenantId)
        .gte('starts_at', start)
        .lte('starts_at', end)
        .order('starts_at', { ascending: true });

      if (error) {
        console.error('Error loading sessions', error);
      } else if (data) {
        const normalized: SessionRow[] = (data as SessionRowFromDb[]).map((row) => ({
          ...row,
          classes: Array.isArray(row.classes)
            ? row.classes[0] ?? null
            : ((row.classes as any) ?? null),
        }));
        setSessions(normalized);
      }
      setLoading(false);
    };

    fetchSessions();
  }, [tenantId, currentRange]);

  // map sessions -> events
  const events = useMemo(
    () =>
      sessions.map((s) => ({
        id: s.id,
        title: s.classes?.title ?? 'Μάθημα',
        start: s.starts_at,
        end: s.ends_at ?? undefined,
        extendedProps: { session: s },
      })),
    [sessions],
  );

  const handleDatesSet = (arg: DatesSetArg) => {
    setCurrentRange({
      start: arg.start.toISOString(),
      end: arg.end.toISOString(),
    });
  };

  const handleDateClick = (arg: DateClickArg) => {
    setEditingSession(null);
    setDefaultDate(arg.date);
    setSessionModalOpen(true);
  };

  const handleEventClick = (arg: EventClickArg) => {
    const s = arg.event.extendedProps.session as SessionRow;
    setEditingSession(s);
    setDefaultDate(null);
    setSessionModalOpen(true);
  };

  const handleEventDrop = async (info: EventDropArg) => {
    const id = info.event.id;
    const start = info.event.start;
    const end = info.event.end;
    if (!start) return;

    const newStart = start.toISOString();
    const newEnd = end ? end.toISOString() : null;

    const { error } = await supabase
      .from('class_sessions')
      .update({ starts_at: newStart, ends_at: newEnd })
      .eq('id', id);

    if (error) {
      console.error('Failed to move session', error);
      info.revert();
    } else {
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, starts_at: newStart, ends_at: newEnd } : s)),
      );
    }
  };

  const handleEventResize = async (info: EventResizeDoneArg) => {
    const id = info.event.id;
    const start = info.event.start;
    const end = info.event.end;
    if (!start || !end) return;

    const newStart = start.toISOString();
    const newEnd = end.toISOString();

    const { error } = await supabase
      .from('class_sessions')
      .update({ starts_at: newStart, ends_at: newEnd })
      .eq('id', id);

    if (error) {
      console.error('Failed to resize session', error);
      info.revert();
    } else {
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, starts_at: newStart, ends_at: newEnd } : s)),
      );
    }
  };

  const handleSessionSaved = (newOrUpdated: SessionRow) => {
    setSessions((prev) => {
      const exists = prev.find((s) => s.id === newOrUpdated.id);
      if (exists) {
        return prev.map((s) => (s.id === newOrUpdated.id ? newOrUpdated : s));
      }
      return [...prev, newOrUpdated];
    });
  };

  const handleProgramGenerated = () => {
    // force refetch by nudging currentRange
    setCurrentRange((r) => (r ? { ...r } : r));
  };

  const handleSessionDeleted = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  // sync custom view buttons with FullCalendar
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;

    if (view === 'month' && api.view.type !== 'dayGridMonth') api.changeView('dayGridMonth');
    if (view === 'week' && api.view.type !== 'timeGridWeek') api.changeView('timeGridWeek');
    if (view === 'day' && api.view.type !== 'timeGridDay') api.changeView('timeGridDay');
  }, [view]);

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      {/* Top Bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl md:text-2xl font-semibold text-text-primary">Προγράμματα</h1>
          <span className="text-xs md:text-sm text-text-secondary">
            Διαχείριση όλων των μαθημάτων με drag &amp; drop
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {/* View Toggles */}
          <div className="inline-flex rounded-md border border-white/10 overflow-hidden">
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1 text-xs md:text-sm ${view === 'month'
                ? 'bg-primary text-white'
                : 'bg-secondary-background text-text-secondary'
                }`}
            >
              Μήνας
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1 text-xs md:text-sm ${view === 'week'
                ? 'bg-primary text-white'
                : 'bg-secondary-background text-text-secondary'
                }`}
            >
              Εβδομάδα
            </button>
            <button
              onClick={() => setView('day')}
              className={`px-3 py-1 text-xs md:text-sm ${view === 'day'
                ? 'bg-primary text-white'
                : 'bg-secondary-background text-text-secondary'
                }`}
            >
              Ημέρα
            </button>
          </div>

          {/* Create Program button */}
          <button
            onClick={() => requireActiveSubscription(() => setProgramModalOpen(true))}
            className="w-full xs:w-auto md:w-auto md:ml-3 inline-flex items-center justify-center gap-2 rounded-md bg-accent px-3 md:px-4 py-2 text-xs md:text-sm font-medium text-black hover:bg-accent/80 cursor-pointer"
          >
            + Δημιουργία Προγράμματος
          </button>

          {/* Delete Program button */}
          <button
            onClick={() => requireActiveSubscription(() => setDeleteProgramModalOpen(true))}
            className="w-full xs:w-auto md:w-auto inline-flex items-center justify-center gap-2 rounded-md bg-red-500/90 px-3 md:px-4 py-2 text-xs md:text-sm font-medium text-white hover:bg-red-600 cursor-pointer"
          >
            Διαγραφή Προγράμματος
          </button>
        </div>
      </div>

      {/* Calendar Card */}
      <div className="gym-calendar bg-secondary-background rounded-xl shadow-sm border border-white/10 p-3 md:p-4 text-text-primary">
        {loading && (
          <div className="mb-2 text-xs md:text-sm text-text-secondary">
            Φόρτωση συνεδριών για το επιλεγμένο διάστημα…
          </div>
        )}

        {/* Wrapper with horizontal scroll on small screens */}
        <div className="-mx-2 md:mx-0 overflow-x-auto">
          <div className="min-w-180 md:min-w-full px-2 md:px-0">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              locale={elLocale}
              headerToolbar={
                isMobile
                  ? {
                    left: 'prev,next',
                    center: 'title',
                    right: 'today',
                  }
                  : {
                    left: 'today prev,next',
                    center: 'title',
                    right: '',
                  }
              }
              buttonText={{
                today: 'Σήμερα',
              }}
              height="auto"
              allDaySlot={false}
              editable
              selectable
              droppable={false}
              eventResizableFromStart
              events={events}
              dateClick={() => requireActiveSubscription(() => handleDateClick)}
              eventClick={() => requireActiveSubscription(() =>handleEventClick)}
              eventDrop={() => requireActiveSubscription(() =>handleEventDrop)}
              eventResize={() => requireActiveSubscription(() =>handleEventResize)}
              datesSet={handleDatesSet}
              viewDidMount={(arg) => {
                if (arg.view.type === 'dayGridMonth' && view !== 'month') setView('month');
                if (arg.view.type === 'timeGridWeek' && view !== 'week') setView('week');
                if (arg.view.type === 'timeGridDay' && view !== 'day') setView('day');
              }}
              dayHeaderFormat={{ weekday: 'short' }}
              slotLabelFormat={{
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }}
              eventTimeFormat={{
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }}
              dayHeaderClassNames={() => [
                'text-[11px]',
                'uppercase',
                'text-secondary-background',
                'bg-secondary-background/30',
              ]}
              dayCellClassNames={() => [
                'bg-secondary-background/60',
                'border',
                'border-white/10',
                'align-top',
              ]}
              eventClassNames={() => [
                'bg-primary/80',
                'border-none',
                'text-[11px]',
                'leading-tight',
                'rounded-md',
                'px-1',
                'h-11',
                'py-[2px]',
                'cursor-pointer',
                'hover:bg-primary',
              ]}
              moreLinkClassNames={() => [
                'text-[11px]',
                'text-text-secondary',
                'hover:text-text-primary',
              ]}
            />
          </div>
        </div>
      </div>

      {/* MODALS */}
      <SessionModal
        open={sessionModalOpen}
        onClose={() => setSessionModalOpen(false)}
        defaultDate={defaultDate}
        session={editingSession}
        onSaved={handleSessionSaved}
        onDeleted={handleSessionDeleted}
      />

      <ProgramGeneratorModal
        open={programModalOpen}
        onClose={() => setProgramModalOpen(false)}
        onGenerated={handleProgramGenerated}
      />

      {/* Delete Program Modal */}
      <ProgramDeleteModal
        open={deleteProgramModalOpen}
        onClose={() => setDeleteProgramModalOpen(false)}
        tenantId={tenantId ?? null}
        onDeleted={() => {
          // force calendar to refetch sessions
          setCurrentRange((r) => (r ? { ...r } : r));
        }}
      />

      <SubscriptionRequiredModal
        open={showSubModal}
        onClose={() => setShowSubModal(false)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ProgramDeleteModal – delete by date range + class + day + time      */
/* ------------------------------------------------------------------ */

type ProgramDeleteModalProps = {
  open: boolean;
  onClose: () => void;
  tenantId: string | null;
  onDeleted: () => void;
};

type SimpleClassRow = {
  id: string;
  title: string;
};

type SessionIdRow = {
  id: string;
  starts_at: string;
};

// Day options: Date.getDay() => 0=Κυρ, 1=Δευ, ... 6=Σαβ
const DAY_OPTIONS = [
  { value: 1, short: 'Δευ', full: 'Δευτέρα' },
  { value: 2, short: 'Τρι', full: 'Τρίτη' },
  { value: 3, short: 'Τετ', full: 'Τετάρτη' },
  { value: 4, short: 'Πεμ', full: 'Πέμπτη' },
  { value: 5, short: 'Παρ', full: 'Παρασκευή' },
  { value: 6, short: 'Σαβ', full: 'Σάββατο' },
  { value: 0, short: 'Κυρ', full: 'Κυριακή' },
];

// Generate 30-min time options from 06:00 to 23:00
const TIME_OPTIONS: string[] = (() => {
  const result: string[] = [];
  const startMinutes = 6 * 60; // 06:00
  const endMinutes = 23 * 60;  // 23:00
  for (let m = startMinutes; m <= endMinutes; m += 30) {
    const h = Math.floor(m / 60)
      .toString()
      .padStart(2, '0');
    const mm = (m % 60).toString().padStart(2, '0');
    result.push(`${h}:${mm}`);
  }
  return result;
})();
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale/el';

/* ...your existing imports... */

function ProgramDeleteModal({ open, onClose, tenantId, onDeleted }: ProgramDeleteModalProps) {
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [classes, setClasses] = useState<SimpleClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [startTime, setStartTime] = useState<string>(''); // "ALL" or HH:MM
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]); // all days

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load classes when modal opens
  useEffect(() => {
    if (!open || !tenantId) return;

    const loadClasses = async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, title')
        .eq('tenant_id', tenantId)
        .order('title', { ascending: true });

      if (error) {
        console.error('Error loading classes for delete modal', error);
      } else {
        setClasses((data ?? []) as SimpleClassRow[]);
      }
    };

    loadClasses();
  }, [open, tenantId]);

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      setFromDate(null);
      setToDate(null);
      setSelectedClassId('');
      setStartTime('');
      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
      setError(null);
      setPending(false);
      setClasses([]);
    }
  }, [open]);

  if (!open) return null;

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !pending) {
      onClose();
    }
  };

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const handleTimeSelectChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setStartTime(e.target.value);
  };

  const handleDelete = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenantId) {
      setError('Δεν βρέθηκε tenant.');
      return;
    }
    if (!fromDate || !toDate) {
      setError('Συμπλήρωσε και τις δύο ημερομηνίες.');
      return;
    }
    if (!selectedClassId) {
      setError('Επίλεξε τμήμα (class).');
      return;
    }
    if (!startTime) {
      setError('Επίλεξε ώρα ή "Όλες οι ώρες".');
      return;
    }
    if (selectedDays.length === 0) {
      setError('Επίλεξε τουλάχιστον μία ημέρα εβδομάδας.');
      return;
    }

    const isAllHours = startTime === 'ALL';

    let targetHours = 0;
    let targetMinutes = 0;

    if (!isAllHours) {
      const [hhStr, mmStr] = startTime.split(':');
      targetHours = Number(hhStr);
      targetMinutes = Number(mmStr);
    }

    try {
      setPending(true);
      setError(null);

      const fromStart = new Date(fromDate);
      fromStart.setHours(0, 0, 0, 0);

      const toEnd = new Date(toDate);
      toEnd.setHours(23, 59, 59, 999);

      // 1) Get all sessions of this class in the range
      const { data, error: selectError } = await supabase
        .from('class_sessions')
        .select('id, starts_at')
        .eq('tenant_id', tenantId)
        .eq('class_id', selectedClassId)
        .gte('starts_at', fromStart.toISOString())
        .lte('starts_at', toEnd.toISOString());

      if (selectError) {
        console.error('Error selecting sessions to delete', selectError);
        setError('Κάτι πήγε στραβά κατά την αναζήτηση συνεδριών.');
        return;
      }

      const rows = (data ?? []) as SessionIdRow[];

      // 2) Keep only sessions with matching day-of-week & time-of-day (or all hours)
      const idsToDelete = rows
        .filter((row) => {
          const dt = new Date(row.starts_at);
          const matchesDay = selectedDays.includes(dt.getDay());
          const matchesTime = isAllHours
            ? true
            : dt.getHours() === targetHours && dt.getMinutes() === targetMinutes;
          return matchesDay && matchesTime;
        })
        .map((row) => row.id);

      if (idsToDelete.length === 0) {
        setError('Δεν βρέθηκαν συνεδρίες με αυτά τα κριτήρια.');
        return;
      }

      // 3) Delete only those sessions
      const { error: deleteError } = await supabase
        .from('class_sessions')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) {
        console.error('Error deleting program sessions', deleteError);
        setError('Κάτι πήγε στραβά κατά τη διαγραφή.');
        return;
      }

      onDeleted();
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-md rounded-xl bg-secondary-background border border-white/10 shadow-xl p-4 md:p-5">
        <h2 className="text-lg font-semibold text-text-primary mb-1">
          Διαγραφή Προγράμματος
        </h2>
        <p className="text-xs md:text-sm text-text-secondary mb-4">
          Θα διαγραφούν{' '}
          <span className="font-semibold text-red-400">
            όλες οι συνεδρίες του επιλεγμένου τμήματος
          </span>{' '}
          που ξεκινούν στο συγκεκριμένο διάστημα, στις επιλεγμένες ημέρες και (αν οριστεί) στην
          επιλεγμένη ώρα. Η ενέργεια δεν μπορεί να αναιρεθεί.
        </p>

        <form onSubmit={handleDelete} className="space-y-3">
          {/* Class select */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">Τμήμα (Class)</label>
            <select
              className="w-full rounded-md bg-background border border-white/10 px-3 py-2 text-xs md:text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/70"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              <option value="">— Επίλεξε τμήμα —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          {/* From date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">Από ημερομηνία</label>
            <DatePicker
              selected={fromDate}
              onChange={(d) => setFromDate(d)}
              dateFormat="dd/MM/yyyy"
              locale={el}
              placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
              className="w-full rounded-md bg-background border border-white/10 px-3 py-2 text-xs md:text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/70"
              wrapperClassName="w-full"
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
              scrollableYearDropdown
              yearDropdownItemNumber={80}
              maxDate={toDate ?? undefined}
            />
          </div>

          {/* To date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">Έως ημερομηνία</label>
            <DatePicker
              selected={toDate}
              onChange={(d) => setToDate(d)}
              dateFormat="dd/MM/yyyy"
              locale={el}
              placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
              className="w-full rounded-md bg-background border border-white/10 px-3 py-2 text-xs md:text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/70"
              wrapperClassName="w-full"
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
              scrollableYearDropdown
              yearDropdownItemNumber={80}
              minDate={fromDate ?? undefined}
            />
          </div>

          {/* Days of week */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">Ημέρες εβδομάδας</label>
            <div className="flex flex-wrap gap-2">
              {DAY_OPTIONS.map((d) => {
                const active = selectedDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={`px-2 py-1 rounded-full text-[11px] border ${active
                      ? 'bg-primary text-white border-primary'
                      : 'bg-background text-text-secondary border-white/15'
                      }`}
                    title={d.full}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
            <span className="text-[11px] text-text-secondary">
              Ανέστρεψε επιλογή πατώντας ξανά σε μια ημέρα.
            </span>
          </div>

          {/* Start time (select, with "ALL") */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">Ώρα έναρξης συνεδρίας</label>
            <select
              className="w-full rounded-md bg-background border border-white/10 px-3 py-2 text-xs md:text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/70"
              value={startTime}
              onChange={handleTimeSelectChange}
            >
              <option value="">— Επίλεξε ώρα —</option>
              <option value="ALL">Όλες οι ώρες</option>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-text-secondary">
              Διάλεξε συγκεκριμένη ώρα ή «Όλες οι ώρες» για να διαγραφούν όλα τα ωράρια.
            </span>
          </div>

          {error && <div className="text-xs text-red-400">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md border border-white/15 px-3 py-1.5 text-xs md:text-sm text-text-secondary hover:bg-white/5"
              onClick={onClose}
              disabled={pending}
            >
              Άκυρο
            </button>
            <button
              type="submit"
              disabled={
                pending ||
                !fromDate ||
                !toDate ||
                !selectedClassId ||
                !startTime ||
                selectedDays.length === 0
              }
              className="inline-flex items-center justify-center rounded-md bg-red-500/90 px-3 py-1.5 text-xs md:text-sm font-medium text-white hover:bg-red-600 disabled:opacity-60"
            >
              {pending ? 'Διαγραφή…' : 'Διαγραφή συνεδριών'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
