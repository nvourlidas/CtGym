export function translateErrorMessage(raw: string): string {
  if (!raw) return 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.';
  if (raw.includes('no_eligible_membership_for_booking') || raw.includes('Edge Function returned a non-2xx status code'))
    return 'Δεν έχει το κατάλληλο πλάνο για αυτό το μάθημα.';
  if (raw.includes('drop_in_debt_limit_exceeded'))
    return 'Το μέλος έχει ξεπεράσει το επιτρεπτό όριο οφειλής για drop-in.';
  return raw;
}

export function formatDateDMY(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
