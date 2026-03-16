type Props = { label: string; icon?: React.ReactNode; children: React.ReactNode };

export default function FormField({ label, icon, children }: Props) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary">
        {icon && <span className="opacity-60">{icon}</span>}
        {label}
      </label>
      {children}
    </div>
  );
}
