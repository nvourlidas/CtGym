export type Member = { id: string; full_name: string | null };
export type SessionRow = {
  id: string; starts_at: string; ends_at: string | null; capacity: number | null;
  classes?: { id: string; title: string; class_categories?: { name: string; color: string | null } | null } | null;
};
export type Booking = {
  id: string; tenant_id: string; session_id: string; user_id: string;
  status: string | null; created_at: string;
  booking_type?: 'membership' | 'drop_in' | string | null;
  drop_in_price?: number | null;
  profile?: Member | null; session?: SessionRow | null;
};
export type StatusCode = 'booked' | 'checked_in' | 'canceled' | 'no_show';
export type DateFilterMode = 'all' | 'today' | 'custom';

export const STATUS_OPTIONS: { value: StatusCode; label: string }[] = [
  { value: 'booked',     label: 'Κρατήθηκε' },
  { value: 'checked_in', label: 'Παρουσία' },
  { value: 'canceled',   label: 'Ακυρώθηκε' },
  { value: 'no_show',    label: 'Δεν προσήλθε' },
];

export const STATUS_STYLE: Record<StatusCode, string> = {
  booked:     'border-sky-500/40 bg-sky-500/10 text-sky-500',
  checked_in: 'border-success/40 bg-success/10 text-success',
  canceled:   'border-danger/40 bg-danger/10 text-danger',
  no_show:    'border-warning/40 bg-warning/10 text-warning',
};

export const STATUS_LABEL: Record<StatusCode, string> = {
  booked: 'Κρατήθηκε', checked_in: 'Παρουσία', canceled: 'Ακυρώθηκε', no_show: 'Δεν προσήλθε',
};
