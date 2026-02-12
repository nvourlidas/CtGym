// src/components/members/details/utils.ts
import type { BookingStatus, EconomicSummary } from './types';

export function calculateAge(birthDateStr?: string | null): number | null {
  if (!birthDateStr) return null;
  const birthDate = new Date(birthDateStr);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age--;
  return age >= 0 ? age : null;
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  booked: 'Κράτηση',
  checked_in: 'Checked in',
  canceled: 'Ακυρώθηκε',
  no_show: 'Απουσία',
};

export const STATUS_BADGE_CLASS: Record<BookingStatus, string> = {
  booked: 'border-primary bg-primary/10 text-primary',
  checked_in: 'border-success/40 bg-success/10 text-success',
  no_show: 'border-warning/40 bg-warning/10 text-warning',
  canceled: 'border-danger/40 bg-danger/10 text-danger',
};

export function formatDateTimeEL(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('el-GR') : '—';
}

export function formatMoneyEUR(value: number) {
  return `${value.toFixed(2)} €`;
}

export function toYMD(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export function parseYMD(ymd: string) {
  const [y, m, day] = ymd.split('-').map(Number);
  return new Date(y, m - 1, day);
}

export function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

export function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function fmtMonthEL(d: Date) {
  return d.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' });
}

export function fmtDayEL(ymd: string) {
  const d = parseYMD(ymd);
  return d.toLocaleDateString('el-GR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function calculateEconomicSummary(memberships: any[], bookings: any[]): EconomicSummary {
  let membershipDebt = 0;
  let membershipTotal = 0;

  for (const m of memberships) {
    const debtVal = Number(m.debt ?? 0);
    const effectivePrice = m.custom_price ?? m.plan_price ?? 0;
    const priceVal = Number(effectivePrice);

    if (Number.isFinite(debtVal)) membershipDebt += debtVal;
    if (Number.isFinite(priceVal)) membershipTotal += priceVal;
  }

  let dropinDebt = 0;
  let dropinTotal = 0;

  for (const b of bookings) {
    if (b.booking_type !== 'drop_in') continue;

    const priceVal = Number(b.drop_in_price ?? 0);
    if (!Number.isFinite(priceVal)) continue;

    dropinTotal += priceVal;
    if (b.drop_in_paid === false) dropinDebt += priceVal;
  }

  return {
    membershipDebt,
    dropinDebt,
    membershipTotal,
    dropinTotal,
    combinedTotal: membershipTotal + dropinTotal,
  };
}
