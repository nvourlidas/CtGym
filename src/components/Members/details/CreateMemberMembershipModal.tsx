import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale/el';
import { CreditCard, X, AlertTriangle, Loader2, Tag, Calendar, BadgePercent, Euro, ChevronDown } from 'lucide-react';

type Plan = {
  id: string;
  name: string;
  plan_kind: string;
  duration_days: number | null;
  session_credits: number | null;
  price: number | null;
};

function dateToISODate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

export default function CreateMemberMembershipModal({
  tenantId, memberId, onClose,
}: {
  tenantId: string;
  memberId: string;
  onClose: () => void;
}) {
  const [plans, setPlans]                   = useState<Plan[]>([]);
  const [planId, setPlanId]                 = useState('');
  const [startsAt, setStartsAt]             = useState<Date | null>(new Date());
  const [customPrice, setCustomPrice]       = useState<number | null>(null);
  const [discountReason, setDiscountReason] = useState('');
  const [debt, setDebt]                     = useState<number>(0);
  const [busy, setBusy]                     = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('membership_plans')
        .select('id,name,plan_kind,duration_days,session_credits,price')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      setPlans((data as any[]) ?? []);
    })();
  }, [tenantId]);

  const selectedPlan   = useMemo(() => plans.find((p) => p.id === planId) ?? null, [plans, planId]);
  const basePrice      = selectedPlan?.price ?? null;
  const effectivePrice = customPrice != null ? customPrice : basePrice;
  const discount       = basePrice != null && effectivePrice != null ? basePrice - effectivePrice : null;
  const hasDiscount    = discount != null && discount !== 0;

  const submit = async () => {
    if (!planId) { setError('Πρέπει να επιλέξετε πλάνο.'); return; }
    setBusy(true); setError(null);

    const res = await supabase.functions.invoke('membership-create', {
      body: {
        tenant_id: tenantId, user_id: memberId, plan_id: planId,
        starts_at: startsAt ? dateToISODate(startsAt) : null,
        debt, custom_price: customPrice,
        discount_reason: discountReason || null,
      },
    });

    setBusy(false);

    if (res.error || (res.data as any)?.error) {
      setError(res.error?.message ?? (res.data as any)?.error ?? 'Αποτυχία δημιουργίας.');
      return;
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="w-full max-w-lg rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-2xl overflow-hidden"
        style={{ animation: 'membershipModalIn 0.2s ease' }}
      >
        {/* Top accent bar */}
        <div className="h-0.75 w-full bg-linear-to-r from-primary/0 via-primary to-primary/0" />

        {/* Header */}
        <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
              <CreditCard className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-black text-text-primary tracking-tight">Νέα Συνδρομή</h2>
              <p className="text-[11px] text-text-secondary mt-px">Επιλέξτε πλάνο και ρυθμίσεις</p>
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
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">

          {error && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
              {error}
            </div>
          )}

          {/* Plan selector */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary">
              <Tag className="h-3 w-3 opacity-60" />
              Πλάνο *
            </label>
            <div className="relative">
              <select
                className="w-full h-10 pl-3.5 pr-9 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary appearance-none outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer"
                value={planId}
                onChange={(e) => { setPlanId(e.target.value); setCustomPrice(null); }}
              >
                <option value="">— Επιλογή πλάνου —</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            </div>

            {/* Selected plan details */}
            {selectedPlan && (
              <div className="rounded-xl border border-border/10 bg-secondary/5 px-4 py-3 grid grid-cols-3 gap-3">
                {[
                  { label: 'Τιμή',       value: basePrice != null ? `${basePrice}€` : '—' },
                  { label: 'Διάρκεια',   value: selectedPlan.duration_days != null ? `${selectedPlan.duration_days} μέρες` : '—' },
                  { label: 'Συνεδρίες', value: selectedPlan.session_credits != null ? String(selectedPlan.session_credits) : '—' },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="text-[10px] text-text-secondary font-bold uppercase tracking-wider mb-0.5">{item.label}</div>
                    <div className="text-sm font-bold text-text-primary">{item.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Custom price */}
          {basePrice != null && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary">
                <Euro className="h-3 w-3 opacity-60" />
                Τελική τιμή (€)
              </label>
              <div className="flex items-center gap-3">
                <input
                  className="h-10 w-36 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                  type="number"
                  value={customPrice ?? ''}
                  placeholder={basePrice.toString()}
                  onChange={(e) => setCustomPrice(e.target.value === '' ? null : Number(e.target.value))}
                />
                {hasDiscount && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg border border-accent/25 bg-accent/10 text-accent">
                    <BadgePercent className="h-3 w-3" />
                    -{discount}€
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text-secondary">
                Κανονική τιμή: <span className="font-semibold">{basePrice}€</span>
                {hasDiscount && <span className="text-accent ml-2">· Έκπτωση: {discount}€</span>}
              </p>
            </div>
          )}

          {/* Discount reason */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary">
              <BadgePercent className="h-3 w-3 opacity-60" />
              Λόγος έκπτωσης
            </label>
            <input
              className="w-full h-10 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary"
              placeholder="Προαιρετικό…"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
            />
          </div>

          {/* Start date */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary">
              <Calendar className="h-3 w-3 opacity-60" />
              Έναρξη
            </label>
            <DatePicker
              selected={startsAt}
              onChange={(d) => setStartsAt(d)}
              dateFormat="dd/MM/yyyy"
              locale={el}
              className="h-10 w-full px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all"
              wrapperClassName="w-full"
            />
          </div>

          {/* Debt */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary">
              <Euro className="h-3 w-3 opacity-60" />
              Οφειλή (€)
            </label>
            <input
              className="h-10 w-36 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
              type="number"
              value={debt}
              onChange={(e) => setDebt(Number(e.target.value))}
            />
            {debt > 0 && (
              <p className="text-[11px] text-warning">
                Η συνδρομή θα δημιουργηθεί με οφειλή {debt}€.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border/10 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
          >
            Ακύρωση
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="
              group relative inline-flex items-center justify-center gap-2 h-9 px-5 rounded-xl
              text-sm font-bold text-white bg-primary hover:bg-primary/90
              shadow-sm shadow-primary/20 hover:-translate-y-px active:translate-y-0
              disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0
              transition-all duration-150 cursor-pointer overflow-hidden
            "
          >
            <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
            {busy
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /><span className="relative z-10">Δημιουργία…</span></>
              : <span className="relative z-10">Δημιουργία</span>
            }
          </button>
        </div>
      </div>

      <style>{`
        @keyframes membershipModalIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
}