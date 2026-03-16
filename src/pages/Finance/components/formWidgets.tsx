import { ChevronDown } from 'lucide-react';

export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">{label}</label>
      {children}
    </div>
  );
}

export function StyledInput({ value, onChange, name, type = 'text', placeholder, className = '' }: any) {
  return (
    <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder}
      className={`w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary ${className}`}
    />
  );
}

export function StyledTextarea({ value, onChange, name, rows = 3, placeholder }: any) {
  return (
    <textarea name={name} value={value} onChange={onChange} rows={rows} placeholder={placeholder}
      className="w-full px-3.5 py-2.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all resize-none placeholder:text-text-secondary"
    />
  );
}

export function StyledSelect({ value, onChange, name, children, disabled }: any) {
  return (
    <div className="relative">
      <select name={name} value={value} onChange={onChange} disabled={disabled}
        className="w-full h-9 pl-3.5 pr-9 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary appearance-none outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer disabled:opacity-50"
      >{children}</select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
    </div>
  );
}
