export type QuestionnaireStatus = 'draft' | 'published' | 'archived';
export type ToastType = 'success' | 'error' | 'info';

export type Questionnaire = {
  id: string; tenant_id: string; title: string;
  description: string | null; status: QuestionnaireStatus; created_at: string;
};

export const STATUS_META: Record<QuestionnaireStatus, { label: string; cls: string }> = {
  published: { label: 'Δημοσιευμένο', cls: 'border-success/35 bg-success/10 text-success' },
  draft:     { label: 'Πρόχειρο',     cls: 'border-warning/35 bg-warning/10 text-warning'  },
  archived:  { label: 'Αρχειοθέτηση', cls: 'border-border/25 bg-secondary/10 text-text-secondary' },
};
