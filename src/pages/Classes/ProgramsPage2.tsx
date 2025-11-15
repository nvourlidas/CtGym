// src/pages/ProgramsPage.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
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
import SessionModal from '../../components/SessionModal';
import ProgramGeneratorModal from '../../components/ProgramGeneratorModal';

export type SessionRowFromDb = {
    id: string;
    tenant_id: string;
    class_id: string;
    starts_at: string;
    ends_at: string | null;
    capacity: number | null;
    classes?: { title: string }[] | null;
};

export type SessionRow = {
    id: string;
    tenant_id: string;
    class_id: string;
    starts_at: string;
    ends_at: string | null;
    capacity: number | null;
    classes?: { title: string } | null;
};

type CalendarView = 'month' | 'week' | 'day';

export default function ProgramsPage() {
    const { profile } = useAuth();
    const tenantId = profile?.tenant_id;

    const [view, setView] = useState<CalendarView>('month');
    const [currentRange, setCurrentRange] = useState<{ start: string; end: string } | null>(null);

    const [sessions, setSessions] = useState<SessionRow[]>([]);
    const [loading, setLoading] = useState(false);

    const [sessionModalOpen, setSessionModalOpen] = useState(false);
    const [editingSession, setEditingSession] = useState<SessionRow | null>(null);
    const [defaultDate, setDefaultDate] = useState<Date | null>(null);

    const [programModalOpen, setProgramModalOpen] = useState(false);

    // ref για έλεγχο του FullCalendar
    const calendarRef = useRef<any>(null);

    // ----- Φόρτωση συνεδριών -----
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
          classes:classes(title)
        `
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
                        : (row.classes as any) ?? null
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
                extendedProps: { session: s }
            })),
        [sessions]
    );

    const handleDatesSet = (arg: DatesSetArg) => {
        setCurrentRange({
            start: arg.start.toISOString(),
            end: arg.end.toISOString()
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
                prev.map((s) => (s.id === id ? { ...s, starts_at: newStart, ends_at: newEnd } : s))
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
                prev.map((s) => (s.id === id ? { ...s, starts_at: newStart, ends_at: newEnd } : s))
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
        setCurrentRange((r) => (r ? { ...r } : r));
    };


    const handleSessionDeleted = (id: string) => {
        setSessions((prev) => prev.filter((s) => s.id !== id));
    };


    // συγχρονισμός πλήκτρων Μήνας/Εβδομάδα/Ημέρα με FullCalendar
    useEffect(() => {
        const api = calendarRef.current?.getApi();
        if (!api) return;

        if (view === 'month' && api.view.type !== 'dayGridMonth') api.changeView('dayGridMonth');
        if (view === 'week' && api.view.type !== 'timeGridWeek') api.changeView('timeGridWeek');
        if (view === 'day' && api.view.type !== 'timeGridDay') api.changeView('timeGridDay');
    }, [view]);

    return (
        <div className="p-6 flex flex-col gap-4">
            {/* Top Bar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-semibold text-text-primary">Προγράμματα</h1>
                    <span className="text-sm text-text-secondary">
                        Διαχείριση όλων των μαθημάτων με drag &amp; drop
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {/* View Toggles */}
                    <div className="inline-flex rounded-md border border-white/10 overflow-hidden">
                        <button
                            onClick={() => setView('month')}
                            className={`px-3 py-1 text-sm ${view === 'month'
                                ? 'bg-primary text-white'
                                : 'bg-secondary-background text-text-secondary'
                                }`}
                        >
                            Μήνας
                        </button>
                        <button
                            onClick={() => setView('week')}
                            className={`px-3 py-1 text-sm ${view === 'week'
                                ? 'bg-primary text-white'
                                : 'bg-secondary-background text-text-secondary'
                                }`}
                        >
                            Εβδομάδα
                        </button>
                        <button
                            onClick={() => setView('day')}
                            className={`px-3 py-1 text-sm ${view === 'day'
                                ? 'bg-primary text-white'
                                : 'bg-secondary-background text-text-secondary'
                                }`}
                        >
                            Ημέρα
                        </button>
                    </div>

                    {/* Create Program button */}
                    <button
                        onClick={() => setProgramModalOpen(true)}
                        className="ml-3 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent/80 cursor-pointer"
                    >
                        + Δημιουργία Προγράμματος
                    </button>
                </div>
            </div>

            {/* Calendar Card */}
            <div className="gym-calendar bg-secondary-background rounded-xl shadow-sm border border-white/10 p-4 text-text-primary">                {loading && (
                <div className="mb-2 text-sm text-text-secondary">
                    Φόρτωση συνεδριών για το επιλεγμένο διάστημα…
                </div>
            )}

                <FullCalendar
                    ref={calendarRef}
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    locale={elLocale}
                    headerToolbar={{
                        left: 'today prev,next',
                        center: 'title',
                        right: ''
                    }}
                    buttonText={{
                        today: 'Σήμερα'
                    }}
                    height="auto"
                    allDaySlot={false}
                    editable
                    selectable
                    droppable={false}
                    eventResizableFromStart
                    events={events}
                    dateClick={handleDateClick}
                    eventClick={handleEventClick}
                    eventDrop={handleEventDrop}
                    eventResize={handleEventResize}
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
                        hour12: false
                    }}
                    eventTimeFormat={{
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }}
                    // dark styling σαν το custom calendar σου
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
                        'align-top'
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
                        'hover:bg-primary'
                    ]}
                    moreLinkClassNames={() => [
                        'text-[11px]',
                        'text-text-secondary',
                        'hover:text-text-primary'
                    ]}
                />
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
        </div>
    );
}
