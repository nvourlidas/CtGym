export default function StyledTextarea({ value, onChange, disabled, placeholder, rows = 3 }: any) {
  return (
    <textarea
      value={value} onChange={onChange} disabled={disabled} placeholder={placeholder} rows={rows}
      className="w-full px-3.5 py-2.5 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all resize-none placeholder:text-text-secondary disabled:opacity-50"
    />
  );
}
