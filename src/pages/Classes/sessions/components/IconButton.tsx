import type { LucideIcon } from 'lucide-react';

type Props = { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean };

export default function IconButton({ icon: Icon, label, onClick, disabled }: Props) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-border/15 text-text-secondary hover:text-text-primary hover:bg-secondary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
      aria-label={label}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
