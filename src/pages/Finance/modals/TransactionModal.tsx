import { useEffect, useState, type ChangeEvent } from 'react';
import { supabase } from '../../../lib/supabase';
import { AlertTriangle, Euro, Receipt, TrendingUp, TrendingDown } from 'lucide-react';
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale';
import type { FinanceCategoryRow, FinanceFormValues, FinanceTransactionRow, ModalMode } from '../types';
import { dateToISODate, parseISODateToLocal } from '../financeUtils';
import ModalShell from '../components/ModalShell';
import { FormField, StyledInput, StyledTextarea, StyledSelect } from '../components/formWidgets';
import { PrimaryBtn, SecondaryBtn } from '../components/Buttons';

export default function TransactionModal({ open, mode, tenantId, profileId, categories, initialTransaction, onClose, onSaved }: {
  open: boolean; mode: ModalMode; tenantId: string | null; profileId: string | null;
  categories: FinanceCategoryRow[]; initialTransaction: FinanceTransactionRow | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [values, setValues] = useState<FinanceFormValues>({ title: '', kind: 'income', txDate: new Date(), categoryId: 'none', amount: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initialTransaction) {
      setValues({ title: initialTransaction.title, kind: initialTransaction.kind, txDate: parseISODateToLocal(initialTransaction.tx_date) ?? new Date(), categoryId: initialTransaction.category_id ?? 'none', amount: String(initialTransaction.amount ?? ''), notes: initialTransaction.notes ?? '' });
    } else {
      setValues({ title: '', kind: 'income', txDate: new Date(), categoryId: 'none', amount: '', notes: '' });
    }
    setError(null);
  }, [open, mode, initialTransaction]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!tenantId) { setError('Λείπει το tenant_id.'); return; }
    if (!values.title.trim()) { setError('Συμπλήρωσε τίτλο.'); return; }
    if (!values.txDate) { setError('Συμπλήρωσε ημερομηνία.'); return; }
    const amount = Number(values.amount.replace(',', '.'));
    if (isNaN(amount) || amount < 0) { setError('Το ποσό πρέπει να είναι έγκυρος αριθμός (>= 0).'); return; }
    setSaving(true); setError(null);
    const payload: any = { tenant_id: tenantId, title: values.title.trim(), kind: values.kind, tx_date: dateToISODate(values.txDate), amount, notes: values.notes.trim() || null, category_id: values.categoryId === 'none' ? null : values.categoryId, created_by: profileId };
    try {
      if (mode === 'create') {
        const { error: e } = await supabase.from('finance_transactions').insert(payload);
        if (e) { setError(e.message); setSaving(false); return; }
      } else if (mode === 'edit' && initialTransaction) {
        const { error: e } = await supabase.from('finance_transactions').update(payload).eq('id', initialTransaction.id).eq('tenant_id', tenantId);
        if (e) { setError(e.message); setSaving(false); return; }
      }
      setSaving(false); onSaved(); onClose();
    } catch { setError('Κάτι πήγε στραβά.'); setSaving(false); }
  };

  if (!open) return null;

  return (
    <ModalShell
      title={mode === 'create' ? 'Νέα Κίνηση' : 'Επεξεργασία Κίνησης'}
      icon={<Receipt className="h-4 w-4 text-primary" />}
      onClose={onClose}
      footer={<><SecondaryBtn label="Ακύρωση" onClick={onClose} disabled={saving} /><PrimaryBtn busy={saving} busyLabel="Αποθήκευση…" label="Αποθήκευση" onClick={handleSubmit} /></>}
    >
      <FormField label="Τίτλος">
        <StyledInput name="title" value={values.title} onChange={handleChange} placeholder="π.χ. Συνδρομή Πελάτη" />
      </FormField>

      <FormField label="Τύπος">
        <div className="grid grid-cols-2 gap-2">
          {(['income', 'expense'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setValues((p) => ({ ...p, kind: k }))}
              className={['px-4 py-3 rounded-xl border text-sm font-bold transition-all cursor-pointer',
                values.kind === k
                  ? (k === 'income' ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger')
                  : 'border-border/15 text-text-secondary hover:border-primary/25 hover:text-text-primary',
              ].join(' ')}
            >
              {k === 'income' ? <><TrendingUp className="h-4 w-4 mx-auto mb-1" />Έσοδο</> : <><TrendingDown className="h-4 w-4 mx-auto mb-1" />Έξοδο</>}
            </button>
          ))}
        </div>
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Ποσό (€)">
          <div className="relative">
            <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input type="number" name="amount" step="0.01" min={0} value={values.amount} onChange={handleChange} placeholder="150.00"
              className="w-full h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary"
            />
          </div>
        </FormField>
        <FormField label="Ημερομηνία">
          <DatePicker selected={values.txDate} onChange={(d) => setValues((p) => ({ ...p, txDate: d }))}
            dateFormat="dd/MM/yyyy" locale={el} placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
            className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all"
            wrapperClassName="w-full" showMonthDropdown showYearDropdown dropdownMode="select" scrollableYearDropdown yearDropdownItemNumber={80}
          />
        </FormField>
      </div>

      <FormField label="Κατηγορία">
        <StyledSelect name="categoryId" value={values.categoryId} onChange={handleChange}>
          <option value="none">Χωρίς κατηγορία</option>
          {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name} ({cat.kind === 'income' ? 'Έσοδο' : 'Έξοδο'})</option>)}
        </StyledSelect>
      </FormField>

      <FormField label="Σημειώσεις">
        <StyledTextarea name="notes" value={values.notes} onChange={handleChange} placeholder="Προαιρετικές σημειώσεις…" />
      </FormField>

      {error && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-danger/25 bg-danger/8 text-danger text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}
        </div>
      )}
    </ModalShell>
  );
}
