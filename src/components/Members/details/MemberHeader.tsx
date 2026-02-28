// src/components/members/details/MemberHeader.tsx
import { useNavigate } from 'react-router-dom';
import type { Member } from './types';
import { formatDateTimeEL } from './utils';
import { ArrowLeft, CalendarClock } from 'lucide-react';

export default function MemberHeader({ member }: { member: Member }) {
  const navigate = useNavigate();

  const initials = (member.full_name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-sm overflow-hidden">
      {/* Subtle top gradient bar */}
      <div className="h-[3px] w-full bg-gradient-to-r from-primary/0 via-primary/60 to-primary/0" />

      <div className="flex items-center justify-between gap-4 px-5 py-4">
        {/* Left: avatar + info */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center text-base font-black text-primary shrink-0 select-none">
            {initials}
          </div>

          <div className="min-w-0">
            <h1 className="text-lg font-black text-text-primary tracking-tight leading-none truncate">
              {member.full_name ?? '—'}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-text-secondary">
              <CalendarClock className="h-3 w-3 opacity-60 shrink-0" />
              <span>Εγγραφή: {formatDateTimeEL(member.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Right: back button */}
        <button
          onClick={() => navigate(-1)}
          className="group inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all duration-150 cursor-pointer shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" />
          <span className="hidden sm:inline">Πίσω</span>
        </button>
      </div>
    </div>
  );
}