import type { QStatus, QType } from './types';

export function uid() {
  return crypto?.randomUUID?.() ?? `q_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export function typeNeedsOptions(t: QType) {
  return t === 'select' || t === 'radio' || t === 'checkbox';
}

export const TYPE_LABEL: Record<QType, string> = {
  text:     'Κείμενο (1 γραμμή)',
  textarea: 'Κείμενο (πολλές γραμμές)',
  number:   'Αριθμός',
  select:   'Dropdown',
  radio:    'Επιλογή (1)',
  checkbox: 'Επιλογές (πολλαπλές)',
  rating:   'Βαθμολογία',
  date:     'Ημερομηνία',
};

export const STATUS_META: Record<QStatus, { label: string; cls: string }> = {
  published: { label: 'Δημοσιευμένο', cls: 'border-success/35 bg-success/10 text-success' },
  draft:     { label: 'Πρόχειρο',     cls: 'border-warning/35 bg-warning/10 text-warning'  },
  archived:  { label: 'Αρχειοθέτηση', cls: 'border-border/25 bg-secondary/10 text-text-secondary' },
};
