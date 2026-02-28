// src/components/members/details/modals/MembershipDebtModal.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import { X, AlertTriangle, Loader2, CheckCircle2, Wallet, Euro } from 'lucide-react';

type MembershipDebtRow = {
  id: string;
  debt: number;
  planPrice: number | null;
  customPrice: number | null;
};

export default function MembershipDebtModal({
  tenantId, memberId, onClose, onUpdated, guard,
}: {
  tenantId: string;
  memberId: string;
  onClose: () => void;
  onUpdated: () => void;
  guard?: () => boolean;
}) {
  const [rows, setRows]       = useState<MembershipDebtRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      const { data, error } = await supabase
        .from('memberships').select('id,debt,plan_price,custom_price')
        .eq('tenant_id', tenantId).eq('user_id', memberId).gt('debt', 0);

      if (error) { setError(error.message); setRows([]); }
      else {
        setRows(((data as any[]) ?? []).map((m) => ({
          id: m.id,
          debt: Number(m.debt ?? 0),
          planPrice: m.plan_price ?? null,
          customPrice: m.custom_price ?? null,
        })));
      }
      setLoading(false);
    })();
  }, [tenantId, memberId]);

  const onChangeDebt = (id: string, newValue: string) =>
    setRows((prev) => prev.map((r) =>
      r.id === id ? { ...r, debt: Number.isNaN(Number(newValue)) ? r.debt : Number(newValue) } : r));

  const totalDebt = rows.reduce((sum, r) => sum + r.debt, 0);

  const onSave = async () => {
    if (guard && !guard()) return;
    setSaving(true); setError(null);
    try {
      for (const r of rows) {
        await supabase.from('memberships').update({ debt: r.debt }).eq('id', r.id);
      }
      onUpdated(); onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Σφάλμα κατά την αποθήκευση');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-xl rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        style={{ animation: 'debtModalIn 0.2s ease' }}
      >
        {/* Top bar */}
        <div className="h-[3px] w-full bg-gradient-to-r from-warning/0 via-warning/70 to-warning/0 shrink-0" />

        {/* Header */}
        <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-warning/15 border border-warning/25 flex items-center justify-center shrink-0">
              <Wallet className="h-4 w-4 text-warning" />
            </div>
            <div>
              <h3 className="font-black text-text-primary tracking-tight">Οφειλή Συνδρομών</h3>
              <p className="text-[11px] text-text-secondary mt-px">
                {loading ? '…' : `${rows.length} συνδρομές με οφειλή`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl border border-border/10 hover:bg-secondary/30 text-text-secondary hover:text-text-primary transition-all cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {error && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-px" />
              {error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-text-secondary text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-10 text-text-secondary">
              <CheckCircle2 className="h-8 w-8 text-success opacity-60" />
              <span className="text-sm font-medium">Δεν υπάρχουν συνδρομές με οφειλή.</span>
            </div>
          )}

          {!loading && rows.map((r, idx) => (
            <div key={r.id} className="rounded-xl border border-border/10 bg-secondary/5 overflow-hidden">
              {/* Row header */}
              <div className="px-4 py-2.5 border-b border-border/10 bg-secondary/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-warning/15 border border-warning/20 flex items-center justify-center text-[10px] font-bold text-warning shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-semibold text-text-primary">Συνδρομή μέλους</span>
                </div>
                <span className={[
                  'text-xs font-bold px-2 py-0.5 rounded-lg border',
                  r.debt > 0
                    ? 'border-warning/25 bg-warning/10 text-warning'
                    : 'border-success/25 bg-success/10 text-success',
                ].join(' ')}>
                  {r.debt > 0 ? `${r.debt.toFixed(2)} €` : 'Εξοφλημένη'}
                </span>
              </div>

              {/* Prices */}
              <div className="px-4 py-3 space-y-2">
                {(r.planPrice != null || r.customPrice != null) && (
                  <div className="grid grid-cols-2 gap-2">
                    {r.planPrice != null && (
                      <div className="rounded-lg border border-border/10 bg-secondary/5 px-2.5 py-2">
                        <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">Βασική τιμή</div>
                        <div className="text-xs font-bold text-text-primary">{r.planPrice.toFixed(2)} €</div>
                      </div>
                    )}
                    {r.customPrice != null && (
                      <div className="rounded-lg border border-border/10 bg-secondary/5 px-2.5 py-2">
                        <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">Τιμή μέλους</div>
                        <div className="text-xs font-bold text-accent">{r.customPrice.toFixed(2)} €</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Editable debt */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary">
                    <Euro className="h-3 w-3 opacity-60" />
                    Οφειλή (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="h-9 w-36 px-3 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                    value={r.debt}
                    onChange={(e) => onChangeDebt(r.id, e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border/10 flex items-center justify-between gap-3 shrink-0">
          {rows.length > 0 && (
            <div className="text-xs text-text-secondary">
              Συνολική οφειλή:{' '}
              <span className={['font-bold', totalDebt > 0 ? 'text-warning' : 'text-success'].join(' ')}>
                {totalDebt.toFixed(2)} €
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
            >
              Ακύρωση
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="
                group relative inline-flex items-center gap-2 h-9 px-5 rounded-xl
                text-sm font-bold text-white bg-primary hover:bg-primary/90
                shadow-sm shadow-primary/20 hover:-translate-y-px active:translate-y-0
                disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0
                transition-all duration-150 cursor-pointer overflow-hidden
              "
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
              {saving
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /><span className="relative z-10">Αποθήκευση…</span></>
                : <span className="relative z-10">Αποθήκευση</span>}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes debtModalIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
}