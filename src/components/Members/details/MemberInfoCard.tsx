// src/components/members/details/MemberInfoCard.tsx
import type { Member } from './types';
import { calculateAge } from './utils';

function DetailField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</span>
      <span className="text-sm text-text-primary">{value && value !== '' ? value : '—'}</span>
    </div>
  );
}

export default function MemberInfoCard({ member }: { member: Member }) {
  const age = calculateAge(member.birth_date);

  return (
    <div className="rounded-xl border border-border/10 bg-secondary-background text-text-primary shadow xl:col-span-1 md:col-span-2 ">
      <div className="border-b border-border/10 px-6 py-3">
        <h2 className="text-sm font-semibold">Στοιχεία</h2>
      </div>

      <div className="p-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1">
        <DetailField label="Ονοματεπώνυμο" value={member.full_name} />
        <DetailField label="Τηλέφωνο" value={member.phone} />
        <DetailField label="Email" value={member.email ?? null} />
        <DetailField label="Ηλικία" value={age != null ? String(age) : null} />
        <DetailField
          label="Ημ. γέννησης"
          value={member.birth_date ? new Date(member.birth_date).toLocaleDateString('el-GR') : null}
        />
        <DetailField label="Διεύθυνση" value={member.address ?? null} />
        <DetailField label="ΑΦΜ" value={member.afm ?? null} />
        <DetailField
          label="Μέγιστο χρέος drop-in"
          value={member.max_dropin_debt != null ? `${member.max_dropin_debt}€` : null}
        />
      </div>
    </div>
  );
}
