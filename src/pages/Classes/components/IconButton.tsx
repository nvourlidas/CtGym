import type { LucideIcon } from 'lucide-react';

type Props = { icon: LucideIcon; label: string; onClick: () => void };

export default function IconButton({ icon: Icon, label, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-border/15 text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
      aria-label={label}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
