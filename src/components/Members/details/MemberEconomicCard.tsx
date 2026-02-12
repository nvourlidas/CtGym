// src/components/members/details/MemberEconomicCard.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase'; 
import type { EconomicSummary } from './types';
import { calculateEconomicSummary, formatMoneyEUR } from './utils';

export default function MemberEconomicCard({
  tenantId,
  memberId,
  guard,
  onOpenMembershipDebt,
  onOpenDropinDebt,
  refreshKey,
  onError,
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
  const [economicError, setEconomicError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !memberId) return;

    const load = async () => {
      setLoadingEconomic(true);
      setEconomicError(null);
      onError?.(null);

      const { data: memberships, error: membErr } = await supabase
        .from('memberships')
        .select('debt, plan_price, custom_price')
        .eq('tenant_id', tenantId)
        .eq('user_id', memberId);

      if (membErr) {
        setEconomicError(membErr.message);
        onError?.(membErr.message);
        setLoadingEconomic(false);
        return;
      }

      const { data: bookings, error: bookErr } = await supabase
        .from('bookings')
        .select('drop_in_price, booking_type, drop_in_paid')
        .eq('tenant_id', tenantId)
        .eq('user_id', memberId);

      if (bookErr) {
        setEconomicError(bookErr.message);
        onError?.(bookErr.message);
        setLoadingEconomic(false);
        return;
      }

      setEconomicSummary(calculateEconomicSummary((memberships as any[]) ?? [], (bookings as any[]) ?? []));
      setLoadingEconomic(false);
    };

    load();
  }, [tenantId, memberId, refreshKey]);

  return (
    <div className="rounded-xl border border-border/10 bg-secondary-background text-text-primary shadow xl:col-span-3 md:col-span-1 2xl:col-span-1">
      <div className="border-b border-border/10 px-6 py-3">
        <h2 className="text-sm font-semibold">Οφειλές & Οικονομικά</h2>
      </div>

      <div className="p-6 space-y-6">
        {economicError && (
          <div className="text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">
            {economicError}
          </div>
        )}

        {loadingEconomic && !economicError && (
          <p className="text-sm text-text-secondary">Υπολογισμός οικονομικών…</p>
        )}

        {!loadingEconomic && !economicError && economicSummary && (
          <>
            <div>
              <h3 className="text-sm font-semibold mb-2 text-text-primary">Οφειλές</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!guard()) return;
                    onOpenMembershipDebt();
                  }}
                  className="text-left rounded-lg border border-border/10 bg-black/10 p-4 hover:border-primary/60 hover:bg-primary/5 transition"
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Οφειλή Συνδρομών
                  </div>
                  <div className="mt-2 text-xl font-semibold">
                    {formatMoneyEUR(economicSummary.membershipDebt)}
                  </div>
                  <div className="mt-1 text-xs text-text-secondary">
                    Κλικ για προβολή / αλλαγή οφειλής συνδρομών
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!guard()) return;
                    onOpenDropinDebt();
                  }}
                  className="text-left rounded-lg border border-border/10 bg-black/10 p-4 hover:border-primary/60 hover:bg-primary/5 transition"
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Οφειλή Drop-in
                  </div>
                  <div className="mt-2 text-xl font-semibold">
                    {formatMoneyEUR(economicSummary.dropinDebt)}
                  </div>
                  <div className="mt-1 text-xs text-text-secondary">
                    Κλικ για προβολή / εξόφληση drop-in
                  </div>
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 text-text-primary">Συνολικό Κόστος</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-border/10 bg-black/10 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Σύνολο Συνδρομών
                  </div>
                  <div className="mt-2 text-xl font-semibold">
                    {formatMoneyEUR(economicSummary.membershipTotal)}
                  </div>
                </div>

                <div className="rounded-lg border border-border/10 bg-black/10 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Σύνολο Drop-in
                  </div>
                  <div className="mt-2 text-xl font-semibold">
                    {formatMoneyEUR(economicSummary.dropinTotal)}
                  </div>
                </div>

                <div className="rounded-lg border border-border/10 bg-black/10 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Σύνολο (Όλα)
                  </div>
                  <div className="mt-2 text-xl font-semibold">
                    {formatMoneyEUR(economicSummary.combinedTotal)}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {!loadingEconomic && !economicError && !economicSummary && (
          <p className="text-sm text-text-secondary">Δεν βρέθηκαν οικονομικά στοιχεία για αυτό το μέλος.</p>
        )}
      </div>
    </div>
  );
}
