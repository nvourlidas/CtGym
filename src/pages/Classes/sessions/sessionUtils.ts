export function isoToTimeInput(iso: string) {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function dateAndTimeToUtcIso(dateOnly: Date, hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(dateOnly);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

export function formatTime(iso: string) {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function startOfWeek(d: Date) { const x = startOfDay(d); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; }
export function startOfMonth(d: Date) { const x = startOfDay(d); x.setDate(1); return x; }
