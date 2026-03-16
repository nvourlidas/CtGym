import type { StatusCode } from '../types';
import { STATUS_STYLE, STATUS_LABEL } from '../types';

export default function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? 'booked') as StatusCode;
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-lg border ${STATUS_STYLE[s] ?? ''}`}>
      {STATUS_LABEL[s] ?? s}
    </span>
  );
}
