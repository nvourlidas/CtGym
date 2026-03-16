import type { SessionWithRelations, SessionClassRel } from './types';

export function getSessionClass(s: SessionWithRelations): SessionClassRel | null {
  if (!s.classes) return null;
  return Array.isArray(s.classes) ? s.classes[0] ?? null : s.classes;
}

export function pad2(n: number) { return String(n).padStart(2, '0'); }
export function isoToLocalHHMM(iso: string) { const d = new Date(iso); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
export function normalizeHHMM(v: string) { const [h, m] = v.split(':'); return `${pad2(Number(h || 0))}:${pad2(Number(m || 0))}`; }
export function toDateInputValue(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
export function dateInputToLocalStart(v: string) { const [y, m, d] = v.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0); }
export function formatDateDMY(date: Date) { return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`; }
export function startOfWeekMonday(date: Date) {
  const d = new Date(date); const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff); d.setHours(0, 0, 0, 0); return d;
}
export function addDaysSimple(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
export function formatTimeRange(startIso: string, endIso: string | null) {
  const s = new Date(startIso);
  const base = `${pad2(s.getHours())}:${pad2(s.getMinutes())}`;
  if (!endIso) return base;
  const e = new Date(endIso);
  return `${base} – ${pad2(e.getHours())}:${pad2(e.getMinutes())}`;
}

export const WEEKDAY_LABELS = ['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ'];

export const MEMBERSHIP_ERROR_CODES = [
  'no_active_membership',
  'membership_category_mismatch',
  'no_eligible_membership_for_booking',
  'drop_in_not_allowed_for_class',
];

export function isMembershipErrorMessage(msg: string) {
  return MEMBERSHIP_ERROR_CODES.some((c) => msg.includes(c));
}
