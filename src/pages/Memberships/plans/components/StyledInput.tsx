export default function StyledInput({ value, onChange, type = 'text', placeholder, min, step, className = '' }: any) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} min={min} step={step}
      className={`w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary ${className}`}
    />
  );
}
