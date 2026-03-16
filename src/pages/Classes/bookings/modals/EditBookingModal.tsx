import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import type { Booking, StatusCode } from '../types';
import { STATUS_OPTIONS, STATUS_STYLE } from '../types';
import ModalShell from '../components/ModalShell';
import FormField from '../components/FormField';
import PrimaryButton from '../components/PrimaryButton';

export default function EditBookingModal({ row, onClose, onError }: {
  row: Booking; onClose: () => void; onError: (title: string, message: string) => void;
}) {
  const [status, setStatus] = useState<StatusCode>((row.status as StatusCode) ?? 'booked');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const res = await supabase.functions.invoke('booking-update', { body: { id: row.id, status } });
    setBusy(false);
    const errMsg = (res.data as any)?.error ?? res.error?.message ?? '';
    if (res.error || (res.data as any)?.error) { onError('Σφάλμα ενημέρωσης κράτησης', errMsg || 'Η αποθήκευση απέτυχε.'); return; }
    onClose();
  };

  return (
    <ModalShell title="Επεξεργασία Κράτησης" icon={<Pencil className="h-4 w-4 text-primary" />} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Ακύρωση</button>
        <PrimaryButton busy={busy} busyLabel="Αποθήκευση…" label="Αποθήκευση" onClick={submit} />
      </>}
    >
      <FormField label="Κατάσταση">
        <div className="grid grid-cols-2 gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" onClick={() => setStatus(opt.value)}
              className={['px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer', status === opt.value ? `${STATUS_STYLE[opt.value]} border-opacity-60` : 'border-border/15 text-text-secondary hover:border-primary/25'].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </FormField>
    </ModalShell>
  );
}
