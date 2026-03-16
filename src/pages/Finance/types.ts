export type FinanceCategoryRow = {
  id: string; tenant_id: string; name: string;
  kind: 'income' | 'expense'; color: string | null; position: number | null;
};
export type FinanceTransactionRow = {
  id: string; tenant_id: string; category_id: string | null;
  kind: 'income' | 'expense'; title: string; tx_date: string;
  amount: number; notes: string | null; created_by: string | null; created_at: string;
};
export type ModalMode = 'create' | 'edit';
export type FinanceFormValues = {
  title: string; kind: 'income' | 'expense'; txDate: Date | null;
  categoryId: string | 'none'; amount: string; notes: string;
};
export type GymDebt = { membership_debt: number; dropin_debt: number; total_debt: number };
export type DatePreset = 'custom' | 'this_week' | 'this_month' | 'month' | 'this_year';
