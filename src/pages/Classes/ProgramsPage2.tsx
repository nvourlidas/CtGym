// src/pages/Classes/ProgramsPage2.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateClickArg, EventResizeDoneArg } from '@fullcalendar/interaction';
import type { EventClickArg, EventDropArg, DatesSetArg } from '@fullcalendar/core';
import elLocale from '@fullcalendar/core/locales/el';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import SessionModal from '../../components/Programs/SessionModal';
import ProgramGeneratorModal from '../../components/Programs/ProgramGeneratorModal';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';

import type { SessionRowFromDb, SessionRow, CalendarView } from './programs/types';
import ProgramDeleteModal from './programs/modals/ProgramDeleteModal';

// Re-export types for consumers that import from this file
export type { SessionRowFromDb, SessionRow } from './programs/types';

export default function ProgramsPage() {
  const { profile, subscription } = useAuth();
  const tenantId = profile?.tenant_id;

  const [showSubModal, setShowSubModal]                     = useState(false);
  const [view, setView]                                     = useState<CalendarView>('month');
  const [currentRange, setCurrentRange]                     = useState<{ start: string; end: string } | null>(null);
  const [sessions, setSessions]                             = useState<SessionRow[]>([]);
  const [loading, setLoading]                               = useState(false);
  const [sessionModalOpen, setSessionModalOpen]             = useState(false);
  const [editingSession, setEditingSession]                 = useState<SessionRow | null>(null);
  const [defaultDate, setDefaultDate]                       = useState<Date | null>(null);
  const [programModalOpen, setProgramModalOpen]             = useState(false);
  const [deleteProgramModalOpen, setDeleteProgramModalOpen] = useState(false);
  const [isMobile, setIsMobile]                             = useState(false);

  const calendarRef = useRef<any>(null);
  const subscriptionInactive = !subscription?.is_active;

  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) { setShowSubModal(true); return; }
    action();
  }

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!tenantId || !currentRange) return;
    const fetchSessions = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('class_sessions')
        .select('id,tenant_id,class_id,starts_at,ends_at,capacity,cancel_before_hours,classes:classes(title)')
        .eq('tenant_id', tenantId)
        .gte('starts_at', currentRange.start)
        .lte('starts_at', currentRange.end)
        .order('starts_at', { ascending: true });

      if (!error && data) {
        const normalized: SessionRow[] = (data as SessionRowFromDb[]).map((row) => ({
          ...row,
          classes: Array.isArray(row.classes) ? row.classes[0] ?? null : ((row.classes as any) ?? null),
        }));
        setSessions(normalized);
      }
      setLoading(false);
    };
    fetchSessions();
  }, [tenantId, currentRange]);

  const events = useMemo(() =>
    sessions.map((s) => ({
      id: s.id, title: s.classes?.title ?? 'Μάθημα',
      start: s.starts_at, end: s.ends_at ?? undefined,
      extendedProps: { session: s },
    })),
    [sessions],
  );

  const handleDatesSet = (arg: DatesSetArg) =>
    setCurrentRange({ start: arg.start.toISOString(), end: arg.end.toISOString() });

  const handleDateClick = (arg: DateClickArg) => {
    setEditingSession(null); setDefaultDate(arg.date); setSessionModalOpen(true);
  };

  const handleEventClick = (arg: EventClickArg) => {
    setEditingSession(arg.event.extendedProps.session as SessionRow);
    setDefaultDate(null); setSessionModalOpen(true);
  };

  const handleEventDrop = async (info: EventDropArg) => {
    const { id, start, end } = info.event;
    if (!start) return;
    const newStart = start.toISOString();
    const newEnd   = end ? end.toISOString() : null;
    const { error } = await supabase.from('class_sessions').update({ starts_at: newStart, ends_at: newEnd }).eq('id', id);
    if (error) { console.error('Failed to move session', error); info.revert(); }
    else setSessions((prev) => prev.map((s) => s.id === id ? { ...s, starts_at: newStart, ends_at: newEnd } : s));
  };

  const handleEventResize = async (info: EventResizeDoneArg) => {
    const { id, start, end } = info.event;
    if (!start || !end) return;
    const newStart = start.toISOString();
    const newEnd   = end.toISOString();
    const { error } = await supabase.from('class_sessions').update({ starts_at: newStart, ends_at: newEnd }).eq('id', id);
    if (error) { console.error('Failed to resize session', error); info.revert(); }
    else setSessions((prev) => prev.map((s) => s.id === id ? { ...s, starts_at: newStart, ends_at: newEnd } : s));
  };

  const handleSessionSaved = (newOrUpdated: SessionRow) =>
    setSessions((prev) => prev.find((s) => s.id === newOrUpdated.id)
      ? prev.map((s) => s.id === newOrUpdated.id ? newOrUpdated : s)
      : [...prev, newOrUpdated]);

  const handleSessionDeleted = (id: string) =>
    setSessions((prev) => prev.filter((s) => s.id !== id));

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (view === 'month' && api.view.type !== 'dayGridMonth') api.changeView('dayGridMonth');
    if (view === 'week'  && api.view.type !== 'timeGridWeek') api.changeView('timeGridWeek');
    if (view === 'day'   && api.view.type !== 'timeGridDay')  api.changeView('timeGridDay');
  }, [view]);

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      {/* Top Bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl md:text-2xl font-semibold text-text-primary">Προγράμματα</h1>
          <span className="text-xs md:text-sm text-text-secondary">Διαχείριση όλων των μαθημάτων με drag &amp; drop</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <div className="inline-flex rounded-md border border-border/10 overflow-hidden">
            {(['month', 'week', 'day'] as CalendarView[]).map((v, i) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1 text-xs md:text-sm ${view === v ? 'bg-primary text-white' : 'bg-secondary-background text-text-secondary'}`}
              >
                {['Μήνας', 'Εβδομάδα', 'Ημέρα'][i]}
              </button>
            ))}
          </div>
          <button
            onClick={() => requireActiveSubscription(() => setProgramModalOpen(true))}
            className="w-full xs:w-auto md:w-auto md:ml-3 inline-flex items-center justify-center gap-2 rounded-md bg-accent px-3 md:px-4 py-2 text-xs md:text-sm font-medium text-black hover:bg-accent/80 cursor-pointer"
          >
            + Δημιουργία Προγράμματος
          </button>
          <button
            onClick={() => requireActiveSubscription(() => setDeleteProgramModalOpen(true))}
            className="w-full xs:w-auto md:w-auto inline-flex items-center justify-center gap-2 rounded-md bg-red-500/90 px-3 md:px-4 py-2 text-xs md:text-sm font-medium text-white hover:bg-red-600 cursor-pointer"
          >
            Διαγραφή Προγράμματος
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="gym-calendar bg-secondary-background rounded-xl shadow-sm border border-border/10 p-3 md:p-4 text-text-primary">
        {loading && <div className="mb-2 text-xs md:text-sm text-text-secondary">Φόρτωση συνεδριών για το επιλεγμένο διάστημα…</div>}
        <div className="-mx-2 md:mx-0 overflow-x-auto">
          <div className="min-w-180 md:min-w-full px-2 md:px-0">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              locale={elLocale}
              headerToolbar={isMobile
                ? { left: 'prev,next', center: 'title', right: 'today' }
                : { left: 'today prev,next', center: 'title', right: '' }}
              buttonText={{ today: 'Σήμερα' }}
              height="auto"
              allDaySlot={false}
              editable selectable droppable={false} eventResizableFromStart
              events={events}
              dateClick={(arg) => requireActiveSubscription(() => handleDateClick(arg))}
              eventClick={(arg) => requireActiveSubscription(() => handleEventClick(arg))}
              eventDrop={(info) => requireActiveSubscription(() => handleEventDrop(info))}
              eventResize={(info) => requireActiveSubscription(() => handleEventResize(info))}
              datesSet={handleDatesSet}
              viewDidMount={(arg) => {
                if (arg.view.type === 'dayGridMonth' && view !== 'month') setView('month');
                if (arg.view.type === 'timeGridWeek'  && view !== 'week')  setView('week');
                if (arg.view.type === 'timeGridDay'   && view !== 'day')   setView('day');
              }}
              dayHeaderFormat={{ weekday: 'short' }}
              slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
              eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
              dayHeaderClassNames={() => ['text-[11px]', 'uppercase', 'text-secondary-background', 'bg-secondary-background/30']}
              dayCellClassNames={() => ['bg-secondary-background/60', 'border', 'border-border/10', 'align-top']}
              eventClassNames={() => ['bg-primary', 'border-none', 'text-white', 'text-[11px]', 'leading-tight', 'rounded-md', 'px-1', 'h-11', 'py-[2px]', 'cursor-pointer', 'hover:bg-primary/90']}
              moreLinkClassNames={() => ['text-[11px]', 'text-text-secondary', 'hover:text-text-primary']}
            />
          </div>
        </div>
      </div>

      {/* Modals */}
      <SessionModal
        open={sessionModalOpen} onClose={() => setSessionModalOpen(false)}
        defaultDate={defaultDate} session={editingSession}
        onSaved={handleSessionSaved} onDeleted={handleSessionDeleted}
      />
      <ProgramGeneratorModal
        open={programModalOpen} onClose={() => setProgramModalOpen(false)}
        onGenerated={() => setCurrentRange((r) => (r ? { ...r } : r))}
      />
      <ProgramDeleteModal
        open={deleteProgramModalOpen} onClose={() => setDeleteProgramModalOpen(false)}
        tenantId={tenantId ?? null}
        onDeleted={() => setCurrentRange((r) => (r ? { ...r } : r))}
      />
      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </div>
  );
}
