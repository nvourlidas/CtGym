import type { Category } from '../types';

export default function CategoryChip({ cat }: { cat: Category }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border border-border/15 bg-secondary/20">
      {cat.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />}
      {cat.name}
    </span>
  );
}
