import { ChevronDown } from 'lucide-react';

export default function StyledSelect({ value, onChange, disabled, children }: any) {
  return (
    <div className="relative">
      <select value={value} onChange={onChange} disabled={disabled}
        className="w-full h-9 pl-3.5 pr-8 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 appearance-none disabled:opacity-50"
      >{children}</select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary pointer-events-none" />
    </div>
  );
}
