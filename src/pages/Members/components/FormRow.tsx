type Props = {
  label: string;
  children: React.ReactNode;
};

export default function FormRow({ label, children }: Props) {
  return (
    <label className="block mb-3">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-text-secondary">{label}</div>
      {children}
    </label>
  );
}
