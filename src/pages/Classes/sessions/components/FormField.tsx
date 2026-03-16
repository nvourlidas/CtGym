type Props = { label: string; children: React.ReactNode };

export default function FormField({ label, children }: Props) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">{label}</label>
      {children}
    </div>
  );
}
