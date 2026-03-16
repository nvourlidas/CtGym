import { Check } from 'lucide-react';

type Props = { checked: boolean; onChange: (v: boolean) => void; label: string };

export default function CustomCheckbox({ checked, onChange, label }: Props) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={[
          'w-4 h-4 rounded-md border flex items-center justify-center transition-all cursor-pointer shrink-0',
          checked ? 'bg-primary border-primary' : 'border-border/30 hover:border-primary/50',
        ].join(' ')}
      >
        {checked && <Check className="h-2.5 w-2.5 text-white" />}
      </div>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm text-text-primary">{label}</span>
    </label>
  );
}
