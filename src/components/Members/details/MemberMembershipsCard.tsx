import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import CreateMemberMembershipModal from './CreateMemberMembershipModal';
import {
  CreditCard, Plus, RefreshCw, Loader2, AlertTriangle,
  CalendarRange, ChevronLeft, ChevronRight, Layers,
} from 'lucide-react';

type PlanCategory = { id: string; name: string; color: string | null };

type MembershipRow = {
  id: string; tenant_id: string; user_id: string; plan_id: string | null;
  starts_at: string | null; ends_at: string | null; status: string | null; created_at: string;
  remaining_sessions: number | null; plan_kind: string | null; plan_name: string | null;
  plan_price: number | null; custom_price: number | null; discount_reason?: string | null;
  days_remaining: number | null; debt: number | null;
  plan_categories?: PlanCategory[];
};

function formatDateDMY(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, { style:'currency', currency:'EUR', maximumFractionDigits:2 }).format(n);
}

function getStatusDisplay(status?: string | null) {
  switch ((status ?? 'active').toLowerCase()) {
    case 'active':    return { label:'Ενεργή',    cls:'border-success/25 bg-success/10 text-success' };
    case 'paused':    return { label:'Σε παύση',  cls:'border-warning/25 bg-warning/10 text-warning' };
    case 'cancelled': return { label:'Ακυρωμένη', cls:'border-danger/25  bg-danger/10  text-danger'  };
    case 'expired':   return { label:'Έληξε',     cls:'border-border/20  bg-secondary/10 text-text-secondary' };
    default:          return { label:'Άγνωστη',   cls:'border-border/20  bg-secondary/10 text-text-secondary' };
  }
}

export default function MemberMembershipsCard({
  tenantId, memberId,
}: {
  tenantId: string;
  memberId: string;
}) {
  const [rows, setRows]         = useState<MembershipRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const pageSize = 3;
  const [page, setPage] = useState(1);

  async function load() {
    if (!tenantId || !memberId) return;
    setLoading(true); setError(null);

    const { data, error } = await supabase
      .from('memberships')
      .select(`
        id, tenant_id, user_id, plan_id, starts_at, ends_at, status, created_at,
        remaining_sessions, plan_kind, plan_name, plan_price,
        custom_price, discount_reason, days_remaining, debt,
        membership_plans (
          membership_plan_categories (
            class_categories ( id, name, color )
          )
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('user_id', memberId)
      .order('created_at', { ascending: false });

    if (error) { setError(error.message); setRows([]); setLoading(false); return; }

    const normalized: MembershipRow[] = ((data as any[]) ?? []).map((r) => {
      const plan = r.membership_plans;
      let cats: PlanCategory[] = [];
      if (plan && Array.isArray(plan.membership_plan_categories)) {
        cats = (plan.membership_plan_categories as any[])
          .map((link) => link.class_categories)
          .filter(Boolean)
          .map((c: any) => ({ id: c.id, name: c.name, color: c.color ?? null }));
      }
      return { ...r, plan_categories: cats } as MembershipRow;
    });

    setRows(normalized);
    setLoading(false);
  }

  useEffect(() => { load(); }, [tenantId, memberId]);
  useEffect(() => { setPage(1); }, [memberId, tenantId, rows.length]);

  const sorted = useMemo(() =>
    rows.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [rows]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(sorted.length / pageSize)), [sorted.length]);
  const paginated = useMemo(() => {
    const safePage = Math.min(Math.max(1, page), pageCount);
    return sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  }, [sorted, page, pageCount]);

  const startIdx = sorted.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx   = Math.min(sorted.length, page * pageSize);

  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-sm xl:col-span-2 2xl:col-span-1 3xl:col-span-2 md:col-span-2 overflow-hidden">

      {/* ── Header ── */}
      <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <CreditCard className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-black text-text-primary tracking-tight">Συνδρομές</h2>
            <p className="text-[11px] text-text-secondary mt-px">
              {loading ? '…' : `${startIdx}–${endIdx} από ${sorted.length}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="h-8 w-8 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 disabled:opacity-40 transition-all cursor-pointer"
            title="Ανανέωση"
          >
            <RefreshCw className={['h-3.5 w-3.5', loading ? 'animate-spin' : ''].join(' ')} />
          </button>

          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="
              group relative inline-flex items-center gap-1.5 h-8 px-3 rounded-xl
              text-xs font-bold text-white bg-primary hover:bg-primary/90
              shadow-sm shadow-primary/20 hover:-translate-y-px active:translate-y-0
              transition-all duration-150 cursor-pointer overflow-hidden
            "
          >
            <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
            <Plus className="h-3.5 w-3.5 relative z-10" />
            <span className="relative z-10 hidden sm:inline">Νέα Συνδρομή</span>
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p-5 space-y-4">

        {error && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-text-secondary text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Φόρτωση…
          </div>
        )}

        {!loading && sorted.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10 text-text-secondary">
            <CreditCard className="h-8 w-8 opacity-25" />
            <span className="text-sm">Δεν υπάρχουν συνδρομές για αυτό το μέλος.</span>
          </div>
        )}

        {!loading && paginated.length > 0 && (
          <>
            <div className="rounded-xl border border-border/10 overflow-hidden divide-y divide-border/10">
              {paginated.map((m) => {
                const basePrice      = m.plan_price ?? null;
                const effectivePrice = m.custom_price != null ? m.custom_price : basePrice;
                const hasDiscount    = basePrice != null && m.custom_price != null && m.custom_price !== basePrice;
                const { label, cls } = getStatusDisplay(m.status);

                return (
                  <div key={m.id} className="p-4 hover:bg-secondary/5 transition-colors">
                    <div className="flex items-start justify-between gap-3">

                      {/* Left content */}
                      <div className="min-w-0 flex-1 space-y-2.5">

                        {/* Title row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-text-primary truncate">
                            {m.plan_name ?? 'Χωρίς πλάνο'}
                          </span>
                          <span className={['inline-flex items-center px-2 py-0.5 text-[10.5px] rounded-lg border font-semibold', cls].join(' ')}>
                            {label}
                          </span>
                        </div>

                        {/* Price */}
                        <div className="text-xs">
                          {effectivePrice == null ? (
                            <span className="text-text-secondary">Τιμή: —</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="font-semibold text-text-primary">{formatMoney(effectivePrice)}</span>
                              {hasDiscount && (
                                <span className="text-[11px] line-through text-text-secondary">{formatMoney(basePrice!)}</span>
                              )}
                              {hasDiscount && (
                                <span className="text-[11px] text-accent font-medium">έκπτωση</span>
                              )}
                              {m.discount_reason && (
                                <span className="text-[11px] text-text-secondary">· {m.discount_reason}</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Categories */}
                        {m.plan_categories && m.plan_categories.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {m.plan_categories.map((cat) => (
                              <span key={cat.id} className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border border-border/15 bg-secondary/20">
                                {cat.color && <span className="h-2 w-2 rounded-full border border-border/20 shrink-0" style={{ backgroundColor: cat.color }} />}
                                {cat.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-[11px] text-text-secondary">
                            <Layers className="h-3 w-3 opacity-50" />
                            Χωρίς κατηγορία
                          </div>
                        )}

                        {/* Dates & remaining — mini grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { icon: <CalendarRange className="h-3 w-3" />, label:'Έναρξη',           value: formatDateDMY(m.starts_at)           },
                            { icon: <CalendarRange className="h-3 w-3" />, label:'Λήξη',             value: formatDateDMY(m.ends_at)             },
                            { icon: null,                                   label:'Μέρες υπολοίπου', value: m.days_remaining ?? '—'              },
                            { icon: null,                                   label:'Υπολ. συνεδριών', value: m.remaining_sessions ?? '—'          },
                          ].map((item) => (
                            <div key={item.label} className="rounded-lg border border-border/10 bg-secondary/5 px-2.5 py-2">
                              <div className="flex items-center gap-1 text-[10px] text-text-secondary mb-0.5">
                                {item.icon && <span className="opacity-60">{item.icon}</span>}
                                {item.label}
                              </div>
                              <div className="text-xs font-bold text-text-primary">{String(item.value)}</div>
                            </div>
                          ))}
                        </div>

                        {/* Debt */}
                        <div>
                          {m.debt != null && m.debt !== 0 ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg border border-warning/25 bg-warning/10 text-warning text-xs font-bold">
                              Οφειλή: {formatMoney(m.debt)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg border border-success/25 bg-success/10 text-success text-xs font-bold">
                              Εξοφλημένη
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {pageCount > 1 && (
              <div className="flex items-center justify-between text-xs text-text-secondary pt-1">
                <span>
                  Σελ. <span className="font-bold text-text-primary">{page}</span> / {pageCount}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 transition-all cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={page >= pageCount}
                    className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 transition-all cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <CreateMemberMembershipModal
          tenantId={tenantId}
          memberId={memberId}
          onClose={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}