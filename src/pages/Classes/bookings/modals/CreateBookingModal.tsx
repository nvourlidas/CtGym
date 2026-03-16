import { useEffect, useState } from 'react';
import { Search, Clock } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import SessionPickerModal from '../../../../components/bookings/SessionPickerModal';
import type { Member, SessionRow } from '../types';
import { formatDateTime } from '../bookingUtils';
import ModalShell from '../components/ModalShell';
import FormField from '../components/FormField';
import PrimaryButton from '../components/PrimaryButton';
import MemberDropdown from '../components/MemberDropdown';

export default function CreateBookingModal({ tenantId, onClose, onError }: {
  tenantId: string; onClose: () => void; onError: (title: string, message: string) => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [userId, setUserId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [bookingType, setBookingType] = useState<'membership' | 'drop_in'>('membership');
  const [busy, setBusy] = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: m, error: mErr } = await supabase
        .from('members').select('id,full_name').eq('tenant_id', tenantId).eq('role', 'member').order('full_name');
      if (mErr) onError('Σφάλμα φόρτωσης μελών', mErr.message);
      setMembers((m as any[]) ?? []);

      const { data: s, error: sErr } = await supabase
        .from('class_sessions').select('id,starts_at,ends_at,capacity,classes(id,title,class_categories(name,color))').eq('tenant_id', tenantId).order('starts_at');
      if (sErr) onError('Σφάλμα φόρτωσης συνεδριών', sErr.message);
      setSessions((s as any[]) ?? []);
    })();
  }, [tenantId, onError]);

  const selectedSession = sessions.find((s) => s.id === sessionId);
  const sessionLabel = (s: SessionRow) => `${s.classes?.title ?? '—'} · ${formatDateTime(s.starts_at)}${s.capacity != null ? ` (cap ${s.capacity})` : ''}`;

  const submit = async () => {
    if (!userId || !sessionId) { onError('Ελλιπή στοιχεία', 'Πρέπει να επιλέξετε μέλος και συνεδρία.'); return; }
    setBusy(true);
    const res = await supabase.functions.invoke('booking-create', { body: { tenant_id: tenantId, user_id: userId, session_id: sessionId, booking_type: bookingType } });
    setBusy(false);
    const errMsg = (res.data as any)?.error ?? res.error?.message ?? '';
    if (res.error || (res.data as any)?.error) { onError('Σφάλμα δημιουργίας κράτησης', errMsg || 'Η δημιουργία απέτυχε.'); return; }
    onClose();
  };

  return (
    <ModalShell title="Νέα κράτηση" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Ακύρωση</button>
        <PrimaryButton busy={busy} busyLabel="Δημιουργία…" label="Δημιουργία" onClick={submit} />
      </>}
    >
      <FormField label="Μέλος *">
        <MemberDropdown members={members} value={userId} onChange={setUserId} />
      </FormField>

      <FormField label="Συνεδρία *">
        <button type="button" onClick={() => setSessionPickerOpen(true)}
          className={['w-full h-9 flex items-center justify-between gap-2 pl-3.5 pr-3 rounded-xl border transition-all cursor-pointer text-sm', sessionId ? 'border-primary/30 bg-primary/5 text-text-primary' : 'border-border/15 bg-secondary-background text-text-secondary hover:border-primary/30'].join(' ')}
        >
          <span className="truncate">{selectedSession ? sessionLabel(selectedSession) : '— επίλεξε συνεδρία —'}</span>
          <Search className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>

        {selectedSession && (
          <div className="mt-2 px-3.5 py-2.5 rounded-xl border border-border/10 bg-secondary/5 space-y-1">
            {selectedSession.ends_at && (
              <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Clock className="h-3 w-3 opacity-60" />Λήξη: {formatDateTime(selectedSession.ends_at)}
              </div>
            )}
            {selectedSession.classes?.class_categories?.name && (
              <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                {selectedSession.classes.class_categories.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: selectedSession.classes.class_categories.color }} />}
                {selectedSession.classes.class_categories.name}
              </div>
            )}
          </div>
        )}

        {sessionPickerOpen && (
          <SessionPickerModal
            title="Επιλογή συνεδρίας" sessions={sessions} selectedSessionId={sessionId}
            initialSearch={sessionSearch} initialDate={sessionDate}
            onClose={() => setSessionPickerOpen(false)}
            onPick={(picked) => setSessionId(picked.id)}
            onChangeFilters={({ search, date }) => { setSessionSearch(search); setSessionDate(date); }}
          />
        )}
      </FormField>

      <FormField label="Τύπος κράτησης">
        <div className="grid grid-cols-2 gap-2">
          {[{ value: 'membership', label: 'Μέλος (συνδρομή)' }, { value: 'drop_in', label: 'Drop-in (μεμονωμένη)' }].map((opt) => (
            <button key={opt.value} type="button" onClick={() => setBookingType(opt.value as any)}
              className={['px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer', bookingType === opt.value ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/15 text-text-secondary hover:border-primary/25'].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </FormField>
    </ModalShell>
  );
}
