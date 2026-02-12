import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale/el';

type Plan = {
  id: string;
  name: string;
  plan_kind: string;
  duration_days: number | null;
  session_credits: number | null;
  price: number | null;
};

export default function CreateMemberMembershipModal({
  tenantId,
  memberId,
  onClose,
}: {
  tenantId: string;
  memberId: string;
  onClose: () => void;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState('');
  const [startsAt, setStartsAt] = useState<Date | null>(new Date());
  const [customPrice, setCustomPrice] = useState<number | null>(null);
  const [discountReason, setDiscountReason] = useState('');
  const [debt, setDebt] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('membership_plans')
        .select('id, name, plan_kind, duration_days, session_credits, price')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      setPlans((data as any[]) ?? []);
    })();
  }, [tenantId]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === planId) ?? null,
    [plans, planId],
  );

  const basePrice = selectedPlan?.price ?? null;
  const effectivePrice =
    customPrice != null ? customPrice : basePrice != null ? basePrice : null;

  const discount =
    basePrice != null && effectivePrice != null
      ? basePrice - effectivePrice
      : null;

  const submit = async () => {
    if (!planId) return;
    setBusy(true);

    const res = await supabase.functions.invoke('membership-create', {
      body: {
        tenant_id: tenantId,
        user_id: memberId,
        plan_id: planId,
        starts_at: startsAt ? dateToISODate(startsAt) : null,
        debt,
        custom_price: customPrice,
        discount_reason: discountReason || null,
      },
    });

    setBusy(false);

    if (res.error || (res.data as any)?.error) {
      alert(res.error?.message ?? (res.data as any)?.error ?? 'Create failed');
      return;
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-md border border-border/10 bg-secondary-background text-text-primary shadow-xl">
        <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
          <div className="font-semibold">Νέα Συνδρομή</div>
          <button onClick={onClose} className="rounded px-2 py-1 hover:bg-white/5">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">

          <div>
            <label className="text-sm opacity-80">Πλάνο *</label>
            <select
              className="input mt-1"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
            >
              <option value="">Επιλογή πλάνου</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {basePrice != null && (
            <div>
              <label className="text-sm opacity-80">
                Τελική τιμή (€)
              </label>
              <input
                className="input mt-1 max-w-40"
                type="number"
                value={customPrice ?? ''}
                placeholder={basePrice.toString()}
                onChange={(e) =>
                  setCustomPrice(
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
              />
              <div className="text-xs text-text-secondary mt-1">
                Κανονική: {basePrice}€
                {discount != null && discount !== 0 && (
                  <> · Έκπτωση: {discount}€</>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm opacity-80">
              Λόγος έκπτωσης
            </label>
            <input
              className="input mt-1"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm opacity-80">Έναρξη</label>
            <DatePicker
              selected={startsAt}
              onChange={(d) => setStartsAt(d)}
              dateFormat="dd/MM/yyyy"
              locale={el}
              className="input mt-1"
            />
          </div>

          <div>
            <label className="text-sm opacity-80">Οφειλή (€)</label>
            <input
              className="input mt-1"
              type="number"
              value={debt}
              onChange={(e) => setDebt(Number(e.target.value))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={onClose}>
              Ακύρωση
            </button>
            <button className="btn-primary" onClick={submit} disabled={busy}>
              {busy ? 'Δημιουργία...' : 'Δημιουργία'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function dateToISODate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
