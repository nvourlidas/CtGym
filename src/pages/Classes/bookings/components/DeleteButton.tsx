import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';

export default function DeleteButton({ id, onDeleted, onError, guard }: {
  id: string; onDeleted: () => void;
  onError: (title: string, message: string) => void;
  guard: () => boolean;
}) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (guard && !guard()) return;
    if (!confirm('Διαγραφή αυτής της κράτησης; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.')) return;
    setBusy(true);
    const res = await supabase.functions.invoke('booking-delete', { body: { id } });
    setBusy(false);
    const errMsg = (res.data as any)?.error ?? res.error?.message ?? '';
    if (res.error || (res.data as any)?.error) {
      onError('Σφάλμα διαγραφής κράτησης', errMsg || 'Η διαγραφή απέτυχε.');
    } else {
      onDeleted();
    }
  };

  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-danger/20 text-danger hover:bg-danger/10 disabled:opacity-40 transition-all cursor-pointer"
      aria-label="Διαγραφή κράτησης"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
