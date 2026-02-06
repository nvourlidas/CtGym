// src/pages/BillingPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { CalendarClock, CheckCircle2, CreditCard, History, XCircle } from 'lucide-react';

type PlanRow = {
    id: string;
    name: string;
    includes_mobile: boolean;
    monthly_price_cents: number;
    currency: string;
};

type TenantSubscriptionRow = {
    tenant_id: string;
    plan_id: string;
    status: 'active' | 'past_due' | 'inactive' | 'canceled' | 'trial';
    current_period_start: string | null;
    current_period_end: string | null;
    grace_until: string | null;
    notes: string | null;
    subscription_plans?: PlanRow | PlanRow[] | null; // depending on relationship shape
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
    subscription_plans?: {
        id: string;
        name: string;
    } | null;
};

function fmtDate(d: string | null | undefined) {
    if (!d) return '—';
    // d is date or timestamptz string
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

function isActiveNow(sub: TenantSubscriptionRow | null) {
    if (!sub) return false;
    if (sub.status !== 'active') return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = sub.current_period_start ? new Date(sub.current_period_start) : null;
    const end = sub.current_period_end ? new Date(sub.current_period_end) : null;
    const grace = sub.grace_until ? new Date(sub.grace_until) : null;

    if (start) {
        start.setHours(0, 0, 0, 0);
        if (start.getTime() > today.getTime()) return false;
    }

    if (end) {
        end.setHours(0, 0, 0, 0);
        if (end.getTime() >= today.getTime()) return true;
    }

    if (grace) {
        grace.setHours(0, 0, 0, 0);
        if (grace.getTime() >= today.getTime()) return true;
    }

    return false;
}

export default function BillingPage() {
    const { profile } = useAuth(); // profile.tenant_id, profile.role

    const [loading, setLoading] = useState(true);
    const [sub, setSub] = useState<TenantSubscriptionRow | null>(null);
    const [payments, setPayments] = useState<TenantPaymentRow[]>([]);
    const [err, setErr] = useState<string | null>(null);

    const plan = useMemo(() => normalizePlan(sub?.subscription_plans), [sub]);
    const active = useMemo(() => isActiveNow(sub), [sub]);

    useEffect(() => {
        if (!profile?.tenant_id) return;

        const load = async () => {
            setLoading(true);
            setErr(null);

            try {
                // Subscription (read-only)
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
              currency
            )
          `,
                    )
                    .eq('tenant_id', profile.tenant_id)
                    .maybeSingle();

                if (subError) throw subError;

                // Payment history (read-only)
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
                        `
                    )
                    .eq('tenant_id', profile.tenant_id)
                    .order('marked_at', { ascending: false })
                    .limit(100);


                if (payError) throw payError;

                setSub((subData as any) ?? null);
                setPayments((payData as any[]) ?? []);
            } catch (e: any) {
                console.error(e);
                setErr(e?.message ?? 'Κάτι πήγε στραβά.');
                setSub(null);
                setPayments([]);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [profile?.tenant_id]);

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold">Billing</h1>
                    <p className="text-sm text-text-secondary">
                        Προβολή πλάνου, κατάστασης συνδρομής και ιστορικού πληρωμών.
                    </p>
                </div>
            </div>

            {loading && (
                <div className="rounded-md border border-white/10 p-4 text-sm opacity-70">Loading…</div>
            )}

            {!loading && err && (
                <div className="rounded-md border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
                    {err}
                </div>
            )}

            {!loading && !err && (
                <>
                    {/* Current subscription */}
                    <div className="rounded-md border border-white/10 bg-secondary/5 p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <CreditCard className="h-4 w-4 opacity-80" />
                            <span>Τρέχον πλάνο</span>
                        </div>

                        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="rounded-md border border-white/10 bg-secondary-background/40 p-3">
                                <div className="text-xs text-text-secondary">Πλάνο</div>
                                <div className="mt-1 text-sm font-semibold">
                                    {plan?.name ?? (sub?.plan_id ? sub.plan_id : '—')}
                                </div>
                                <div className="mt-1 text-xs text-text-secondary">
                                    Mobile:{' '}
                                    <span className="font-medium text-text-primary">
                                        {plan ? (plan.includes_mobile ? 'Ναι' : 'Όχι') : '—'}
                                    </span>
                                </div>
                            </div>

                            <div className="rounded-md border border-white/10 bg-secondary-background/40 p-3">
                                <div className="text-xs text-text-secondary">Κατάσταση</div>
                                <div className="mt-1 flex items-center gap-2">
                                    {active ? (
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
                                    Status: <span className="text-text-primary font-medium">{sub?.status ?? '—'}</span>
                                </div>
                            </div>

                            <div className="rounded-md border border-white/10 bg-secondary-background/40 p-3">
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
                                            Grace έως: <span className="text-text-primary font-medium">{fmtDate(sub.grace_until)}</span>
                                        </div>
                                    ) : (
                                        <div className="mt-1 text-xs text-text-secondary">Grace: —</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-3 text-xs text-text-secondary">
                            * Οι αλλαγές συνδρομής/ενεργοποίησης γίνονται από εμάς (CloudTec) και δεν μπορούν να τροποποιηθούν από εδώ.
                        </div>
                    </div>

                    {/* Payment history */}
                    <div className="rounded-md border border-white/10 overflow-hidden">
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
                                            <tr key={p.id} className="border-t border-white/10 hover:bg-secondary/10">
                                                <td className="px-4 py-2">{fmtDate(p.marked_at)}</td>
                                                <td className="px-4 py-2 text-xs text-text-secondary">
                                                    {fmtDate(p.period_start)} → {fmtDate(p.period_end)}
                                                </td>
                                                <td className="px-4 py-2 text-xs">
                                                    {p.subscription_plans?.name ?? '—'}
                                                </td>
                                                <td className="px-4 py-2 font-medium">{fmtMoney(p.amount_cents, p.currency)}</td>
                                                <td className="px-4 py-2 text-xs">
                                                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-white/5 border border-white/10">
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
                    <div className="md:hidden rounded-md border border-white/10 overflow-hidden">
                        <div className="px-4 py-3 bg-secondary-background/50 text-sm font-semibold flex items-center gap-2">
                            <History className="h-4 w-4 opacity-80" />
                            <span>Ιστορικό πληρωμών</span>
                        </div>
                        {payments.length === 0 ? (
                            <div className="px-4 py-4 text-sm text-text-secondary">Δεν υπάρχουν καταγεγραμμένες πληρωμές.</div>
                        ) : (
                            payments.slice(0, 30).map((p) => (
                                <div key={p.id} className="border-t border-white/10 px-4 py-3">
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
                                                <span className="inline-flex items-center px-2 py-1 rounded-full bg-white/5 border border-white/10">
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
