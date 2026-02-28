import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import SessionPickerModal from '../../bookings/SessionPickerModal';
import { CalendarPlus, Search, X, AlertTriangle, Clock, Tag, Loader2 } from 'lucide-react';

type SessionRow = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  classes?: {
    id: string;
    title: string;
    class_categories?: { name: string; color: string | null } | null;
  } | null;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateMemberBookingModal({
  tenantId, memberId, onClose, onCreated, guard,
}: {
  tenantId: string;
  memberId: string;
  onClose: () => void;
  onCreated: () => void;
  guard?: () => boolean;
}) {
  const [sessions, setSessions]           = useState<SessionRow[]>([]);
  const [sessionId, setSessionId]         = useState('');
  const [bookingType, setBookingType]     = useState<'membership' | 'drop_in'>('membership');
  const [busy, setBusy]                   = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionDate, setSessionDate]     = useState('');
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: s, error: sErr } = await supabase
        .from('class_sessions')
        .select('id,starts_at,ends_at,capacity,classes(id,title,class_categories(name,color))')
        .eq('tenant_id', tenantId)
        .order('starts_at', { ascending: true });
      if (sErr) { setError(sErr.message); setSessions([]); return; }
      setSessions((s as any[]) ?? []);
    })();
  }, [tenantId]);

  const selectedSession = sessions.find((s) => s.id === sessionId);

  const sessionLabel = (s: SessionRow) => {
    const base = `${s.classes?.title ?? '—'} · ${formatDateTime(s.starts_at)}`;
    const cat  = s.classes?.class_categories?.name ? ` · ${s.classes.class_categories.name}` : '';
    const cap  = s.capacity != null ? ` (cap ${s.capacity})` : '';
    return base + cat + cap;
  };

  const submit = async () => {
    if (guard && !guard()) return;
    if (!sessionId) { setError('Πρέπει να επιλέξετε συνεδρία.'); return; }

    setBusy(true); setError(null);

    const res = await supabase.functions.invoke('booking-create', {
      body: { tenant_id: tenantId, user_id: memberId, session_id: sessionId, booking_type: bookingType },
    });

    setBusy(false);

    const errMsg = (res.data as any)?.error ?? res.error?.message ?? '';
    if (res.error || (res.data as any)?.error) { setError(errMsg || 'Η δημιουργία απέτυχε.'); return; }

    onCreated();
  };

  const BOOKING_TYPES = [
    { value: 'membership', label: 'Μέλος (συνδρομή)' },
    { value: 'drop_in',    label: 'Drop-in (μεμονωμένη)' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="w-full max-w-lg rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-2xl overflow-hidden"
        style={{ animation: 'bookingModalIn 0.2s ease' }}
      >
        {/* Top accent bar */}
        <div className="h-0.75 w-full bg-linear-to-r from-primary/0 via-primary to-primary/0" />

        {/* Header */}
        <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
              <CalendarPlus className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-black text-text-primary tracking-tight">Νέα Κράτηση</h2>
              <p className="text-[11px] text-text-secondary mt-px">Επιλέξτε συνεδρία και τύπο κράτησης</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl border border-border/10 hover:bg-secondary/30 text-text-secondary hover:text-text-primary transition-all cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">

          {error && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
              {error}
            </div>
          )}

          {/* Session picker */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-widest text-text-secondary">
              Συνεδρία *
            </label>

            <button
              type="button"
              onClick={() => setSessionPickerOpen(true)}
              className={[
                'w-full flex items-center justify-between gap-2 h-10 px-3.5 rounded-xl border text-sm transition-all cursor-pointer',
                selectedSession
                  ? 'border-primary/30 bg-primary/5 text-text-primary'
                  : 'border-border/15 bg-secondary-background text-text-secondary hover:border-primary/25 hover:bg-secondary/10',
              ].join(' ')}
            >
              <span className="truncate text-left">
                {selectedSession ? sessionLabel(selectedSession) : '— Επιλέξτε συνεδρία —'}
              </span>
              <Search className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </button>

            {/* Selected session details */}
            {selectedSession && (
              <div className="rounded-xl border border-border/10 bg-secondary/5 px-4 py-3 space-y-1.5">
                {selectedSession.ends_at && (
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <Clock className="h-3 w-3 opacity-60" />
                    <span>Λήξη: {formatDateTime(selectedSession.ends_at)}</span>
                  </div>
                )}
                {selectedSession.classes?.class_categories?.name && (
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    {selectedSession.classes.class_categories.color && (
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-border/20 shrink-0"
                        style={{ backgroundColor: selectedSession.classes.class_categories.color }}
                      />
                    )}
                    <Tag className="h-3 w-3 opacity-60" />
                    <span>{selectedSession.classes.class_categories.name}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Booking type */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-widest text-text-secondary">
              Τύπος κράτησης
            </label>
            <div className="grid grid-cols-2 gap-2">
              {BOOKING_TYPES.map((bt) => (
                <button
                  key={bt.value}
                  type="button"
                  onClick={() => setBookingType(bt.value as any)}
                  className={[
                    'h-10 px-3 rounded-xl border text-sm font-semibold transition-all duration-150 cursor-pointer',
                    bookingType === bt.value
                      ? 'border-primary/40 bg-primary/12 text-primary'
                      : 'border-border/15 bg-secondary/5 text-text-secondary hover:border-border/30 hover:text-text-primary',
                  ].join(' ')}
                >
                  {bt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
            >
              Ακύρωση
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="
                group relative inline-flex items-center justify-center gap-2 h-9 px-5 rounded-xl
                text-sm font-bold text-white bg-primary hover:bg-primary/90
                shadow-sm shadow-primary/20 hover:-translate-y-px active:translate-y-0
                disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0
                transition-all duration-150 cursor-pointer overflow-hidden
              "
            >
              <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
              {busy
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /><span className="relative z-10">Δημιουργία…</span></>
                : <span className="relative z-10">Δημιουργία</span>
              }
            </button>
          </div>
        </div>
      </div>

      {sessionPickerOpen && (
        <SessionPickerModal
          title="Επιλογή συνεδρίας"
          sessions={sessions}
          selectedSessionId={sessionId}
          initialSearch={sessionSearch}
          initialDate={sessionDate}
          onClose={() => setSessionPickerOpen(false)}
          onPick={(picked) => { setSessionId(picked.id); setSessionPickerOpen(false); }}
          onChangeFilters={({ search, date }) => { setSessionSearch(search); setSessionDate(date); }}
        />
      )}

      <style>{`
        @keyframes bookingModalIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
}