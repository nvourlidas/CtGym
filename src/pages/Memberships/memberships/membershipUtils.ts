export function formatDateDMY(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

export function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);
}

export function dateToISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: 'Ενεργή', cls: 'border-success/40 bg-success/10 text-success' },
  paused: { label: 'Σε παύση', cls: 'border-warning/40 bg-warning/10 text-warning' },
  cancelled: { label: 'Ακυρωμένη', cls: 'border-danger/40 bg-danger/10 text-danger' },
  expired: { label: 'Έληξε', cls: 'border-border/30 bg-secondary/20 text-text-secondary' },
};

export function getStatus(s?: string | null) {
  return STATUS_META[(s ?? 'active').toLowerCase()] ?? { label: 'Άγνωστη', cls: 'border-border/30 bg-secondary/20 text-text-secondary' };
}
