export default function StyledInput({ value, onChange, disabled, placeholder, className = '' }: any) {
  return (
    <input
      value={value} onChange={onChange} disabled={disabled} placeholder={placeholder}
      className={`w-full h-9 px-3.5 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary disabled:opacity-50 ${className}`}
    />
  );
}
