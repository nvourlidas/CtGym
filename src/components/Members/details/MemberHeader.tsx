// src/components/members/details/MemberHeader.tsx
import { useNavigate } from 'react-router-dom';
import type { Member } from './types';
import { formatDateTimeEL } from './utils';

export default function MemberHeader({ member }: { member: Member }) {
  const navigate = useNavigate();

  return (
    <div className="rounded-xl border border-border/10 bg-secondary-background text-text-primary shadow">
      <div className="flex items-start justify-between px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Μέλος: {member.full_name ?? '—'}</h1>
          <div className="text-xs text-text-secondary mt-1">
            Εγγραφή: {formatDateTimeEL(member.created_at)}
          </div>
        </div>

        <button onClick={() => navigate(-1)} className="btn-secondary">
          Πίσω
        </button>
      </div>
    </div>
  );
}
