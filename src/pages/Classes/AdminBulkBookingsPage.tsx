import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import {
  Trash2, ChevronLeft, ChevronRight, CalendarDays, Users, Search,
  AlertTriangle, Loader2, CalendarPlus, GripVertical, Eye, Zap, Clock,
} from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';

import type { Member, SessionClassRel, SessionWithRelations, Feedback, DropInPromptState } from './bulkbookings/types';
import {
  getSessionClass, formatDateDMY, startOfWeekMonday, addDaysSimple,
  formatTimeRange, WEEKDAY_LABELS, isMembershipErrorMessage,
} from './bulkbookings/bulkBookingUtils';
import FeedbackBanner from './bulkbookings/components/FeedbackBanner';
import ModalShell from './bulkbookings/components/ModalShell';
import PrimaryBtn from './bulkbookings/components/PrimaryBtn';
import SecondaryBtn from './bulkbookings/components/SecondaryBtn';
import BulkBookingsModal from './bulkbookings/modals/BulkBookingsModal';

export default function AdminBulkBookingsPage() {
  const { profile, subscription } = useAuth();
  const tenantId = profile?.tenant_id ?? null;

  const [showSubModal, setShowSubModal]                   = useState(false);
  const [members, setMembers]                             = useState<Member[]>([]);
  const [membersLoading, setMembersLoading]               = useState(false);
  const [memberSearch, setMemberSearch]                   = useState('');
  const [classes, setClasses]                             = useState<SessionClassRel[]>([]);
  const [sessions, setSessions]                           = useState<SessionWithRelations[]>([]);
  const [sessionsLoading, setSessionsLoading]             = useState(false);
  const [weekStart, setWeekStart]                         = useState<Date>(() => startOfWeekMonday(new Date()));
  const [creatingBookingForSession, setCreatingBookingForSession] = useState<string | null>(null);
  const [feedback, setFeedback]                           = useState<Feedback>(null);
  const [dropInPrompt, setDropInPrompt]                   = useState<DropInPromptState>(null);
  const [dropInLoading, setDropInLoading]                 = useState(false);
  const [detailsSessionId, setDetailsSessionId]           = useState<string | null>(null);
  const [deletingBookingId, setDeletingBookingId]         = useState<string | null>(null);
  const [bulkModalOpen, setBulkModalOpen]                 = useState(false);

  const subscriptionInactive = !subscription?.is_active;
  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) { setShowSubModal(true); return; }
    action();
  }

  useEffect(() => {
    if (!tenantId) return;
    setMembersLoading(true);
    supabase.from('members').select('id,full_name,email').eq('tenant_id', tenantId).eq('role', 'member').order('full_name')
      .then(({ data, error }) => {
        if (error) setFeedback({ type: 'error', message: 'Σφάλμα κατά τη φόρτωση μελών.' });
        else setMembers(data ?? []);
        setMembersLoading(false);
      });
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from('classes').select('id,title,drop_in_enabled,drop_in_price,member_drop_in_price').eq('tenant_id', tenantId).order('title')
      .then(({ data }) => setClasses((data ?? []) as unknown as SessionClassRel[]));
  }, [tenantId]);

  const loadSessions = useCallback(async () => {
    if (!tenantId) return;
    setSessionsLoading(true);
    const weekEnd = addDaysSimple(weekStart, 7);
    const { data, error } = await supabase.from('class_sessions')
      .select(`id,tenant_id,class_id,starts_at,ends_at,classes(id,title,drop_in_enabled,drop_in_price,member_drop_in_price),bookings(id,user_id,status,booking_type,drop_in_price,drop_in_paid,members(id,full_name,email))`)
      .eq('tenant_id', tenantId).gte('starts_at', weekStart.toISOString()).lt('starts_at', weekEnd.toISOString()).order('starts_at');
    if (error) setFeedback({ type: 'error', message: 'Σφάλμα κατά τη φόρτωση μαθημάτων.' });
    else setSessions((data ?? []) as unknown as SessionWithRelations[]);
    setSessionsLoading(false);
  }, [tenantId, weekStart]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const weekLabel = useMemo(() => `${formatDateDMY(weekStart)} – ${formatDateDMY(addDaysSimple(weekStart, 6))}`, [weekStart]);
  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => (m.full_name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }, [members, memberSearch]);

  const sessionsByDay: Record<number, SessionWithRelations[]> = useMemo(() => {
    const map: Record<number, SessionWithRelations[]> = {};
    for (const s of sessions) {
      const dow = new Date(s.starts_at).getDay();
      const mi  = dow === 0 ? 6 : dow - 1;
      if (!map[mi]) map[mi] = [];
      map[mi].push(s);
    }
    return map;
  }, [sessions]);

  function handleWeekChange(dir: 'prev' | 'next' | 'this') {
    if (dir === 'this') setWeekStart(startOfWeekMonday(new Date()));
    else setWeekStart((prev) => addDaysSimple(prev, dir === 'next' ? 7 : -7));
  }

  function handleMemberDragStart(e: DragEvent<HTMLButtonElement>, memberId: string) {
    e.dataTransfer.setData('text/plain', memberId);
    e.dataTransfer.effectAllowed = 'copyMove';
  }

  async function handleDropOnSession(e: DragEvent<HTMLDivElement>, sessionId: string) {
    e.preventDefault(); e.stopPropagation();
    const memberId = e.dataTransfer.getData('text/plain');
    if (memberId) await createBookingForMember(memberId, sessionId);
  }

  async function createBookingForMember(memberId: string, sessionId: string) {
    if (!tenantId) return;
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    if (session.bookings?.some((b) => b.user_id === memberId && (b.status ?? '') !== 'cancelled')) {
      setFeedback({ type: 'error', message: 'Το μέλος είναι ήδη κλεισμένο σε αυτό το μάθημα.' });
      return;
    }
    setCreatingBookingForSession(sessionId); setFeedback(null);
    try {
      const res = await supabase.functions.invoke('booking-create', { body: { tenant_id: tenantId, session_id: sessionId, user_id: memberId, booking_type: 'membership' } });
      const errMsg = (res.data as any)?.error ?? res.error?.message ?? '';
      if (res.error || (res.data as any)?.error) {
        if (!isMembershipErrorMessage(errMsg)) { setFeedback({ type: 'error', message: errMsg || 'Κάτι πήγε στραβά.' }); return; }
        const cls = getSessionClass(session);
        if (!cls?.drop_in_enabled) { setFeedback({ type: 'error', message: 'Το μέλος δεν έχει κατάλληλη συνδρομή και το μάθημα δεν επιτρέπει drop-in.' }); return; }
        setDropInPrompt({ memberId, sessionId }); return;
      }
      await loadSessions();
      setFeedback({ type: 'success', message: 'Η κράτηση με συνδρομή δημιουργήθηκε με επιτυχία.' });
    } catch (e: any) { setFeedback({ type: 'error', message: e?.message || 'Κάτι πήγε στραβά.' }); }
    finally { setCreatingBookingForSession(null); }
  }

  async function handleDeleteBooking(bookingId: string) {
    if (!tenantId || !window.confirm('Να διαγραφεί οριστικά αυτή η κράτηση;')) return;
    setDeletingBookingId(bookingId); setFeedback(null);
    try {
      const res = await supabase.functions.invoke('booking-delete', { body: { id: bookingId } });
      const errMsg = (res.data as any)?.error ?? res.error?.message ?? '';
      if (res.error || (res.data as any)?.error) { setFeedback({ type: 'error', message: errMsg || 'Σφάλμα κατά τη διαγραφή.' }); return; }
      await loadSessions();
      setFeedback({ type: 'success', message: 'Η κράτηση διαγράφηκε.' });
    } catch (e: any) { setFeedback({ type: 'error', message: e?.message || 'Κάτι πήγε στραβά.' }); }
    finally { setDeletingBookingId(null); }
  }

  async function confirmDropIn() {
    if (!tenantId || !dropInPrompt) return;
    const { memberId, sessionId } = dropInPrompt;
    setDropInLoading(true); setFeedback(null);
    try {
      const res = await supabase.functions.invoke('booking-create', { body: { tenant_id: tenantId, session_id: sessionId, user_id: memberId, booking_type: 'drop_in' } });
      const errMsg = (res.data as any)?.error ?? res.error?.message ?? '';
      if (res.error || (res.data as any)?.error) { setFeedback({ type: 'error', message: errMsg || 'Κάτι πήγε στραβά.' }); return; }
      await loadSessions();
      setFeedback({ type: 'success', message: 'Η κράτηση ως drop-in δημιουργήθηκε με επιτυχία.' });
      setDropInPrompt(null);
    } catch (e: any) { setFeedback({ type: 'error', message: e?.message || 'Κάτι πήγε στραβά.' }); }
    finally { setDropInLoading(false); }
  }

  if (!tenantId) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />Δεν βρέθηκε tenant_id στο προφίλ διαχειριστή.
        </div>
      </div>
    );
  }

  const detailsSession = sessions.find((s) => s.id === detailsSessionId) ?? null;

  return (
    <>
      <div className="flex flex-col md:flex-row gap-3 md:gap-4 p-3 md:p-4 h-full">

        {/* Sidebar: Members */}
        <aside className="w-full md:w-68 order-2 md:order-1 flex flex-col rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border/10">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                <Users className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-black text-text-primary tracking-tight">Μέλη</h2>
                <p className="text-[10px] text-text-secondary">{membersLoading ? '…' : `${filteredMembers.length} μέλη`}</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary pointer-events-none" />
              <input className="w-full h-8 pl-8 pr-3 rounded-xl border border-border/15 bg-secondary/10 text-xs text-text-primary placeholder:text-text-secondary outline-none focus:border-primary/40 transition-all"
                placeholder="Αναζήτηση μέλους…" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
              />
            </div>
            <p className="text-[10px] text-text-secondary mt-2 opacity-70">Σύρε ένα μέλος σε μάθημα για κράτηση</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {membersLoading && <div className="flex items-center justify-center gap-1.5 py-6 text-text-secondary text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin" />Φόρτωση…</div>}
            {!membersLoading && filteredMembers.length === 0 && <div className="text-xs text-text-secondary opacity-50 text-center py-6 italic">Δεν βρέθηκαν μέλη.</div>}
            {!membersLoading && filteredMembers.map((m) => (
              <button key={m.id} type="button" draggable onDragStart={(e) => handleMemberDragStart(e, m.id)}
                className="w-full flex items-center gap-2.5 rounded-xl border border-border/10 bg-secondary/5 hover:bg-secondary/20 px-3 py-2 text-left transition-colors cursor-grab active:cursor-grabbing group"
              >
                <GripVertical className="h-3 w-3 text-text-secondary opacity-30 group-hover:opacity-60 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-text-primary truncate">{m.full_name || m.email || m.id}</div>
                  {m.email && <div className="text-[10px] text-text-secondary truncate">{m.email}</div>}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Main: Week calendar */}
        <main className="order-1 md:order-2 flex-1 flex flex-col rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border/10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <h1 className="text-sm font-black text-text-primary tracking-tight">Πρόγραμμα εβδομάδας</h1>
                  <p className="text-[10px] text-text-secondary">{weekLabel}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button onClick={() => handleWeekChange('prev')} className="h-8 w-8 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => handleWeekChange('this')} className="h-8 px-3 rounded-xl border border-border/15 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Σήμερα</button>
                <button onClick={() => handleWeekChange('next')} className="h-8 w-8 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"><ChevronRight className="h-4 w-4" /></button>
                <button onClick={() => requireActiveSubscription(() => setBulkModalOpen(true))}
                  className="group relative inline-flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px transition-all cursor-pointer overflow-hidden"
                >
                  <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                  <CalendarPlus className="h-3.5 w-3.5 relative z-10" />
                  <span className="relative z-10 hidden sm:inline">Μαζικές κρατήσεις</span>
                </button>
              </div>
            </div>
            {feedback && <div className="mt-3"><FeedbackBanner feedback={feedback} onDismiss={() => setFeedback(null)} /></div>}
          </div>

          {/* Week grid */}
          <div className="flex-1 p-3 overflow-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2 h-full min-h-80">
              {WEEKDAY_LABELS.map((label, idx) => {
                const dayDate     = addDaysSimple(weekStart, idx);
                const daySessions = sessionsByDay[idx] ?? [];
                const isToday     = formatDateDMY(dayDate) === formatDateDMY(new Date());
                return (
                  <div key={label} className={['flex flex-col rounded-xl border overflow-hidden', isToday ? 'border-primary/30 bg-primary/3' : 'border-border/10 bg-secondary/3'].join(' ')}>
                    <div className={['px-2.5 py-2 border-b flex items-center justify-between', isToday ? 'border-primary/20 bg-primary/8' : 'border-border/8 bg-secondary/5'].join(' ')}>
                      <div>
                        <div className={['text-[11px] font-black uppercase tracking-wider', isToday ? 'text-primary' : 'text-text-secondary'].join(' ')}>{label}</div>
                        <div className="text-[10px] text-text-secondary">{formatDateDMY(dayDate)}</div>
                      </div>
                      {isToday && <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                    </div>
                    <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto">
                      {sessionsLoading && idx === 0 && <div className="flex items-center justify-center gap-1 py-4 text-text-secondary text-[11px]"><Loader2 className="h-3 w-3 animate-spin" /></div>}
                      {!sessionsLoading && daySessions.length === 0 && <div className="text-[10px] text-text-secondary opacity-30 text-center py-4 italic">Χωρίς μαθήματα</div>}
                      {daySessions.map((s) => {
                        const cls          = getSessionClass(s);
                        const bookingCount = s.bookings?.length ?? 0;
                        const isCreating   = creatingBookingForSession === s.id;
                        return (
                          <div key={s.id} className="rounded-lg border border-border/10 bg-secondary-background/80 p-2 text-[11px] space-y-1.5 hover:border-primary/20 hover:bg-primary/3 transition-all"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => requireActiveSubscription(() => handleDropOnSession(e, s.id))}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="font-bold text-text-primary truncate leading-tight">{cls?.title ?? 'Μάθημα'}</span>
                              {isCreating && <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                              <Clock className="h-2.5 w-2.5 shrink-0" />{formatTimeRange(s.starts_at, s.ends_at)}
                            </div>
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                                <Users className="h-2.5 w-2.5 shrink-0" />
                                <span className="font-semibold text-text-primary">{bookingCount}</span>
                              </div>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setDetailsSessionId(s.id); }}
                                className="flex items-center gap-0.5 text-[10px] text-primary hover:text-primary/80 font-semibold cursor-pointer"
                              >
                                <Eye className="h-2.5 w-2.5" />Προβολή
                              </button>
                            </div>
                            <div className="text-[9px] text-text-secondary opacity-30 border-t border-border/5 pt-1">Ρίξε μέλος εδώ</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {/* Bulk modal */}
      <BulkBookingsModal open={bulkModalOpen} tenantId={tenantId} members={members} classes={classes} onClose={() => setBulkModalOpen(false)} onDone={loadSessions} />

      {/* Drop-in prompt modal */}
      {dropInPrompt && (() => {
        const member  = members.find((m) => m.id === dropInPrompt.memberId);
        const session = sessions.find((s) => s.id === dropInPrompt.sessionId);
        const cls     = session ? getSessionClass(session) : null;
        const when    = session ? `${formatDateDMY(new Date(session.starts_at))} · ${formatTimeRange(session.starts_at, session.ends_at)}` : '';
        return (
          <ModalShell title="Κράτηση ως drop-in;" icon={<Zap className="h-4 w-4 text-warning" />} onClose={() => setDropInPrompt(null)}
            footer={<>
              <SecondaryBtn label="Ακύρωση" onClick={() => setDropInPrompt(null)} disabled={dropInLoading} />
              <PrimaryBtn busy={dropInLoading} busyLabel="Γίνεται κράτηση…" label="Ναι, ως drop-in" onClick={confirmDropIn} />
            </>}
          >
            <div className="text-sm text-text-secondary leading-relaxed">
              Το μέλος <span className="font-bold text-text-primary">{member?.full_name || member?.email || '—'}</span> δεν έχει κατάλληλη ενεργή συνδρομή για το μάθημα <span className="font-bold text-text-primary">{cls?.title ?? '—'}</span>.
            </div>
            <div className="px-4 py-3 rounded-xl border border-border/10 bg-secondary/5 space-y-1 text-xs text-text-secondary">
              {when && <div className="flex items-center gap-1.5"><CalendarDays className="h-3 w-3" />{when}</div>}
              {cls?.drop_in_price != null && <div className="flex items-center gap-1.5"><span className="font-bold text-text-primary">{cls.drop_in_price}€</span> τιμή drop-in</div>}
            </div>
          </ModalShell>
        );
      })()}

      {/* Session details modal */}
      {detailsSession && (() => {
        const cls    = getSessionClass(detailsSession);
        const when   = `${formatDateDMY(new Date(detailsSession.starts_at))} · ${formatTimeRange(detailsSession.starts_at, detailsSession.ends_at)}`;
        const sorted = [...(detailsSession.bookings ?? [])].sort((a, b) => {
          const an = a.members?.full_name || a.members?.email || a.user_id || '';
          const bn = b.members?.full_name || b.members?.email || b.user_id || '';
          return an.localeCompare(bn, 'el');
        });
        return (
          <ModalShell title={cls?.title ?? 'Μάθημα'} icon={<CalendarDays className="h-4 w-4 text-primary" />} subtitle={when} onClose={() => setDetailsSessionId(null)}>
            <div className="text-xs text-text-secondary">Σύνολο κρατήσεων: <span className="font-bold text-text-primary">{sorted.length}</span></div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {sorted.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-text-secondary">
                  <Users className="h-6 w-6 opacity-25" />
                  <span className="text-xs">Δεν υπάρχουν κρατήσεις για αυτό το μάθημα.</span>
                </div>
              )}
              {sorted.map((b) => {
                const name       = b.members?.full_name || b.members?.email || b.user_id;
                const isDropIn   = b.booking_type === 'drop_in';
                const isDeleting = deletingBookingId === b.id;
                return (
                  <div key={b.id} className="flex items-start justify-between gap-3 rounded-xl border border-border/10 bg-secondary/5 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text-primary truncate">{name}</div>
                      {b.members?.email && <div className="text-[11px] text-text-secondary">{b.members.email}</div>}
                      {isDropIn && (
                        <div className="text-[11px] text-text-secondary mt-0.5">
                          {b.drop_in_price ?? 0}€ · {b.drop_in_paid ? <span className="text-success">Πληρωμένο</span> : <span className="text-warning">Οφειλή</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${isDropIn ? 'border-warning/40 bg-warning/10 text-warning' : 'border-success/40 bg-success/10 text-success'}`}>
                        {isDropIn ? 'Drop-in' : 'Συνδρομή'}
                      </span>
                      <button type="button" onClick={() => handleDeleteBooking(b.id)} disabled={isDeleting}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-xl border border-danger/20 text-danger hover:bg-danger/10 disabled:opacity-40 transition-all cursor-pointer"
                      >
                        {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ModalShell>
        );
      })()}

      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </>
  );
}
