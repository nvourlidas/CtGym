// src/components/members/details/modals/DropinDebtModal.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';

type DropinDebtRow = {
  id: string;
  price: number;
  sessionTitle: string | null;
  sessionDate: string | null;
};

export default function DropinDebtModal({
  tenantId,
  memberId,
  onClose,
  onUpdated,
  guard,
}: {
  tenantId: string;
  memberId: string;
  onClose: () => void;
  onUpdated: () => void;
  guard?: () => boolean;
}) {
  const [rows, setRows] = useState<(DropinDebtRow & { markPaid: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('bookings')
        .select(
          `
          id,
          drop_in_price,
          drop_in_paid,
          class_sessions(
            starts_at,
            classes(title)
          )
        `
        )
        .eq('tenant_id', tenantId)
        .eq('user_id', memberId)
        .eq('booking_type', 'drop_in')
        .eq('drop_in_paid', false);

      if (error) {
        setError(error.message);
        setRows([]);
      } else {
        const mapped: (DropinDebtRow & { markPaid: boolean })[] = ((data as any[]) ?? []).map((b) => ({
          id: b.id,
          price: Number(b.drop_in_price ?? 0),
          sessionTitle: b.class_sessions?.classes?.title ?? null,
          sessionDate: b.class_sessions?.starts_at
            ? new Date(b.class_sessions.starts_at).toLocaleString('el-GR')
            : null,
          markPaid: true, // default: mark all as paid
        }));
        setRows(mapped);
      }

      setLoading(false);
    })();
  }, [tenantId, memberId]);

  const toggleMarkPaid = (id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, markPaid: !r.markPaid } : r)));
  };

  const onSave = async () => {
    if (guard && !guard()) return;
    setSaving(true);
    setError(null);

    try {
      const toPay = rows.filter((r) => r.markPaid);

      for (const r of toPay) {
        await supabase.from('bookings').update({ drop_in_paid: true }).eq('id', r.id);
      }

      onUpdated();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Σφάλμα κατά την αποθήκευση');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-lg border border-border/10 bg-secondary-background text-text-primary shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/10 px-4 py-3">
          <h3 className="text-sm font-semibold">Οφειλή Drop-in</h3>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-text-secondary hover:bg-border/5"
          >
            ✕
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto text-sm">
          {error && (
            <div className="mb-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-danger text-xs">
              {error}
            </div>
          )}

          {loading && <div>Φόρτωση…</div>}

          {!loading && rows.length === 0 && (
            <div className="text-text-secondary text-sm">Δεν υπάρχουν απλήρωτα drop-in.</div>
          )}

          {!loading && rows.length > 0 && (
            <div className="space-y-3">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="rounded border border-border/10 bg-black/5 p-3 flex flex-col gap-1"
                >
                  <div className="text-xs text-text-secondary">
                    {r.sessionTitle ?? 'Drop-in χωρίς τίτλο'}
                  </div>

                  {r.sessionDate && (
                    <div className="text-xs text-text-secondary">Ημ/νία: {r.sessionDate}</div>
                  )}

                  <div className="text-xs text-text-secondary">Ποσό: {r.price.toFixed(2)} €</div>

                  <label className="mt-1 inline-flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/30 bg-transparent"
                      checked={r.markPaid}
                      onChange={() => toggleMarkPaid(r.id)}
                    />
                    <span>Εξόφληση αυτού του drop-in</span>
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3 text-sm">
          <button className="btn-secondary" onClick={onClose}>
            Ακύρωση
          </button>
          <button className="btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
          </button>
        </div>
      </div>
    </div>
  );
}
