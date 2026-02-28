// src/components/members/details/MemberInfoCard.tsx
import type { Member } from './types';
import { calculateAge } from './utils';
import {
  User, Phone, Mail, Calendar, MapPin, Receipt, FileText,
  CreditCard, Hash,
} from 'lucide-react';

const FIELD_ICONS: Record<string, React.ReactNode> = {
  'Ονοματεπώνυμο':        <User     className="h-3.5 w-3.5" />,
  'Τηλέφωνο':             <Phone    className="h-3.5 w-3.5" />,
  'Email':                <Mail     className="h-3.5 w-3.5" />,
  'Ηλικία':               <Hash     className="h-3.5 w-3.5" />,
  'Ημ. γέννησης':         <Calendar className="h-3.5 w-3.5" />,
  'Διεύθυνση':            <MapPin   className="h-3.5 w-3.5" />,
  'ΑΦΜ':                  <Receipt  className="h-3.5 w-3.5" />,
  'Μέγιστο χρέος drop-in':<CreditCard className="h-3.5 w-3.5" />,
  'Σημειώσεις':           <FileText className="h-3.5 w-3.5" />,
};

function DetailField({ label, value }: { label: string; value: string | null }) {
  const icon    = FIELD_ICONS[label];
  const isEmpty = !value || value === '';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-text-secondary">
        {icon && <span className="opacity-60">{icon}</span>}
        <span className="text-[10.5px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <span className={['text-sm leading-snug', isEmpty ? 'text-text-secondary opacity-40' : 'text-text-primary font-medium'].join(' ')}>
        {isEmpty ? '—' : value}
      </span>
    </div>
  );
}

export default function MemberInfoCard({ member }: { member: Member }) {
  const age = calculateAge(member.birth_date);

  // Build initials for the avatar
  const initials = (member.full_name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-sm xl:col-span-1 md:col-span-2 overflow-hidden">

      {/* Header */}
      <div className="px-5 py-4 border-b border-border/10 flex items-center gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center text-sm font-black text-primary shrink-0 select-none">
          {initials}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-text-primary tracking-tight truncate">
            {member.full_name ?? '—'}
          </h2>
          <p className="text-[11px] text-text-secondary mt-px">Στοιχεία μέλους</p>
        </div>
      </div>

      {/* Fields grid */}
      <div className="p-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <DetailField label="Ονοματεπώνυμο" value={member.full_name} />
        <DetailField label="Τηλέφωνο"      value={member.phone} />
        <DetailField label="Email"          value={member.email ?? null} />
        <DetailField label="Ηλικία"         value={age != null ? `${age} ετών` : null} />
        <DetailField
          label="Ημ. γέννησης"
          value={member.birth_date ? new Date(member.birth_date).toLocaleDateString('el-GR') : null}
        />
        <DetailField label="Διεύθυνση"                value={member.address ?? null} />
        <DetailField label="ΑΦΜ"                      value={member.afm ?? null} />
        <DetailField
          label="Μέγιστο χρέος drop-in"
          value={member.max_dropin_debt != null ? `${member.max_dropin_debt} €` : null}
        />

        {/* Notes spans full width */}
        <div className="md:col-span-2">
          <DetailField label="Σημειώσεις" value={member.notes ?? null} />
        </div>
      </div>

    </div>
  );
}