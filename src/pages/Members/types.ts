export type Member = {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  tenant_id: string;
  role: string;
  created_at: string;
  birth_date: string | null;
  address: string | null;
  afm: string | null;
  max_dropin_debt: number | null;
  email: string | null;
  notes: string | null;
};

export type TenantRow = { name: string };

export type ColumnKey =
  | 'email' | 'birth_date' | 'address' | 'afm'
  | 'total_debt' | 'max_dropin_debt' | 'created_at' | 'notes';

export const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'email',          label: 'Email' },
  { key: 'birth_date',     label: 'Ημ. Γέννησης' },
  { key: 'address',        label: 'Διεύθυνση' },
  { key: 'afm',            label: 'ΑΦΜ' },
  { key: 'total_debt',     label: 'Συνολική Οφειλή' },
  { key: 'max_dropin_debt',label: 'Max Drop-in Οφειλή' },
  { key: 'notes',          label: 'Σημειώσεις' },
  { key: 'created_at',     label: 'Ημ. Δημιουργίας' },
];

export const DEFAULT_VISIBLE: ColumnKey[] = ['total_debt', 'max_dropin_debt', 'created_at'];

export type Toast = {
  id: string;
  title: string;
  message?: string;
  variant?: 'error' | 'success' | 'info';
  actionLabel?: string;
  onAction?: () => void;
};
