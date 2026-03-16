import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';

type Props = {
  id: string;
  onDeleted: () => void;
  setError: (s: string | null) => void;
  guard: () => boolean;
};

export default function DeleteButton({ id, onDeleted, setError, guard }: Props) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (guard && !guard()) return;
    if (!confirm('Διαγραφή αυτής της συνεδρίας; Αυτή η ενέργεια δεν μπορεί να ακυρωθεί.')) return;
    setBusy(true);
    const res = await supabase.functions.invoke('session-delete', { body: { id } });
    setBusy(false);
    if (res.error) { setError(res.error.message ?? 'Η διαγραφή απέτυχε'); }
    else if ((res.data as any)?.error) { setError((res.data as any).error); }
    else { setError(null); onDeleted(); }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-danger/20 text-danger hover:bg-danger/10 disabled:opacity-40 transition-all cursor-pointer"
      aria-label="Διαγραφή συνεδρίας"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
