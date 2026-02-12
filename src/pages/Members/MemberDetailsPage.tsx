// src/pages/MemberDetailsPage.tsx
import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase'; // adjust if needed

import MemberHeader from '../../components/Members/details/MemberHeader';
import MemberInfoCard from '../../components/Members/details/MemberInfoCard';
import MemberHistoryCard from '../../components/Members/details/MemberHistoryCard';
import MemberEconomicCard from '../../components/Members/details/MemberEconomicCard';
import MemberMembershipsCard from '../../components/Members/details/MemberMembershipsCard';
import MemberQuestionnairesCard from '../../components/Members/details/MemberQuestionnairesCard';



import MembershipDebtModal from '../../components/Members/details/modals/MembershipDebtModal';
import DropinDebtModal from '../../components/Members/details/modals/DropinDebtModal';


import type { Member } from '../../components/Members/details/types';

export default function MemberDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  const state = (location.state ?? {}) as {
    member?: Member;
    tenantId?: string;
    subscriptionInactive?: boolean;
  };

  const [tenantId, setTenantId] = useState(state.tenantId ?? '');
  const [member, setMember] = useState<Member | null>(state.member ?? null);
  const subscriptionInactive = state.subscriptionInactive ?? false;

  const [pageError, setPageError] = useState<string | null>(null);

  const [showMembershipDebtModal, setShowMembershipDebtModal] = useState(false);
  const [showDropinDebtModal, setShowDropinDebtModal] = useState(false);
  const [economicRefreshKey, setEconomicRefreshKey] = useState(0);

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
          .select(
            'id, tenant_id, full_name, phone, created_at, email, birth_date, address, afm, max_dropin_debt'
          )
          .eq('id', id)
          .maybeSingle();

        if (error) {
          setPageError(error.message);
          return;
        }
        if (!data) {
          setPageError('Δεν βρέθηκε το μέλος.');
          return;
        }

        setTenantId((data as any).tenant_id ?? '');
        setMember({
          id: data.id,
          full_name: (data as any).full_name ?? null,
          phone: (data as any).phone ?? null,
          created_at: (data as any).created_at,
          email: (data as any).email ?? null,
          birth_date: (data as any).birth_date ?? null,
          address: (data as any).address ?? null,
          afm: (data as any).afm ?? null,
          max_dropin_debt: (data as any).max_dropin_debt ?? null,
        });
      } catch (e: any) {
        setPageError(e?.message ?? 'Σφάλμα φόρτωσης μέλους');
      }
    };

    run();
  }, [id, member, tenantId]);

  if (pageError) {
    return (
      <div className="p-6">
        <div className="rounded border border-danger/30 bg-danger/10 text-danger p-4 text-sm">
          {pageError}
        </div>
      </div>
    );
  }

  if (!member || !tenantId) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-white/10 bg-black/10 p-4 text-sm opacity-70">
          Φόρτωση μέλους…
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <MemberHeader member={member} />

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
