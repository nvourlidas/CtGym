import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import CreateMemberMembershipModal from './CreateMemberMembershipModal';

type PlanCategory = {
    id: string;
    name: string;
    color: string | null;
};

type MembershipRow = {
    id: string;
    tenant_id: string;
    user_id: string;
    plan_id: string | null;
    starts_at: string | null;
    ends_at: string | null;
    status: string | null;
    created_at: string;

    remaining_sessions: number | null;
    plan_kind: string | null;
    plan_name: string | null;
    plan_price: number | null;
    custom_price: number | null;
    discount_reason?: string | null;
    days_remaining: number | null;
    debt: number | null;

    plan_categories?: PlanCategory[];
};

function formatDateDMY(iso?: string | null) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

function formatMoney(n: number) {
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 2,
    }).format(n);
}

function getStatusDisplay(status?: string | null) {
    const s = (status ?? 'active').toLowerCase();

    switch (s) {
        case 'active':
            return { label: 'Ενεργή', className: 'text-success bg-emerald-500/10' };
        case 'paused':
            return { label: 'Σε παύση', className: 'text-warning bg-amber-500/10' };
        case 'cancelled':
            return { label: 'Ακυρωμένη', className: 'text-danger bg-rose-500/10' };
        case 'expired':
            return { label: 'Έληξε', className: 'text-text-muted bg-slate-500/10' };
        default:
            return { label: 'Άγνωστη', className: 'text-text-muted bg-slate-500/10' };
    }
}

export default function MemberMembershipsCard({
    tenantId,
    memberId,
}: {
    tenantId: string;
    memberId: string;
}) {
    const [rows, setRows] = useState<MembershipRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);


    // ✅ pagination
    const pageSize = 3;
    const [page, setPage] = useState(1);

    async function load() {
        if (!tenantId || !memberId) return;
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
            .from('memberships')
            .select(`
        id, tenant_id, user_id, plan_id, starts_at, ends_at, status, created_at,
        remaining_sessions, plan_kind, plan_name, plan_price,
        custom_price, discount_reason,
        days_remaining, debt,
        membership_plans (
          membership_plan_categories (
            class_categories ( id, name, color )
          )
        )
      `)
            .eq('tenant_id', tenantId)
            .eq('user_id', memberId)
            .order('created_at', { ascending: false });

        if (error) {
            setError(error.message);
            setRows([]);
            setLoading(false);
            return;
        }

        const normalized: MembershipRow[] = ((data as any[]) ?? []).map((r) => {
            const plan = r.membership_plans;

            let cats: PlanCategory[] = [];
            if (plan && Array.isArray(plan.membership_plan_categories)) {
                const links = plan.membership_plan_categories as any[];
                cats = links
                    .map((link) => link.class_categories)
                    .filter((c: any) => !!c)
                    .map((c: any) => ({
                        id: c.id as string,
                        name: c.name as string,
                        color: c.color ?? null,
                    }));
            }

            return { ...r, plan_categories: cats } as MembershipRow;
        });

        setRows(normalized);
        setLoading(false);
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId, memberId]);

    // reset to page 1 when rows change (or member changes)
    useEffect(() => {
        setPage(1);
    }, [memberId, tenantId, rows.length]);

    const sorted = useMemo(() => {
        return rows.slice().sort((a, b) => {
            const aa = new Date(a.created_at).getTime();
            const bb = new Date(b.created_at).getTime();
            return bb - aa;
        });
    }, [rows]);

    const pageCount = useMemo(() => {
        return Math.max(1, Math.ceil(sorted.length / pageSize));
    }, [sorted.length]);

    const paginated = useMemo(() => {
        const safePage = Math.min(Math.max(1, page), pageCount);
        const start = (safePage - 1) * pageSize;
        return sorted.slice(start, start + pageSize);
    }, [sorted, page, pageCount]);

    const startIdx = sorted.length === 0 ? 0 : (page - 1) * pageSize + 1;
    const endIdx = Math.min(sorted.length, page * pageSize);

    return (
        <div className="rounded-xl border border-border/10 bg-secondary-background text-text-primary shadow xl:col-span-2 2xl:col-span-1 3xl:col-span-2 md:col-span-2" >
            <div className="border-b border-border/10 px-6 py-3 flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-semibold">Συνδρομές</h2>
                    <div className="text-xs text-text-secondary mt-0.5">
                        Εμφάνιση {startIdx}–{endIdx} από {sorted.length}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowCreate(true)}
                        className="px-3 py-1.5 rounded-md text-xs bg-primary text-white hover:bg-primary/90"
                    >
                        Νέα Συνδρομή
                    </button>

                    <button
                        type="button"
                        onClick={load}
                        className="px-3 py-1.5 rounded border border-border/10 text-xs hover:bg-secondary/10"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            <div className="p-6">
                {error && (
                    <div className="mb-4 text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">
                        {error}
                    </div>
                )}

                {loading && (
                    <div className="rounded-md border border-white/10 bg-black/10 p-4 text-sm opacity-70">
                        Loading…
                    </div>
                )}

                {!loading && sorted.length === 0 && (
                    <div className="rounded-md border border-white/10 bg-black/10 p-4 text-sm opacity-70">
                        Δεν υπάρχουν συνδρομές για αυτό το μέλος.
                    </div>
                )}

                {!loading && paginated.length > 0 && (
                    <>
                        <div className="divide-y divide-border/10 rounded-lg border border-border/10 overflow-hidden">
                            {paginated.map((m) => {
                                const basePrice = m.plan_price ?? null;
                                const effectivePrice =
                                    m.custom_price != null
                                        ? m.custom_price
                                        : basePrice != null
                                            ? basePrice
                                            : null;

                                const { label, className } = getStatusDisplay(m.status);

                                return (
                                    <div key={m.id} className="p-4 hover:bg-secondary/10">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold truncate">
                                                    {m.plan_name ?? 'Χωρίς πλάνο'}
                                                </div>

                                                {/* Price */}
                                                <div className="mt-1 text-xs">
                                                    {effectivePrice == null ? (
                                                        <span className="text-text-secondary">Τιμή: —</span>
                                                    ) : (
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="font-medium">
                                                                Τιμή: {formatMoney(effectivePrice)}
                                                            </span>
                                                            {basePrice != null &&
                                                                m.custom_price != null &&
                                                                m.custom_price !== basePrice && (
                                                                    <span className="text-[11px] text-accent">
                                                                        κανονική: {formatMoney(basePrice)}
                                                                    </span>
                                                                )}
                                                            {!!m.discount_reason && (
                                                                <span className="text-[11px] text-text-secondary">
                                                                    λόγος: {m.discount_reason}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Categories */}
                                                <div className="mt-2">
                                                    {m.plan_categories && m.plan_categories.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {m.plan_categories.map((cat) => (
                                                                <span
                                                                    key={cat.id}
                                                                    className="inline-flex items-center gap-2 text-[11px] px-2 py-1 rounded-full bg-white/5"
                                                                >
                                                                    {cat.color && (
                                                                        <span
                                                                            className="inline-block h-2.5 w-2.5 rounded-full border border-border/20"
                                                                            style={{ backgroundColor: cat.color }}
                                                                        />
                                                                    )}
                                                                    <span>{cat.name}</span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[11px] text-text-secondary">
                                                            Χωρίς κατηγορία
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Dates & remaining */}
                                                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-text-secondary">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span>Έναρξη</span>
                                                        <span className="text-text-primary">
                                                            {formatDateDMY(m.starts_at)}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col gap-0.5">
                                                        <span>Λήξη</span>
                                                        <span className="text-text-primary">
                                                            {formatDateDMY(m.ends_at)}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col gap-0.5">
                                                        <span>Μέρες υπολοίπου</span>
                                                        <span className="text-text-primary">
                                                            {m.days_remaining ?? '—'}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col gap-0.5">
                                                        <span>Υπολ. συνεδριών</span>
                                                        <span className="text-text-primary">
                                                            {m.remaining_sessions ?? '—'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Debt */}
                                                <div className="mt-2 text-[11px]">
                                                    {m.debt != null && m.debt !== 0 ? (
                                                        <span className="text-warning font-medium">
                                                            Οφειλή: {formatMoney(m.debt)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-success text-[11px] uppercase tracking-wide">
                                                            Εξοφλημένη
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Status badge */}
                                            <div className="shrink-0">
                                                <span
                                                    className={
                                                        'inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium ' +
                                                        className
                                                    }
                                                >
                                                    {label}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Pagination */}
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-text-secondary">
                            <div>
                                Σελίδα <span className="font-semibold">{page}</span> από{' '}
                                <span className="font-semibold">{pageCount}</span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className="px-2 py-1 rounded border border-border/10 hover:bg-secondary/10 disabled:opacity-40"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                >
                                    Προηγ.
                                </button>

                                <button
                                    type="button"
                                    className="px-2 py-1 rounded border border-border/10 hover:bg-secondary/10 disabled:opacity-40"
                                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                                    disabled={page >= pageCount}
                                >
                                    Επόμενο
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {showCreate && (
                <CreateMemberMembershipModal
                    tenantId={tenantId}
                    memberId={memberId}
                    onClose={() => {
                        setShowCreate(false);
                        load();
                    }}
                />
            )}
        </div>
    );
}
