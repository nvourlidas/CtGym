import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import type { GymClass, SessionRow } from '../types';
import { isoToTimeInput, dateAndTimeToUtcIso } from '../sessionUtils';
import ModalShell from '../components/ModalShell';
import SessionFormFields from '../components/SessionFormFields';
import PrimaryButton from '../components/PrimaryButton';

type Props = {
  row: SessionRow;
  classes: GymClass[];
  onClose: () => void;
  setError: (s: string | null) => void;
};

export default function EditSessionModal({ row, classes, onClose, setError }: Props) {
  const [classId, setClassId]                     = useState(row.class_id);
  const [date, setDate]                           = useState<Date | null>(() => new Date(row.starts_at));
  const [startTime, setStartTime]                 = useState(() => isoToTimeInput(row.starts_at));
  const [endTime, setEndTime]                     = useState(() => isoToTimeInput(row.ends_at));
  const [capacity, setCapacity]                   = useState(row.capacity ?? 20);
  const [cancelBeforeHours, setCancelBeforeHours] = useState(row.cancel_before_hours != null ? String(row.cancel_before_hours) : '');
  const [busy, setBusy]                           = useState(false);

  const submit = async () => {
    if (!classId || !date || !startTime || !endTime) { alert('Συμπληρώστε τμήμα, ημερομηνία, ώρα έναρξης και ώρα λήξης.'); return; }
    const startsIso = dateAndTimeToUtcIso(date, startTime);
    const endsIso   = dateAndTimeToUtcIso(date, endTime);
    if (new Date(endsIso) <= new Date(startsIso)) { alert('Η ώρα λήξης πρέπει να είναι μετά την ώρα έναρξης.'); return; }
    setBusy(true);
    const res = await supabase.functions.invoke('session-update', {
      body: { id: row.id, class_id: classId, starts_at: startsIso, ends_at: endsIso, capacity, cancel_before_hours: cancelBeforeHours !== '' ? Number(cancelBeforeHours) : null },
    });
    setBusy(false);
    if (res.error || (res.data as any)?.error) { setError(res.error?.message ?? (res.data as any)?.error ?? 'Save failed'); return; }
    setError(null); onClose();
  };

  return (
    <ModalShell
      title="Επεξεργασία Συνεδρίας"
      icon={<Pencil className="h-4 w-4 text-primary" />}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Ακύρωση</button>
        <PrimaryButton busy={busy} busyLabel="Αποθήκευση…" label="Αποθήκευση" onClick={submit} />
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
