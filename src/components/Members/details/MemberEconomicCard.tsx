// src/components/members/details/MemberEconomicCard.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { EconomicSummary } from './types';
import { calculateEconomicSummary, formatMoneyEUR } from './utils';
import { Wallet, Loader2, AlertTriangle, TrendingUp, ChevronRight } from 'lucide-react';

export default function MemberEconomicCard({
  tenantId, memberId, guard,
  onOpenMembershipDebt, onOpenDropinDebt,
  refreshKey, onError,
}: {
  tenantId: string;
  memberId: string;
  guard: () => boolean;
  onOpenMembershipDebt: () => void;
  onOpenDropinDebt: () => void;
  refreshKey: number;
  onError?: (msg: string | null) => void;
}) {
  const [economicSummary, setEconomicSummary] = useState<EconomicSummary | null>(null);
  const [loadingEconomic, setLoadingEconomic] = useState(false);
  const [economicError, setEconomicError]     = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !memberId) return;
    const load = async () => {
      setLoadingEconomic(true); setEconomicError(null); onError?.(null);

      const { data: memberships, error: membErr } = await supabase
        .from('memberships').select('debt,plan_price,custom_price')
        .eq('tenant_id', tenantId).eq('user_id', memberId);

      if (membErr) { setEconomicError(membErr.message); onError?.(membErr.message); setLoadingEconomic(false); return; }

      const { data: bookings, error: bookErr } = await supabase
        .from('bookings').select('drop_in_price,booking_type,drop_in_paid')
        .eq('tenant_id', tenantId).eq('user_id', memberId);

      if (bookErr) { setEconomicError(bookErr.message); onError?.(bookErr.message); setLoadingEconomic(false); return; }

      setEconomicSummary(calculateEconomicSummary((memberships as any[]) ?? [], (bookings as any[]) ?? []));
      setLoadingEconomic(false);
    };
    load();
  }, [tenantId, memberId, refreshKey]);

  const hasDebt = economicSummary
    ? (economicSummary.membershipDebt > 0 || economicSummary.dropinDebt > 0)
    : false;

  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-sm xl:col-span-3 md:col-span-1 2xl:col-span-1 overflow-hidden">

      {/* ── Header ── */}
      <div className="px-5 py-4 border-b border-border/10 flex items-center gap-3">
        <div className={[
          'w-8 h-8 rounded-xl border flex items-center justify-center shrink-0',
          hasDebt ? 'bg-warning/15 border-warning/25' : 'bg-primary/15 border-primary/20',
        ].join(' ')}>
          <Wallet className={['h-4 w-4', hasDebt ? 'text-warning' : 'text-primary'].join(' ')} />
        </div>
        <div>
          <h2 className="text-sm font-black text-text-primary tracking-tight">Οφειλές & Οικονομικά</h2>
          <p className="text-[11px] text-text-secondary mt-px">
            {loadingEconomic ? 'Υπολογισμός…' : hasDebt ? 'Υπάρχουν εκκρεμείς οφειλές' : 'Δεν υπάρχουν εκκρεμείς οφειλές'}
          </p>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p-5 space-y-5">

        {/* Error */}
        {economicError && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
            {economicError}
          </div>
        )}

        {/* Loading */}
        {loadingEconomic && !economicError && (
          <div className="flex items-center justify-center gap-2 py-10 text-text-secondary text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Υπολογισμός οικονομικών…
          </div>
        )}

        {/* No data */}
        {!loadingEconomic && !economicError && !economicSummary && (
          <div className="flex flex-col items-center gap-3 py-10 text-text-secondary">
            <Wallet className="h-8 w-8 opacity-25" />
            <span className="text-sm">Δεν βρέθηκαν οικονομικά στοιχεία για αυτό το μέλος.</span>
          </div>
        )}

        {/* Summary */}
        {!loadingEconomic && !economicError && economicSummary && (
          <>
            {/* ── Debts section ── */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary px-0.5">
                <AlertTriangle className="h-3 w-3 opacity-60" />
                Οφειλές
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {/* Membership debt button */}
                <button
                  type="button"
                  onClick={() => { if (!guard()) return; onOpenMembershipDebt(); }}
                  className="
                    group text-left rounded-xl border border-border/10 bg-secondary/5 p-4
                    hover:border-primary/40 hover:bg-primary/5
                    active:scale-[0.99] transition-all duration-150 cursor-pointer
                  "
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10.5px] font-bold uppercase tracking-widest text-text-secondary">
                      Οφειλή Συνδρομών
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-text-secondary opacity-40 group-hover:opacity-100 group-hover:text-primary transition-all" />
                  </div>
                  <div className={[
                    'text-2xl font-black tracking-tight',
                    economicSummary.membershipDebt > 0 ? 'text-warning' : 'text-success',
                  ].join(' ')}>
                    {formatMoneyEUR(economicSummary.membershipDebt)}
                  </div>
                  <div className="mt-1.5 text-[10.5px] text-text-secondary opacity-70">
                    Κλικ για προβολή / αλλαγή
                  </div>
                </button>

                {/* Drop-in debt button */}
                <button
                  type="button"
                  onClick={() => { if (!guard()) return; onOpenDropinDebt(); }}
                  className="
                    group text-left rounded-xl border border-border/10 bg-secondary/5 p-4
                    hover:border-primary/40 hover:bg-primary/5
                    active:scale-[0.99] transition-all duration-150 cursor-pointer
                  "
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10.5px] font-bold uppercase tracking-widest text-text-secondary">
                      Οφειλή Drop-in
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-text-secondary opacity-40 group-hover:opacity-100 group-hover:text-primary transition-all" />
                  </div>
                  <div className={[
                    'text-2xl font-black tracking-tight',
                    economicSummary.dropinDebt > 0 ? 'text-warning' : 'text-success',
                  ].join(' ')}>
                    {formatMoneyEUR(economicSummary.dropinDebt)}
                  </div>
                  <div className="mt-1.5 text-[10.5px] text-text-secondary opacity-70">
                    Κλικ για προβολή / εξόφληση
                  </div>
                </button>
              </div>
            </div>

            {/* ── Totals section ── */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary px-0.5">
                <TrendingUp className="h-3 w-3 opacity-60" />
                Συνολικό Κόστος
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  { label: 'Σύνολο Συνδρομών', value: economicSummary.membershipTotal, highlight: false },
                  { label: 'Σύνολο Drop-in',   value: economicSummary.dropinTotal,     highlight: false },
                  { label: 'Γενικό Σύνολο',    value: economicSummary.combinedTotal,   highlight: true  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={[
                      'rounded-xl border p-4',
                      item.highlight
                        ? 'border-primary/20 bg-primary/8'
                        : 'border-border/10 bg-secondary/5',
                    ].join(' ')}
                  >
                    <div className="text-[10.5px] font-bold uppercase tracking-widest text-text-secondary mb-1.5">
                      {item.label}
                    </div>
                    <div className={[
                      'text-xl font-black tracking-tight',
                      item.highlight ? 'text-primary' : 'text-text-primary',
                    ].join(' ')}>
                      {formatMoneyEUR(item.value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}