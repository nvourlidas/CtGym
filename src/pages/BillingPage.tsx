// src/pages/BillingPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import {
  CalendarClock,
  CheckCircle2,
  CreditCard,
  History,
  XCircle,
  Sparkles,
} from 'lucide-react';
import PlanPickerModal from '../components/billing/PlanPickerModal';

type PlanRow = {
  id: string;
  name: string;
  includes_mobile: boolean;
  monthly_price_cents: number;
  currency: string;
  is_active?: boolean;
};

type TenantSubscriptionRow = {
  tenant_id: string;
  plan_id: string;
  status: 'active' | 'past_due' | 'inactive' | 'canceled' | 'trial';
  current_period_start: string | null;
  current_period_end: string | null;
  grace_until: string | null;
  notes: string | null;
  subscription_plans?: PlanRow | PlanRow[] | null;
};

type TenantPaymentRow = {
  id: string;
  tenant_id: string;
  plan_id: string | null;
  period_start: string;
  period_end: string;
  amount_cents: number;
  currency: string;
  method: 'manual' | 'bank_transfer' | 'cash' | 'card' | 'open_banking';
  reference: string | null;
  marked_at: string;
  subscription_plans?: { id: string; name: string } | null;
};

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('el-GR');
}

function fmtMoney(cents: number, currency: string) {
  const val = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat('el-GR', {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 2,
    }).format(val);
  } catch {
    return `${val.toFixed(2)} ${currency || 'EUR'}`;
  }
}

function normalizePlan(p: TenantSubscriptionRow['subscription_plans']): PlanRow | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

function isAllowedNow(sub: TenantSubscriptionRow | null) {
  if (!sub) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = sub.current_period_end ? new Date(sub.current_period_end) : null;
  const grace = sub.grace_until ? new Date(sub.grace_until) : null;

  if (end) {
    end.setHours(0, 0, 0, 0);
    if (end.getTime() >= today.getTime()) {
      if (sub.status === 'active' || sub.status === 'trial' || sub.status === 'canceled') return true;
    }
  }

  if (sub.status === 'past_due' && grace) {
    grace.setHours(0, 0, 0, 0);
    if (grace.getTime() >= today.getTime()) return true;
  }

  return false;
}

export default function BillingPage() {
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<TenantSubscriptionRow | null>(null);
  const [payments, setPayments] = useState<TenantPaymentRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutErr, setCheckoutErr] = useState<string | null>(null);

  const [plansModalOpen, setPlansModalOpen] = useState(false);

  const currentPlan = useMemo(() => normalizePlan(sub?.subscription_plans), [sub]);
  const allowed = useMemo(() => isAllowedNow(sub), [sub]);

  useEffect(() => {
    if (!profile?.tenant_id) return;

    const load = async () => {
      setLoading(true);
      setErr(null);

      try {
        const { data: subData, error: subError } = await supabase
          .from('tenant_subscriptions')
          .select(
            `
            tenant_id,
            plan_id,
            status,
            current_period_start,
            current_period_end,
            grace_until,
            notes,
            subscription_plans (
              id,
              name,
              includes_mobile,
              monthly_price_cents,
              currency,
              is_active
            )
          `,
          )
          .eq('tenant_id', profile.tenant_id)
          .maybeSingle();

        if (subError) throw subError;

        const { data: payData, error: payError } = await supabase
          .from('tenant_payments')
          .select(
            `
              id,
              tenant_id,
              plan_id,
              period_start,
              period_end,
              amount_cents,
              currency,
              method,
              reference,
              marked_at,
              subscription_plans (
                id,
                name
              )
            `,
          )
          .eq('tenant_id', profile.tenant_id)
          .order('marked_at', { ascending: false })
          .limit(100);

        if (payError) throw payError;

        const { data: planData, error: planError } = await supabase
          .from('subscription_plans')
          .select('id,name,includes_mobile,monthly_price_cents,currency,is_active')
          .eq('is_active', true)
          .order('monthly_price_cents', { ascending: true });

        if (planError) throw planError;

        setSub((subData as any) ?? null);
        setPayments((payData as any[]) ?? []);
        setPlans((planData as any[]) ?? []);
      } catch (e: any) {
        console.error(e);
        setErr(e?.message ?? 'Κάτι πήγε στραβά.');
        setSub(null);
        setPayments([]);
        setPlans([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [profile?.tenant_id]);

  async function startCheckout(planId: string) {
    if (!profile?.tenant_id) return;

    setCheckoutBusy(true);
    setCheckoutErr(null);

    try {
      const { data, error } = await supabase.functions.invoke('viva-create-checkout', {
        body: {
          tenant_id: profile.tenant_id,
          plan_id: planId,
          customer_email: (profile as any)?.email ?? null,
          customer_full_name: (profile as any)?.full_name ?? null,
          request_lang: 'el',
          return_url: window.location.href,
        },
      });

      if (error) throw error;

      const checkoutUrl = (data as any)?.checkoutUrl as string | undefined;
      if (!checkoutUrl) throw new Error('Δεν βρέθηκε checkout URL από Viva.');

      window.location.href = checkoutUrl;
    } catch (e: any) {
      console.error(e);
      setCheckoutErr(e?.message ?? 'Αποτυχία δημιουργίας checkout.');
    } finally {
      setCheckoutBusy(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Billing</h1>
          <p className="text-sm text-text-secondary">
            Προβολή πλάνου, κατάστασης συνδρομής και ιστορικού πληρωμών.
          </p>
        </div>

        <button
          onClick={() => setPlansModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-md border border-border/10 bg-secondary/10 hover:bg-secondary/20 px-3 py-2 text-sm font-semibold"
        >
          <Sparkles className="h-4 w-4 opacity-80" />
          Δες πλάνα
        </button>
      </div>

      <PlanPickerModal
        open={plansModalOpen}
        plans={plans}
        currentPlanId={sub?.plan_id ?? null}
        busy={checkoutBusy}
        error={checkoutErr}
        onClose={() => setPlansModalOpen(false)}
        onSubscribe={(planId) => startCheckout(planId)}
      />

      {loading && (
        <div className="rounded-md border border-border/10 p-4 text-sm opacity-70">Loading…</div>
      )}

      {!loading && err && (
        <div className="rounded-md border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
          {err}
        </div>
      )}

      {!loading && !err && (
        <>
          {/* Current subscription */}
          <div className="rounded-md border border-border/10 bg-secondary/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CreditCard className="h-4 w-4 opacity-80" />
              <span>Τρέχον πλάνο</span>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-md border border-border/10 bg-secondary-background/40 p-3">
                <div className="text-xs text-text-secondary">Πλάνο</div>
                <div className="mt-1 text-sm font-semibold">
                  {currentPlan?.name ?? (sub?.plan_id ? sub.plan_id : '—')}
                </div>
                <div className="mt-1 text-xs text-text-secondary">
                  Mobile:{' '}
                  <span className="font-medium text-text-primary">
                    {currentPlan ? (currentPlan.includes_mobile ? 'Ναι' : 'Όχι') : '—'}
                  </span>
                </div>
              </div>

              <div className="rounded-md border border-border/10 bg-secondary-background/40 p-3">
                <div className="text-xs text-text-secondary">Κατάσταση</div>
                <div className="mt-1 flex items-center gap-2">
                  {allowed ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                      <span className="text-sm font-semibold">Ενεργή</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-300" />
                      <span className="text-sm font-semibold">Μη ενεργή</span>
                    </>
                  )}
                </div>
                <div className="mt-1 text-xs text-text-secondary">
                  Status:{' '}
                  <span className="text-text-primary font-medium">{sub?.status ?? '—'}</span>
                </div>
              </div>

              <div className="rounded-md border border-border/10 bg-secondary-background/40 p-3">
                <div className="text-xs text-text-secondary">Περίοδος</div>
                <div className="mt-1 text-sm">
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <CalendarClock className="h-4 w-4 opacity-70" />
                    <span>
                      {fmtDate(sub?.current_period_start)} → {fmtDate(sub?.current_period_end)}
                    </span>
                  </div>
                  {sub?.grace_until ? (
                    <div className="mt-1 text-xs text-text-secondary">
                      Grace έως:{' '}
                      <span className="text-text-primary font-medium">{fmtDate(sub.grace_until)}</span>
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-text-secondary">Grace: —</div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 text-xs text-text-secondary">
              * Οι αλλαγές συνδρομής/ενεργοποίησης γίνονται αυτόματα μέσω πληρωμών (Viva) ή από εμάς (CloudTec).
            </div>
          </div>

          {/* Payment history */}
          <div className="rounded-md border border-border/10 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-secondary-background/50">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <History className="h-4 w-4 opacity-80" />
                <span>Ιστορικό πληρωμών</span>
              </div>
              <div className="text-xs text-text-secondary">
                {payments.length > 0 ? `${payments.length} εγγραφές` : '—'}
              </div>
            </div>

            {payments.length === 0 ? (
              <div className="px-4 py-4 text-sm text-text-secondary">Δεν υπάρχουν καταγεγραμμένες πληρωμές.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-190 text-sm">
                  <thead className="bg-secondary-background/60">
                    <tr className="text-left">
                      <th className="px-4 py-2 font-semibold">Ημ/νία</th>
                      <th className="px-4 py-2 font-semibold">Περίοδος</th>
                      <th className="px-4 py-2 font-semibold">Πλάνο</th>
                      <th className="px-4 py-2 font-semibold">Ποσό</th>
                      <th className="px-4 py-2 font-semibold">Μέθοδος</th>
                      <th className="px-4 py-2 font-semibold">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-t border-border/10 hover:bg-secondary/10">
                        <td className="px-4 py-2">{fmtDate(p.marked_at)}</td>
                        <td className="px-4 py-2 text-xs text-text-secondary">
                          {fmtDate(p.period_start)} → {fmtDate(p.period_end)}
                        </td>
                        <td className="px-4 py-2 text-xs">{p.subscription_plans?.name ?? '—'}</td>
                        <td className="px-4 py-2 font-medium">{fmtMoney(p.amount_cents, p.currency)}</td>
                        <td className="px-4 py-2 text-xs">
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-white/5 border border-border/10">
                            {p.method}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-text-secondary">
                          {p.reference ? <span className="text-text-primary">{p.reference}</span> : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Mobile-friendly payment list */}
          <div className="md:hidden rounded-md border border-border/10 overflow-hidden">
            <div className="px-4 py-3 bg-secondary-background/50 text-sm font-semibold flex items-center gap-2">
              <History className="h-4 w-4 opacity-80" />
              <span>Ιστορικό πληρωμών</span>
            </div>
            {payments.length === 0 ? (
              <div className="px-4 py-4 text-sm text-text-secondary">Δεν υπάρχουν καταγεγραμμένες πληρωμές.</div>
            ) : (
              payments.slice(0, 30).map((p) => (
                <div key={p.id} className="border-t border-border/10 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{fmtMoney(p.amount_cents, p.currency)}</div>
                      <div className="text-xs text-text-secondary mt-0.5">
                        {fmtDate(p.period_start)} → {fmtDate(p.period_end)}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-text-secondary">
                      Πλάνο:{' '}
                      <span className="text-text-primary font-medium">
                        {p.subscription_plans?.name ?? '—'}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-text-secondary">{fmtDate(p.marked_at)}</div>
                      <div className="mt-1 text-xs">
                        <span className="inline-flex items-center px-2 py-1 rounded-full bg-white/5 border border-border/10">
                          {p.method}
                        </span>
                      </div>
                    </div>
                  </div>
                  {p.reference && (
                    <div className="mt-2 text-xs text-text-secondary">
                      Ref: <span className="text-text-primary">{p.reference}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
