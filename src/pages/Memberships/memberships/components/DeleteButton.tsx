import { useState } from 'react';
import { Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';

export default function DeleteButton({ id, tenantId, onDeleted, guard }: {
  id: string; tenantId: string; onDeleted: () => void; guard: () => boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const handleClick = () => {
    if (guard && !guard()) return;
    setOpen(true);
  };

  const handleConfirm = async () => {
    setBusy(true);
    const res = await supabase.functions.invoke('membership-delete', { body: { id, tenant_id: tenantId } });
    setBusy(false);
    setOpen(false);
    if (!(res.error || (res.data as any)?.error)) onDeleted();
  };

  return (
    <>
      <button type="button" onClick={handleClick} disabled={busy}
        className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-danger/20 text-danger hover:bg-danger/10 disabled:opacity-40 transition-all cursor-pointer"
        aria-label="Διαγραφή συνδρομής"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border/15 bg-secondary-background shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/10 border border-danger/20 shrink-0">
                <AlertTriangle className="h-5 w-5 text-danger" />
              </div>
              <div>
                <h3 className="font-bold text-text-primary text-sm">Διαγραφή συνδρομής</h3>
                <p className="text-xs text-text-secondary mt-0.5">Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.</p>
              </div>
            </div>
            <p className="text-sm text-text-secondary mb-6">
              Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή τη συνδρομή;
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setOpen(false)} disabled={busy}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-border/20 text-text-secondary hover:bg-secondary/20 disabled:opacity-40 transition-all cursor-pointer">
                Ακύρωση
              </button>
              <button type="button" onClick={handleConfirm} disabled={busy}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-danger text-white hover:bg-danger/90 disabled:opacity-40 transition-all cursor-pointer inline-flex items-center gap-2">
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Διαγραφή
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
