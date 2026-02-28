// src/pages/MemberDetailsPage.tsx
import { useEffect, useState } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

import MemberHeader from '../../components/Members/details/MemberHeader';
import MemberInfoCard from '../../components/Members/details/MemberInfoCard';
import MemberHistoryCard from '../../components/Members/details/MemberHistoryCard';
import MemberEconomicCard from '../../components/Members/details/MemberEconomicCard';
import MemberMembershipsCard from '../../components/Members/details/MemberMembershipsCard';
import MemberQuestionnairesCard from '../../components/Members/details/MemberQuestionnairesCard';

import MembershipDebtModal from '../../components/Members/details/modals/MembershipDebtModal';
import DropinDebtModal from '../../components/Members/details/modals/DropinDebtModal';

import type { Member } from '../../components/Members/details/types';
import { Loader2, AlertTriangle, ArrowLeft, User } from 'lucide-react';

export default function MemberDetailsPage() {
  const { id }       = useParams<{ id: string }>();
  const location     = useLocation();
  const navigate     = useNavigate();

  const state = (location.state ?? {}) as {
    member?: Member;
    tenantId?: string;
    subscriptionInactive?: boolean;
  };

  const [tenantId, setTenantId]   = useState(state.tenantId ?? '');
  const [member, setMember]       = useState<Member | null>(state.member ?? null);
  const subscriptionInactive      = state.subscriptionInactive ?? false;

  const [pageError, setPageError]                   = useState<string | null>(null);
  const [showMembershipDebtModal, setShowMembershipDebtModal] = useState(false);
  const [showDropinDebtModal, setShowDropinDebtModal]         = useState(false);
  const [economicRefreshKey, setEconomicRefreshKey]           = useState(0);

  const guard = () => {
    if (subscriptionInactive) {
      alert('Απαιτείται ενεργή συνδρομή για αυτή την ενέργεια.');
      return false;
    }
    return true;
  };

  useEffect(() => {
    const run = async () => {
      if (!id) return;
      if (member && tenantId) return;

      try {
        setPageError(null);

        const { data, error } = await supabase
          .from('profiles')
          .select('id,tenant_id,full_name,phone,created_at,email,birth_date,address,afm,max_dropin_debt,notes')
          .eq('id', id)
          .maybeSingle();

        if (error) { setPageError(error.message); return; }
        if (!data)  { setPageError('Δεν βρέθηκε το μέλος.'); return; }

        setTenantId((data as any).tenant_id ?? '');
        setMember({
          id:             data.id,
          full_name:      (data as any).full_name      ?? null,
          phone:          (data as any).phone          ?? null,
          created_at:     (data as any).created_at,
          email:          (data as any).email          ?? null,
          birth_date:     (data as any).birth_date     ?? null,
          address:        (data as any).address        ?? null,
          afm:            (data as any).afm            ?? null,
          notes:          (data as any).notes          ?? null,
          max_dropin_debt:(data as any).max_dropin_debt ?? null,
        });
      } catch (e: any) {
        setPageError(e?.message ?? 'Σφάλμα φόρτωσης μέλους');
      }
    };

    run();
  }, [id, member, tenantId]);

  // ── Error state
  if (pageError) {
    return (
      <div className="p-5 md:p-6">
        <div className="max-w-lg mx-auto rounded-2xl border border-danger/25 bg-danger/8 overflow-hidden">
          <div className="h-0.75 bg-danger" />
          <div className="px-5 py-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-px" />
            <div>
              <p className="text-sm font-semibold text-danger">Σφάλμα φόρτωσης</p>
              <p className="text-sm text-text-secondary mt-0.5">{pageError}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading state
  if (!member || !tenantId) {
    return (
      <div className="p-5 md:p-6 flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-4 text-text-secondary">
          {/* Skeleton avatar */}
          <div className="w-16 h-16 rounded-2xl bg-secondary/30 border border-border/10 flex items-center justify-center animate-pulse">
            <User className="h-7 w-7 opacity-30" />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Φόρτωση μέλους…
          </div>
          {/* Skeleton rows */}
          <div className="w-64 space-y-2 mt-2">
            <div className="h-3 rounded-full bg-secondary/30 animate-pulse w-4/5 mx-auto" />
            <div className="h-3 rounded-full bg-secondary/20 animate-pulse w-3/5 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* Back nav */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer group"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" />
        Πίσω στα Μέλη
      </button>

      {/* Member header */}
      <MemberHeader member={member} />

      {/* Card grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 auto-rows-auto">

        {/* Row 1 */}
        <MemberInfoCard member={member} />

        <MemberHistoryCard
          tenantId={tenantId}
          memberId={member.id}
        />

        <MemberQuestionnairesCard
          tenantId={tenantId}
          memberId={member.id}
        />

        {/* Row 2 */}
        <MemberMembershipsCard
          tenantId={tenantId}
          memberId={member.id}
        />

        <MemberEconomicCard
          tenantId={tenantId}
          memberId={member.id}
          guard={guard}
          refreshKey={economicRefreshKey}
          onOpenMembershipDebt={() => setShowMembershipDebtModal(true)}
          onOpenDropinDebt={() => setShowDropinDebtModal(true)}
        />

      </div>

      {/* Modals */}
      {showMembershipDebtModal && (
        <MembershipDebtModal
          tenantId={tenantId}
          memberId={member.id}
          onClose={() => setShowMembershipDebtModal(false)}
          onUpdated={() => setEconomicRefreshKey((k) => k + 1)}
          guard={guard}
        />
      )}

      {showDropinDebtModal && (
        <DropinDebtModal
          tenantId={tenantId}
          memberId={member.id}
          onClose={() => setShowDropinDebtModal(false)}
          onUpdated={() => setEconomicRefreshKey((k) => k + 1)}
          guard={guard}
        />
      )}

    </div>
  );
}