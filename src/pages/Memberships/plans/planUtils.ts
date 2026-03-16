import type { Plan } from './types';

export async function readEdgeErrorPayload(err: any): Promise<any | null> {
  const res: Response | undefined = err?.context;
  if (!res) return null;
  try { return await res.clone().json(); }
  catch { try { const t = await res.clone().text(); return t ? { error: t } : null; } catch { return null; } }
}

export function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);
}

export function formatDateDMY(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

export function renderBenefits(p: Plan) {
  return [p.duration_days ? `${p.duration_days} μέρες` : null, p.session_credits ? `${p.session_credits} συνεδρίες` : null].filter(Boolean).join(' • ') || '—';
}

export const PLAN_KIND_LABEL: Record<string, string> = {
  duration: 'Διάρκεια', sessions: 'Συνεδρίες', hybrid: 'Υβριδικό',
};

export const PLAN_KIND_COLOR: Record<string, string> = {
  duration: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
  sessions: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  hybrid: 'border-purple-500/40 bg-purple-500/10 text-purple-400',
};
