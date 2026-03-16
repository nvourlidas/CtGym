import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';

export default function DeleteButton({ id, tenantId, onDeleted, guard }: {
  id: string; tenantId: string; onDeleted: () => void; guard: () => boolean;
}) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (guard && !guard()) return;
    if (!confirm('Ειστε σίγουρος για τη διαγραφή συνδρομής;')) return;
    setBusy(true);
    const res = await supabase.functions.invoke('membership-delete', { body: { id, tenant_id: tenantId } });
    setBusy(false);
    if (res.error || (res.data as any)?.error) { alert(res.error?.message ?? (res.data as any)?.error ?? 'Delete failed'); }
    else { onDeleted(); }
  };

  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-danger/20 text-danger hover:bg-danger/10 disabled:opacity-40 transition-all cursor-pointer"
      aria-label="Διαγραφή συνδρομής"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
