// src/components/members/details/modals/DropinDebtModal.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import { X, AlertTriangle, Loader2, CheckCircle2, Clock, Wallet, Check } from 'lucide-react';

type DropinDebtRow = {
  id: string;
  price: number;
  sessionTitle: string | null;
  sessionDate: string | null;
};

export default function DropinDebtModal({
  tenantId, memberId, onClose, onUpdated, guard,
}: {
  tenantId: string;
  memberId: string;
  onClose: () => void;
  onUpdated: () => void;
  guard?: () => boolean;
}) {
  const [rows, setRows]       = useState<(DropinDebtRow & { markPaid: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      const { data, error } = await supabase
        .from('bookings')
        .select(`id, drop_in_price, drop_in_paid, class_sessions(starts_at, classes(title))`)
        .eq('tenant_id', tenantId).eq('user_id', memberId)
        .eq('booking_type', 'drop_in').eq('drop_in_paid', false);

      if (error) { setError(error.message); setRows([]); }
      else {
        setRows(((data as any[]) ?? []).map((b) => ({
          id: b.id,
          price: Number(b.drop_in_price ?? 0),
          sessionTitle: b.class_sessions?.classes?.title ?? null,
          sessionDate: b.class_sessions?.starts_at
            ? new Date(b.class_sessions.starts_at).toLocaleString('el-GR') : null,
          markPaid: false,
        })));
      }
      setLoading(false);
    })();
  }, [tenantId, memberId]);

  const toggleMarkPaid = (id: string) =>
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, markPaid: !r.markPaid } : r));

  const totalToPay = rows.filter((r) => r.markPaid).reduce((sum, r) => sum + r.price, 0);

  const onSave = async () => {
    if (guard && !guard()) return;
    setSaving(true); setError(null);
    try {
      for (const r of rows.filter((r) => r.markPaid)) {
        await supabase.from('bookings').update({ drop_in_paid: true }).eq('id', r.id);
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
              <h3 className="font-black text-text-primary tracking-tight">Οφειλή Drop-in</h3>
              <p className="text-[11px] text-text-secondary mt-px">
                {loading ? '…' : `${rows.length} απλήρωτα drop-in`}
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
              <span className="text-sm font-medium">Δεν υπάρχουν απλήρωτα drop-in.</span>
            </div>
          )}

          {!loading && rows.length > 0 && rows.map((r) => (
            <div
              key={r.id}
              className={[
                'rounded-xl border p-4 transition-all duration-150',
                r.markPaid
                  ? 'border-success/25 bg-success/5'
                  : 'border-border/10 bg-secondary/5 opacity-60',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-semibold text-text-primary truncate">
                    {r.sessionTitle ?? 'Drop-in χωρίς τίτλο'}
                  </div>
                  {r.sessionDate && (
                    <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                      <Clock className="h-3 w-3 opacity-50" />
                      {r.sessionDate}
                    </div>
                  )}
                  <div className="text-xs font-bold text-warning">
                    {r.price.toFixed(2)} €
                  </div>
                </div>

                {/* Custom checkbox */}
                <div
                  onClick={() => toggleMarkPaid(r.id)}
                  className={[
                    'w-5 h-5 rounded-md border flex items-center justify-center cursor-pointer transition-all shrink-0 mt-0.5',
                    r.markPaid ? 'bg-success border-success' : 'border-border/30 hover:border-success/50',
                  ].join(' ')}
                  title={r.markPaid ? 'Αφαίρεση εξόφλησης' : 'Σήμανση ως εξοφλημένο'}
                >
                  {r.markPaid && <Check className="h-3 w-3 text-white" />}
                </div>
              </div>

              {r.markPaid && (
                <div className="mt-2 text-[10.5px] text-success font-medium">
                  Θα σημανθεί ως εξοφλημένο
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border/10 flex items-center justify-between gap-3 shrink-0">
          {rows.length > 0 && (
            <div className="text-xs text-text-secondary">
              Σύνολο εξόφλησης:{' '}
              <span className="font-bold text-success">{totalToPay.toFixed(2)} €</span>
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
              disabled={saving || rows.filter((r) => r.markPaid).length === 0}
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