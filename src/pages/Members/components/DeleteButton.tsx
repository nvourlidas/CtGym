import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

type Props = {
  id: string;
  onDeleted: () => void;
  guard?: () => boolean;
};

export default function DeleteButton({ id, onDeleted, guard }: Props) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (guard && !guard()) return;
    if (!confirm('Διαγραφή αυτού του μέλους; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.')) return;
    setBusy(true);
    await supabase.functions.invoke('member-delete', { body: { id } });
    setBusy(false);
    onDeleted();
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-danger/25 text-danger hover:bg-danger/10 disabled:opacity-40 transition-all cursor-pointer"
      aria-label="Διαγραφή"
      title="Διαγραφή"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
