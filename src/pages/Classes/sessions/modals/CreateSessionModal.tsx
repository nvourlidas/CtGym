import { useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import type { GymClass } from '../types';
import { dateAndTimeToUtcIso } from '../sessionUtils';
import ModalShell from '../components/ModalShell';
import SessionFormFields from '../components/SessionFormFields';
import PrimaryButton from '../components/PrimaryButton';

type Props = {
  classes: GymClass[];
  tenantId: string;
  onClose: () => void;
  setError: (s: string | null) => void;
};

export default function CreateSessionModal({ classes, tenantId, onClose, setError }: Props) {
  const [classId, setClassId]                     = useState(classes[0]?.id ?? '');
  const [date, setDate]                           = useState<Date | null>(null);
  const [startTime, setStartTime]                 = useState('18:00');
  const [endTime, setEndTime]                     = useState('19:00');
  const [capacity, setCapacity]                   = useState(20);
  const [cancelBeforeHours, setCancelBeforeHours] = useState('');
  const [busy, setBusy]                           = useState(false);

  const submit = async () => {
    if (!classId || !date || !startTime || !endTime) { alert('Συμπληρώστε τμήμα, ημερομηνία, ώρα έναρξης και ώρα λήξης.'); return; }
    const startsIso = dateAndTimeToUtcIso(date, startTime);
    const endsIso   = dateAndTimeToUtcIso(date, endTime);
    if (new Date(endsIso) <= new Date(startsIso)) { alert('Η ώρα λήξης πρέπει να είναι μετά την ώρα έναρξης.'); return; }
    setBusy(true);
    const res = await supabase.functions.invoke('session-create', {
      body: { tenant_id: tenantId, class_id: classId, starts_at: startsIso, ends_at: endsIso, capacity, cancel_before_hours: cancelBeforeHours !== '' ? Number(cancelBeforeHours) : null },
    });
    setBusy(false);
    if (res.error || (res.data as any)?.error) { setError(res.error?.message ?? (res.data as any)?.error ?? 'Create failed'); return; }
    setError(null); onClose();
  };

  return (
    <ModalShell
      title="Νέα Συνεδρία"
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Ακύρωση</button>
        <PrimaryButton busy={busy} busyLabel="Δημιουργία…" label="Δημιουργία" onClick={submit} />
      </>}
    >
      <SessionFormFields
        classes={classes} classId={classId} setClassId={setClassId}
        date={date} setDate={setDate}
        startTime={startTime} setStartTime={setStartTime}
        endTime={endTime} setEndTime={setEndTime}
        capacity={capacity} setCapacity={setCapacity}
        cancelBeforeHours={cancelBeforeHours} setCancelBeforeHours={setCancelBeforeHours}
      />
    </ModalShell>
  );
}
