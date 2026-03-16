import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

type Props = { id: string; onDeleted: () => void; guard?: () => boolean };

export default function DeleteButton({ id, onDeleted, guard }: Props) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (guard && !guard()) return;
    if (!confirm('Διαγραφή αυτού του τμήματος; Αυτό δεν μπορεί να αναιρεθεί.')) return;
    setBusy(true);
    await supabase.functions.invoke('class-delete', { body: { id } });
    setBusy(false);
    onDeleted();
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-danger/20 text-danger hover:bg-danger/10 disabled:opacity-50 transition-all cursor-pointer"
      aria-label="Διαγραφή τμήματος"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
