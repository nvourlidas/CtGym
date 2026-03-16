import { ChevronDown } from 'lucide-react';

export default function StyledSelect({ value, onChange, children, className = '' }: any) {
  return (
    <div className={`relative ${className}`}>
      <select value={value} onChange={onChange} className="w-full h-9 pl-3.5 pr-9 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary appearance-none outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer">
        {children}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
    </div>
  );
}
