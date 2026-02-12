import { useEffect,useState } from 'react';
import { supabase } from '../../../lib/supabase';
import SessionPickerModal from '../../bookings/SessionPickerModal';

type SessionRow = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  classes?: {
    id: string;
    title: string;
    class_categories?: {
      name: string;
      color: string | null;
    } | null;
  } | null;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
}

export default function CreateMemberBookingModal({
  tenantId,
  memberId,
  onClose,
  onCreated,
  guard,
}: {
  tenantId: string;
  memberId: string;
  onClose: () => void;
  onCreated: () => void;
  guard?: () => boolean;
}) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [bookingType, setBookingType] = useState<'membership' | 'drop_in'>('membership');
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // session picker UI state (same as BookingsPage)
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionDate, setSessionDate] = useState(''); // yyyy-mm-dd
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);

  // load sessions
  useEffect(() => {
    (async () => {
      const { data: s, error: sErr } = await supabase
        .from('class_sessions')
        .select('id, starts_at, ends_at, capacity, classes(id, title, class_categories(name, color))')
        .eq('tenant_id', tenantId)
        .order('starts_at', { ascending: true });

      if (sErr) {
        setError(sErr.message);
        setSessions([]);
        return;
      }
      setSessions((s as any[]) ?? []);
    })();
  }, [tenantId]);

  const selectedSession = sessions.find((s) => s.id === sessionId);

  const sessionLabel = (s: SessionRow) => {
    const base = `${s.classes?.title ?? '—'} · ${formatDateTime(s.starts_at)}`;
    const cat = s.classes?.class_categories?.name ? ` · ${s.classes.class_categories.name}` : '';
    const cap = s.capacity != null ? ` (cap ${s.capacity})` : '';
    return base + cat + cap;
  };

  const submit = async () => {
    if (guard && !guard()) return;

    if (!sessionId) {
      setError('Πρέπει να επιλέξετε συνεδρία.');
      return;
    }

    setBusy(true);
    setError(null);

    const res = await supabase.functions.invoke('booking-create', {
      body: {
        tenant_id: tenantId,
        user_id: memberId,
        session_id: sessionId,
        booking_type: bookingType,
      },
    });

    setBusy(false);

    const errMsg = (res.data as any)?.error ?? res.error?.message ?? '';
    if (res.error || (res.data as any)?.error) {
      // keep same semantics as BookingsPage
      setError(errMsg || 'Η δημιουργία απέτυχε.');
      return;
    }

    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-md border border-border/10 bg-secondary-background text-text-primary shadow-xl">
        <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
          <div className="font-semibold">Νέα Κράτηση</div>
          <button onClick={onClose} className="rounded px-2 py-1 hover:bg-white/5">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">
              {error}
            </div>
          )}

          {/* Session */}
          <div>
            <div className="mb-1 text-sm opacity-80">Συνεδρία *</div>

            <div className="space-y-2">
              <button
                type="button"
                className="input flex items-center justify-between"
                onClick={() => setSessionPickerOpen(true)}
              >
                <span className="truncate">
                  {selectedSession ? sessionLabel(selectedSession) : '— επίλεξε συνεδρία —'}
                </span>
                <span className="ml-2 text-xs opacity-70">🔎</span>
              </button>

              {selectedSession?.ends_at && (
                <div className="text-xs text-text-secondary">
                  Λήξη: {formatDateTime(selectedSession.ends_at)}
                </div>
              )}

              {selectedSession?.classes?.class_categories?.name && (
                <div className="text-xs text-text-secondary flex items-center gap-2">
                  {selectedSession?.classes?.class_categories?.color && (
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full border border-border/20"
                      style={{ backgroundColor: selectedSession.classes.class_categories.color }}
                    />
                  )}
                  <span>{selectedSession.classes.class_categories.name}</span>
                </div>
              )}
            </div>

            {sessionPickerOpen && (
              <SessionPickerModal
                title="Επιλογή συνεδρίας"
                sessions={sessions}
                selectedSessionId={sessionId}
                initialSearch={sessionSearch}
                initialDate={sessionDate}
                onClose={() => setSessionPickerOpen(false)}
                onPick={(picked) => {
                  setSessionId(picked.id);
                  setSessionPickerOpen(false);
                }}
                onChangeFilters={({ search, date }) => {
                  setSessionSearch(search);
                  setSessionDate(date);
                }}
              />
            )}
          </div>

          {/* Booking type */}
          <div>
            <div className="mb-1 text-sm opacity-80">Τύπος κράτησης</div>
            <select
              className="input"
              value={bookingType}
              onChange={(e) => setBookingType(e.target.value as any)}
            >
              <option value="membership">Μέλος (συνδρομή)</option>
              <option value="drop_in">Drop-in (μεμονωμένη)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={onClose}>
              Ακύρωση
            </button>
            <button className="btn-primary" onClick={submit} disabled={busy}>
              {busy ? 'Δημιουργία...' : 'Δημιουργία'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
