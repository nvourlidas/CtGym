// src/components/members/details/modals/MembershipDebtModal.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';

type MembershipDebtRow = {
  id: string;
  debt: number;
  planPrice: number | null;
  customPrice: number | null;
};

export default function MembershipDebtModal({
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
  const [rows, setRows] = useState<MembershipDebtRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('memberships')
        .select('id, debt, plan_price, custom_price')
        .eq('tenant_id', tenantId)
        .eq('user_id', memberId)
        .gt('debt', 0);

      if (error) {
        setError(error.message);
        setRows([]);
      } else {
        const mapped: MembershipDebtRow[] = ((data as any[]) ?? []).map((m) => ({
          id: m.id,
          debt: Number(m.debt ?? 0),
          planPrice: m.plan_price ?? null,
          customPrice: m.custom_price ?? null,
        }));

        setRows(mapped);
      }

      setLoading(false);
    })();
  }, [tenantId, memberId]);

  const onChangeDebt = (id: string, newValue: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, debt: Number.isNaN(Number(newValue)) ? r.debt : Number(newValue) }
          : r
      )
    );
  };

  const onSave = async () => {
    if (guard && !guard()) return;
    setSaving(true);
    setError(null);

    try {
      for (const r of rows) {
        await supabase.from('memberships').update({ debt: r.debt }).eq('id', r.id);
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
          <h3 className="text-sm font-semibold">Οφειλή Συνδρομών</h3>
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
            <div className="text-text-secondary text-sm">Δεν υπάρχουν συνδρομές με οφειλή.</div>
          )}

          {!loading && rows.length > 0 && (
            <div className="space-y-3">
              {rows.map((r) => (
                <div key={r.id} className="rounded border border-border/10 p-3">
                  <div className="text-xs text-text-secondary mb-1">Συνδρομή μέλους</div>

                  {r.planPrice != null && (
                    <div className="text-xs text-text-secondary mb-1">
                      Βασική τιμή πλάνου: {r.planPrice.toFixed(2)} €
                    </div>
                  )}
                  {r.customPrice != null && (
                    <div className="text-xs text-text-secondary mb-1">
                      Τιμή μέλους (με έκπτωση): {r.customPrice.toFixed(2)} €
                    </div>
                  )}

                  <label className="block text-xs mb-1">Οφειλή (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full rounded border border-border/20 bg-black/10 px-2 py-1 text-sm"
                    value={r.debt}
                    onChange={(e) => onChangeDebt(r.id, e.target.value)}
                  />
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
