import type { LucideIcon } from 'lucide-react';

type Props = {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  locked?: boolean;
  disabled?: boolean;
  className?: string;
};

export default function ActionBtn({ icon: Icon, label, onClick, locked, disabled, className = '' }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={[
        'h-9 px-3.5 rounded-xl border text-sm font-medium inline-flex items-center gap-2 transition-all duration-150',
        locked || disabled
          ? 'border-border/10 text-text-secondary opacity-50 cursor-not-allowed'
          : 'border-border/15 text-text-primary hover:bg-secondary/30 cursor-pointer',
        className,
      ].join(' ')}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="hidden sm:inline">{label}</span>
      {locked && <span className="text-[10px] opacity-70">🔒</span>}
    </button>
  );
}
