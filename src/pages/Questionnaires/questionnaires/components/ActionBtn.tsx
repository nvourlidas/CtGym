import type { LucideIcon } from 'lucide-react';

export default function ActionBtn({ icon: Icon, label, onClick, disabled, spin, titleOverride }: {
  icon: LucideIcon; label: string; onClick: () => void;
  disabled?: boolean; spin?: boolean; titleOverride?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={titleOverride ?? label} aria-label={label}
      className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all disabled:opacity-50 cursor-pointer"
    >
      <Icon className={`h-3.5 w-3.5 ${spin ? 'animate-spin' : ''}`} />
    </button>
  );
}
