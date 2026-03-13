// src/pages/BillingPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import {
  CalendarClock, CheckCircle2, CreditCard, History, XCircle,
  Sparkles, RefreshCcw, Loader2, AlertTriangle, Receipt,
  ArrowRight, Smartphone, Clock3,
} from 'lucide-react';
import PlanPickerModal from '../../components/billing/PlanPickerModal';

type PlanRow = {
  id: string; name: string; includes_mobile: boolean;
  monthly_price_cents: number; currency: string; is_active?: boolean;
};
type TenantSubscriptionRow = {
  tenant_id: string; plan_id: string;
  status: 'active' | 'past_due' | 'inactive' | 'canceled' | 'trial';
  current_period_start: string | null; current_period_end: string | null;
  grace_until: string | null; notes: string | null;
  subscription_plans?: PlanRow | PlanRow[] | null;
};
type TenantPaymentRow = {
  id: string; tenant_id: string; plan_id: string | null;
  period_start: string; period_end: string; amount_cents: number;
  currency: string; method: 'manual' | 'bank_transfer' | 'cash' | 'card' | 'open_banking';
  reference: string | null; marked_at: string;
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
      style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 2,
    }).format(val);
  } catch { return `${val.toFixed(2)} ${currency || 'EUR'}`; }
}
function normalizePlan(p: TenantSubscriptionRow['subscription_plans']): PlanRow | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}
function isAllowedNow(sub: TenantSubscriptionRow | null) {
  if (!sub) return false;
  return ['active', 'trial'].includes(sub.status);
}

const METHOD_LABELS: Record<string, string> = {
  manual: 'Χειροκίνητο', bank_transfer: 'Τραπεζική μεταφορά',
  cash: 'Μετρητά', card: 'Κάρτα', open_banking: 'Open Banking',
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active:   { label: 'Ενεργή',        cls: 'border-success/35 bg-success/10 text-success'           },
  trial:    { label: 'Δοκιμαστική',   cls: 'border-sky-500/35 bg-sky-500/10 text-sky-400'           },
  canceled: { label: 'Ακυρωμένη',     cls: 'border-warning/35 bg-warning/10 text-warning'           },
  past_due: { label: 'Ληξιπρόθεσμη',  cls: 'border-danger/35 bg-danger/10 text-danger'              },
  inactive: { label: 'Ανενεργή',      cls: 'border-border/25 bg-secondary/10 text-text-secondary'   },
};

export default function BillingPage() {
  const { profile } = useAuth();

  const [loading, setLoading]               = useState(true);
  const [sub, setSub]                       = useState<TenantSubscriptionRow | null>(null);
  const [payments, setPayments]             = useState<TenantPaymentRow[]>([]);
  const [plans, setPlans]                   = useState<PlanRow[]>([]);
  const [err, setErr]                       = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy]     = useState(false);
  const [checkoutErr, setCheckoutErr]       = useState<string | null>(null);
  const [plansModalOpen, setPlansModalOpen] = useState(false);

  const currentPlan = useMemo(() => normalizePlan(sub?.subscription_plans), [sub]);
  const allowed     = useMemo(() => isAllowedNow(sub), [sub]);
  const statusMeta  = sub?.status
    ? (STATUS_META[sub.status] ?? STATUS_META.inactive)
    : STATUS_META.inactive;

  useEffect(() => {
    if (!profile?.tenant_id) return;
    const load = async () => {
      setLoading(true); setErr(null);
      try {
        const [subRes, payRes, planRes] = await Promise.all([
          supabase.from('tenant_subscriptions')
            .select('tenant_id,plan_id,status,current_period_start,current_period_end,grace_until,notes,subscription_plans(id,name,includes_mobile,monthly_price_cents,currency,is_active)')
            .eq('tenant_id', profile.tenant_id).maybeSingle(),
          supabase.from('tenant_payments')
            .select('id,tenant_id,plan_id,period_start,period_end,amount_cents,currency,method,reference,marked_at,subscription_plans(id,name)')
            .eq('tenant_id', profile.tenant_id).order('marked_at', { ascending: false }).limit(100),
          supabase.from('subscription_plans')
            .select('id,name,includes_mobile,monthly_price_cents,currency,is_active')
            .eq('is_active', true).order('monthly_price_cents', { ascending: true }),
        ]);
        if (subRes.error) throw subRes.error;
        if (payRes.error) throw payRes.error;
        if (planRes.error) throw planRes.error;
        setSub((subRes.data as any) ?? null);
        setPayments((payRes.data as any[]) ?? []);
        setPlans((planRes.data as any[]) ?? []);
      } catch (e: any) {
        setErr(e?.message ?? 'Κάτι πήγε στραβά.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile?.tenant_id]);

  async function startCheckout(planId: string) {
    if (!profile?.tenant_id) return;
    setCheckoutBusy(true); setCheckoutErr(null);
    try {
      const { data, error } = await supabase.functions.invoke('viva-create-checkout', {
        body: {
          tenant_id: profile.tenant_id, plan_id: planId,
          customer_email: (profile as any)?.email ?? null,
          customer_full_name: (profile as any)?.full_name ?? null,
          request_lang: 'el', return_url: window.location.href,
        },
      });
      if (error) throw error;
      const url = (data as any)?.checkoutUrl as string | undefined;
      if (!url) throw new Error('Δεν βρέθηκε checkout URL από Viva.');
      window.location.href = url;
    } catch (e: any) {
      setCheckoutErr(e?.message ?? 'Αποτυχία δημιουργίας checkout.');
    } finally {
      setCheckoutBusy(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <CreditCard className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-black text-text-primary tracking-tight">Πληρωμές & Πλάνα</h1>
            <p className="text-xs text-text-secondary mt-px">
              Προβολή πλάνου, κατάστασης συνδρομής και ιστορικού πληρωμών.
            </p>
          </div>
        </div>
        <button
          onClick={() => setPlansModalOpen(true)}
          className="group relative inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-bold text-black bg-accent hover:bg-accent/90 shadow-sm shadow-accent/20 hover:-translate-y-px transition-all cursor-pointer overflow-hidden"
        >
          <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          <Sparkles className="h-3.5 w-3.5 relative z-10" />
          <span className="relative z-10">Επιλογή Πλάνου</span>
        </button>
      </div>

      <PlanPickerModal
        open={plansModalOpen} plans={plans} currentPlanId={sub?.plan_id ?? null}
        busy={checkoutBusy} error={checkoutErr}
        onClose={() => setPlansModalOpen(false)}
        onSubscribe={(planId) => startCheckout(planId)}
      />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-text-secondary">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Φόρτωση…</span>
        </div>
      )}

      {/* Error */}
      {!loading && err && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />{err}
        </div>
      )}

      {!loading && !err && (
        <>
          {/* ── Current plan ── */}
          <div className="rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border/10 flex items-center gap-2">
              <CreditCard className="h-3.5 w-3.5 text-text-secondary" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">
                Τρέχον Πλάνο
              </span>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* Plan tile */}
              <div className="rounded-xl border border-border/10 bg-secondary/5 p-4 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Πλάνο</div>
                <div className="text-xl font-black text-text-primary leading-tight">
                  {currentPlan?.name ?? (sub?.plan_id ? sub.plan_id : '—')}
                </div>
                {currentPlan && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                      <Smartphone className="h-3 w-3 shrink-0" />
                      Mobile app:&nbsp;
                      <span className={`font-bold ${currentPlan.includes_mobile ? 'text-success' : 'text-text-secondary'}`}>
                        {currentPlan.includes_mobile ? 'Ναι' : 'Όχι'}
                      </span>
                    </div>
                    <div className="text-xs text-text-secondary font-semibold">
                      {fmtMoney(currentPlan.monthly_price_cents, currentPlan.currency)}
                      <span className="opacity-50 font-normal">/μήνα</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Status tile */}
              <div className="rounded-xl border border-border/10 bg-secondary/5 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Κατάσταση</div>
                  {!allowed && sub?.plan_id && (
                    <button
                      type="button"
                      onClick={() => startCheckout(sub.plan_id)}
                      disabled={checkoutBusy}
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-bold text-black bg-accent hover:bg-accent/90 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                      {checkoutBusy
                        ? <Loader2    className="h-3 w-3 animate-spin" />
                        : <RefreshCcw className="h-3 w-3" />
                      }
                      {checkoutBusy ? 'Περίμενε…' : 'Ανανέωση'}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {allowed
                    ? <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                    : <XCircle     className="h-5 w-5 text-danger  shrink-0" />
                  }
                  <span className="font-black text-text-primary">
                    {allowed ? 'Ενεργή' : 'Μη ενεργή'}
                  </span>
                </div>
                <span className={`inline-flex text-[10.5px] font-bold px-2.5 py-1 rounded-lg border ${statusMeta.cls}`}>
                  {statusMeta.label}
                </span>
                {checkoutErr && (
                  <div className="flex items-center gap-1.5 text-xs text-danger">
                    <AlertTriangle className="h-3 w-3 shrink-0" />{checkoutErr}
                  </div>
                )}
              </div>

              {/* Period tile */}
              <div className="rounded-xl border border-border/10 bg-secondary/5 p-4 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Περίοδος</div>
                <div className="flex items-start gap-2">
                  <CalendarClock className="h-4 w-4 text-text-secondary shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <div className="text-text-secondary">
                      Έναρξη:&nbsp;
                      <span className="font-semibold text-text-primary">
                        {fmtDate(sub?.current_period_start)}
                      </span>
                    </div>
                    <div className="text-text-secondary">
                      Λήξη:&nbsp;
                      <span className="font-semibold text-text-primary">
                        {fmtDate(sub?.current_period_end)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 pb-4 text-[11px] text-text-secondary opacity-50">
              * Οι αλλαγές συνδρομής/ενεργοποίησης γίνονται αυτόματα μέσω πληρωμών (Viva) ή από εμάς (CloudTec).
            </div>
          </div>

          {/* ── Payment history — desktop ── */}
          <div className="hidden md:block rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-text-secondary" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">
                  Ιστορικό Πληρωμών
                </span>
              </div>
              {payments.length > 0 && (
                <span className="text-[11px] text-text-secondary">{payments.length} εγγραφές</span>
              )}
            </div>

            {payments.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-text-secondary">
                <Receipt className="h-7 w-7 opacity-20" />
                <span className="text-sm">Δεν υπάρχουν καταγεγραμμένες πληρωμές.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/10 bg-secondary-background/80">
                      {['Ημ/νία', 'Περίοδος', 'Πλάνο', 'Ποσό', 'Μέθοδος'].map((h, i) => (
                        <th
                          key={i}
                          className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary ${i === 3 ? 'text-right' : 'text-left'}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-t border-border/5 hover:bg-secondary/5 transition-colors">
                        <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">
                          {fmtDate(p.marked_at)}
                        </td>
                        <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {fmtDate(p.period_start)}
                            <ArrowRight className="h-3 w-3 opacity-40 shrink-0" />
                            {fmtDate(p.period_end)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-text-primary">
                          {p.subscription_plans?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-success">
                          {fmtMoney(p.amount_cents, p.currency)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-lg border border-border/15 bg-secondary/10 text-text-secondary">
                            {METHOD_LABELS[p.method] ?? p.method}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Payment history — mobile ── */}
          <div className="md:hidden rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
            <div className="px-4 py-4 border-b border-border/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-text-secondary" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">
                  Ιστορικό Πληρωμών
                </span>
              </div>
              {payments.length > 0 && (
                <span className="text-[11px] text-text-secondary">{payments.length} εγγραφές</span>
              )}
            </div>

            {payments.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-text-secondary">
                <Receipt className="h-7 w-7 opacity-20" />
                <span className="text-sm">Δεν υπάρχουν καταγεγραμμένες πληρωμές.</span>
              </div>
            ) : (
              payments.slice(0, 30).map((p) => (
                <div key={p.id} className="border-t border-border/5 px-4 py-3 hover:bg-secondary/5 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-black text-success text-base">
                        {fmtMoney(p.amount_cents, p.currency)}
                      </div>
                      <div className="text-xs text-text-secondary mt-0.5 flex items-center gap-1.5">
                        {fmtDate(p.period_start)}
                        <ArrowRight className="h-3 w-3 opacity-40 shrink-0" />
                        {fmtDate(p.period_end)}
                      </div>
                      {p.subscription_plans?.name && (
                        <div className="text-xs text-text-secondary mt-0.5">
                          {p.subscription_plans.name}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0 space-y-1.5">
                      <div className="flex items-center gap-1 text-xs text-text-secondary justify-end">
                        <Clock3 className="h-3 w-3" />{fmtDate(p.marked_at)}
                      </div>
                      <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-lg border border-border/15 bg-secondary/10 text-text-secondary">
                        {METHOD_LABELS[p.method] ?? p.method}
                      </span>
                      {p.reference && (
                        <div className="text-[10px] text-text-secondary font-mono">{p.reference}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}