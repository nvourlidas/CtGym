// src/pages/FinancePage.tsx
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { supabase } from '../lib/supabase'; // adjust if needed
import { useAuth } from '../auth';
import { Pencil, Trash2 } from 'lucide-react';
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale';

type FinanceCategoryRow = {
  id: string;
  tenant_id: string;
  name: string;
  kind: 'income' | 'expense';
  color: string | null;
  position: number | null;
};

type FinanceTransactionRow = {
  id: string;
  tenant_id: string;
  category_id: string | null;
  kind: 'income' | 'expense';
  title: string;
  tx_date: string; // "YYYY-MM-DD"
  amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

type ModalMode = 'create' | 'edit';

type FinanceFormValues = {
  title: string;
  kind: 'income' | 'expense';
  txDate: Date | null;
  categoryId: string | 'none';
  amount: string;
  notes: string;
};

type FinanceTransactionModalProps = {
  open: boolean;
  mode: ModalMode;
  tenantId: string | null;
  profileId: string | null;
  categories: FinanceCategoryRow[];
  initialTransaction: FinanceTransactionRow | null;
  onClose: () => void;
  onSaved: () => void;
};

type FinanceCategoriesModalProps = {
  open: boolean;
  tenantId: string | null;
  categories: FinanceCategoryRow[];
  onClose: () => void;
  onChanged: () => void;
};

type GymDebt = {
  membership_debt: number;
  dropin_debt: number;
  total_debt: number;
};


type DatePreset = 'custom' | 'this_week' | 'this_month' | 'month' | 'this_year';

/* ---------- Helpers ---------- */

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('el-GR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value);
}

function dateToISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`; // "YYYY-MM-DD"
}

function parseISODateToLocal(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDateDMY(dateStr: string): string {
  const d = parseISODateToLocal(dateStr);
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun,1=Mon,...6=Sat
  const diff = day === 0 ? -6 : 1 - day; // make Monday first
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ---------- Transaction Modal ---------- */

function FinanceTransactionModal({
  open,
  mode,
  tenantId,
  profileId,
  categories,
  initialTransaction,
  onClose,
  onSaved,
}: FinanceTransactionModalProps) {
  const [values, setValues] = useState<FinanceFormValues>({
    title: '',
    kind: 'income',
    txDate: new Date(),
    categoryId: 'none',
    amount: '',
    notes: '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    if (mode === 'edit' && initialTransaction) {
      setValues({
        title: initialTransaction.title,
        kind: initialTransaction.kind,
        txDate: parseISODateToLocal(initialTransaction.tx_date) ?? new Date(),
        categoryId: initialTransaction.category_id ?? 'none',
        amount: String(initialTransaction.amount ?? ''),
        notes: initialTransaction.notes ?? '',
      });
    } else {
      setValues({
        title: '',
        kind: 'income',
        txDate: new Date(),
        categoryId: 'none',
        amount: '',
        notes: '',
      });
    }
    setError(null);
  }, [open, mode, initialTransaction]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setValues((prev) => ({
      ...prev,
      [name]: value,
    }));
  };


  const handleDateChange = (date: Date | null) => {
    setValues((prev) => ({
      ...prev,
      txDate: date,
    }));
  };

  const handleSubmit = async () => {
    if (!tenantId) {
      setError('Λείπει το tenant_id του χρήστη.');
      return;
    }

    if (!values.title.trim()) {
      setError('Συμπλήρωσε τίτλο.');
      return;
    }

    if (!values.txDate) {
      setError('Συμπλήρωσε ημερομηνία.');
      return;
    }

    const amountNumber = Number(values.amount.replace(',', '.'));
    if (isNaN(amountNumber) || amountNumber < 0) {
      setError('Το ποσό πρέπει να είναι έγκυρος αριθμός (>= 0).');
      return;
    }

    setSaving(true);
    setError(null);

    const payload: any = {
      tenant_id: tenantId,
      title: values.title.trim(),
      kind: values.kind,
      tx_date: dateToISODate(values.txDate),
      amount: amountNumber,
      notes: values.notes.trim() || null,
      category_id: values.categoryId === 'none' ? null : values.categoryId,
      created_by: profileId,
    };

    try {
      if (mode === 'create') {
        const { error: insertError } = await supabase
          .from('finance_transactions')
          .insert(payload);

        if (insertError) {
          console.error(insertError);
          setError(insertError.message);
          setSaving(false);
          return;
        }
      } else if (mode === 'edit' && initialTransaction) {
        const { error: updateError } = await supabase
          .from('finance_transactions')
          .update(payload)
          .eq('id', initialTransaction.id)
          .eq('tenant_id', tenantId);

        if (updateError) {
          console.error(updateError);
          setError(updateError.message);
          setSaving(false);
          return;
        }
      }

      setSaving(false);
      onSaved();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError('Κάτι πήγε στραβά κατά την αποθήκευση.');
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <Modal
      title={mode === 'create' ? 'Νέα Κίνηση' : 'Επεξεργασία Κίνησης'}
      onClose={onClose}
    >
      <FormRow label="Τίτλος">
        <input
          name="title"
          value={values.title}
          onChange={handleChange}
          className="input"
          placeholder="π.χ. Συνδρομή Πελάτη"
        />
      </FormRow>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormRow label="Τύπος">
          <select
            name="kind"
            value={values.kind}
            onChange={handleChange}
            className="input"
          >
            <option value="income">Έσοδο</option>
            <option value="expense">Έξοδο</option>
          </select>
        </FormRow>

        <FormRow label="Ημερομηνία">
          <DatePicker
            selected={values.txDate}
            onChange={handleDateChange}
            dateFormat="dd/MM/yyyy"
            locale={el}
            placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
            className="input"
            wrapperClassName="w-full"
            showMonthDropdown
            showYearDropdown
            dropdownMode="select"
            scrollableYearDropdown
            yearDropdownItemNumber={80}
          />
        </FormRow>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormRow label="Κατηγορία">
          <select
            name="categoryId"
            value={values.categoryId}
            onChange={handleChange}
            className="input"
          >
            <option value="none">Χωρίς κατηγορία</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name} ({cat.kind === 'income' ? 'Έσοδο' : 'Έξοδο'})
              </option>
            ))}
          </select>
        </FormRow>

        <FormRow label="Ποσό">
          <input
            name="amount"
            value={values.amount}
            onChange={handleChange}
            className="input"
            placeholder="π.χ. 150.00"
          />
        </FormRow>
      </div>

      <FormRow label="Σημειώσεις">
        <textarea
          name="notes"
          value={values.notes}
          onChange={handleChange}
          rows={3}
          className="input"
          placeholder="Προαιρετικές σημειώσεις..."
        />
      </FormRow>

      {error && (
        <div className="mt-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {error}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          className="btn-secondary"
        >
          Ακύρωση
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={handleSubmit}
          className="btn-primary"
        >
          {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- Categories Modal (with color picker) ---------- */

function FinanceCategoriesModal({
  open,
  tenantId,
  categories,
  onClose,
  onChanged,
}: FinanceCategoriesModalProps) {
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<'income' | 'expense'>('income');
  const [newColor, setNewColor] = useState('');
  const [savingNew, setSavingNew] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editKind, setEditKind] = useState<'income' | 'expense'>('income');
  const [editColor, setEditColor] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setNewName('');
      setNewColor('');
      setNewKind('income');
      setEditingId(null);
      setEditName('');
      setEditColor('');
      setEditKind('income');
      setError(null);
    }
  }, [open]);

  const handleAddCategory = async () => {
    if (!tenantId) {
      setError('Λείπει το tenant_id.');
      return;
    }
    if (!newName.trim()) {
      setError('Συμπλήρωσε όνομα κατηγορίας.');
      return;
    }

    setSavingNew(true);
    setError(null);

    try {
      const payload: any = {
        tenant_id: tenantId,
        name: newName.trim(),
        kind: newKind,
        color: newColor.trim() || null,
        position: (categories?.length ?? 0) + 1,
      };

      const { error: insertError } = await supabase
        .from('finance_categories')
        .insert(payload);

      if (insertError) {
        console.error(insertError);
        setError(insertError.message);
        setSavingNew(false);
        return;
      }

      setNewName('');
      setNewColor('');
      setNewKind('income');
      setSavingNew(false);
      onChanged();
    } catch (err: any) {
      console.error(err);
      setError('Κάτι πήγε στραβά κατά τη δημιουργία.');
      setSavingNew(false);
    }
  };

  const startEdit = (cat: FinanceCategoryRow) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditKind(cat.kind);
    setEditColor(cat.color ?? '');
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditKind('income');
    setEditColor('');
  };

  const handleSaveEdit = async () => {
    if (!tenantId || !editingId) return;
    if (!editName.trim()) {
      setError('Συμπλήρωσε όνομα κατηγορίας.');
      return;
    }

    setBusyId(editingId);
    setError(null);

    try {
      const payload: any = {
        name: editName.trim(),
        kind: editKind,
        color: editColor.trim() || null,
      };

      const { error: updateError } = await supabase
        .from('finance_categories')
        .update(payload)
        .eq('id', editingId)
        .eq('tenant_id', tenantId);

      if (updateError) {
        console.error(updateError);
        setError(updateError.message);
        setBusyId(null);
        return;
      }

      setBusyId(null);
      cancelEdit();
      onChanged();
    } catch (err: any) {
      console.error(err);
      setError('Κάτι πήγε στραβά κατά την αποθήκευση.');
      setBusyId(null);
    }
  };

  const handleDelete = async (cat: FinanceCategoryRow) => {
    if (!tenantId) return;
    const confirmed = window.confirm(
      `Διαγραφή κατηγορίας "${cat.name}" ; Οι κινήσεις θα παραμείνουν αλλά χωρίς κατηγορία.`
    );
    if (!confirmed) return;

    setBusyId(cat.id);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('finance_categories')
        .delete()
        .eq('id', cat.id)
        .eq('tenant_id', tenantId);

      if (deleteError) {
        console.error(deleteError);
        setError(deleteError.message);
        setBusyId(null);
        return;
      }

      setBusyId(null);
      if (editingId === cat.id) {
        cancelEdit();
      }
      onChanged();
    } catch (err: any) {
      console.error(err);
      setError('Κάτι πήγε στραβά κατά τη διαγραφή.');
      setBusyId(null);
    }
  };

  if (!open) return null;

  return (
    <Modal title="Κατηγορίες Οικονομικών" onClose={onClose}>
      <p className="mb-4 text-sm opacity-80">
        Οργάνωσε τις κατηγορίες για τα έσοδα και τα έξοδά σου (π.χ. Συνδρομές, Μισθοδοσία,
        Ενοίκιο, Λογαριασμοί).
      </p>

      {/* New category form */}
      <div className="mb-4 rounded-md border border-border/10 bg-secondary/10 p-3 text-xs">
        <div className="mb-2 text-[0.70rem] font-semibold uppercase tracking-wide opacity-70">
          Νέα Κατηγορία
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <FormRow label="Όνομα">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="input"
              placeholder="π.χ. Συνδρομές"
            />
          </FormRow>
          <FormRow label="Τύπος">
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as 'income' | 'expense')}
              className="input"
            >
              <option value="income">Έσοδο</option>
              <option value="expense">Έξοδο</option>
            </select>
          </FormRow>
          <FormRow label="Χρώμα (προαιρετικό)">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newColor || '#22c55e'}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-8 w-10 rounded border border-border/20 bg-transparent"
              />
              <input
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="input flex-1"
                placeholder="#22c55e"
              />
            </div>
          </FormRow>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleAddCategory}
            disabled={savingNew}
            className="btn-primary"
          >
            {savingNew ? 'Προσθήκη...' : 'Προσθήκη Κατηγορίας'}
          </button>
        </div>
      </div>

      {/* Existing categories */}
      <div className="overflow-hidden rounded-md border border-border/10 bg-secondary/10">
        <div className="max-h-72 overflow-auto">
          <table className="min-w-full text-left text-xs no-scrollbar">
            <thead className="bg-secondary-background/60 text-[0.70rem] uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-3 py-2">Όνομα</th>
                <th className="px-3 py-2">Τύπος</th>
                <th className="px-3 py-2">Χρώμα</th>
                <th className="px-3 py-2 text-right">Ενέργειες</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-3 text-center text-xs text-text-secondary"
                  >
                    Δεν υπάρχουν κατηγορίες ακόμα.
                  </td>
                </tr>
              )}

              {categories.map((cat) => {
                const isEditing = editingId === cat.id;
                return (
                  <tr
                    key={cat.id}
                    className="border-t border-border/10 hover:bg-secondary/10"
                  >
                    <td className="px-3 py-2 align-middle text-[0.75rem]">
                      {isEditing ? (
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="input"
                        />
                      ) : (
                        cat.name
                      )}
                    </td>
                    <td className="px-3 py-2 align-middle text-[0.75rem]">
                      {isEditing ? (
                        <select
                          value={editKind}
                          onChange={(e) =>
                            setEditKind(e.target.value as 'income' | 'expense')
                          }
                          className="input"
                        >
                          <option value="income">Έσοδο</option>
                          <option value="expense">Έξοδο</option>
                        </select>
                      ) : (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${cat.kind === 'income'
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-500/10 text-rose-300 border border-rose-500/40'
                            }`}
                        >
                          {cat.kind === 'income' ? 'Έσοδο' : 'Έξοδο'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-middle text-[0.75rem]">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={editColor || '#22c55e'}
                            onChange={(e) => setEditColor(e.target.value)}
                            className="h-6 w-8 rounded border border-border/20 bg-transparent"
                          />
                          <input
                            value={editColor}
                            onChange={(e) => setEditColor(e.target.value)}
                            className="input flex-1"
                            placeholder="#22c55e"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{cat.color ?? '—'}</span>
                          {cat.color && (
                            <span
                              className="inline-block h-3 w-3 rounded-full border border-border/20"
                              style={{ backgroundColor: cat.color }}
                            />
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-middle text-right">
                      <div className="inline-flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              disabled={busyId === cat.id}
                              onClick={handleSaveEdit}
                              className="btn-primary px-3 py-1 text-[0.70rem]"
                            >
                              Αποθήκευση
                            </button>
                            <button
                              type="button"
                              disabled={busyId === cat.id}
                              onClick={cancelEdit}
                              className="btn-secondary px-3 py-1 text-[0.70rem]"
                            >
                              Άκυρο
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(cat)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/10 hover:bg-secondary/20"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={busyId === cat.id}
                              onClick={() => handleDelete(cat)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/60 text-red-400 hover:bg-red-500/10 disabled:opacity-60"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {error}
        </div>
      )}
    </Modal>
  );
}

/* ---------- Main Page ---------- */

export default function FinancePage() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id ?? null;
  const profileId = profile?.id ?? null;

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [categories, setCategories] = useState<FinanceCategoryRow[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransactionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [fromDate, setFromDate] = useState<Date | null>(firstOfMonth);
  const [toDate, setToDate] = useState<Date | null>(lastOfMonth);

  const [datePreset, setDatePreset] = useState<DatePreset>('this_month');
  const [monthPickerDate, setMonthPickerDate] = useState<Date | null>(now);

  const [kindFilter, setKindFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // 🔹 Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingTransaction, setEditingTransaction] =
    useState<FinanceTransactionRow | null>(null);


  const [debt, setDebt] = useState<GymDebt | null>(null);
  const [debtLoading, setDebtLoading] = useState(false);

  const loadDebt = async () => {
    if (!tenantId) return;
    setDebtLoading(true);

    const { data, error } = await supabase.rpc('get_gym_debt', {
      p_tenant_id: tenantId,
    });

    if (error) {
      console.error('Error loading debt', error);
      setDebt(null);
      setDebtLoading(false);
      return;
    }

    const row = Array.isArray(data) ? data[0] : (data as any);

    setDebt({
      membership_debt: Number(row?.membership_debt ?? 0),
      dropin_debt: Number(row?.dropin_debt ?? 0),
      total_debt: Number(row?.total_debt ?? 0),
    });

    setDebtLoading(false);
  };

  useEffect(() => {
    loadDebt();
  }, [tenantId]);


  const [showCategoriesModal, setShowCategoriesModal] = useState(false);

  const loadCategories = async () => {
    if (!tenantId) return;
    const { data, error } = await supabase
      .from('finance_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('position', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error loading finance_categories', error);
      return;
    }
    setCategories((data ?? []) as FinanceCategoryRow[]);
  };

  const loadTransactions = async () => {
    if (!tenantId) return;
    setLoading(true);

    let query = supabase
      .from('finance_transactions')
      .select('*')
      .eq('tenant_id', tenantId);

    if (fromDate) {
      query = query.gte('tx_date', dateToISODate(fromDate));
    }
    if (toDate) {
      query = query.lte('tx_date', dateToISODate(toDate));
    }
    if (kindFilter !== 'all') {
      query = query.eq('kind', kindFilter);
    }
    if (categoryFilter !== 'all') {
      query = query.eq('category_id', categoryFilter);
    }

    const { data, error } = await query.order('tx_date', { ascending: false });

    if (error) {
      console.error('Error loading finance_transactions', error);
      setLoading(false);
      return;
    }

    const casted = (data ?? []).map((row: any) => ({
      ...row,
      amount: Number(row.amount ?? 0),
    })) as FinanceTransactionRow[];

    setTransactions(casted);
    setLoading(false);
  };

  useEffect(() => {
    loadCategories();
  }, [tenantId]);

  useEffect(() => {
    loadTransactions();
  }, [tenantId, fromDate, toDate, kindFilter, categoryFilter]);

  // Reset page when filters or data change
  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, kindFilter, categoryFilter, transactions.length]);

  const totalIncome = useMemo(
    () =>
      transactions
        .filter((t) => t.kind === 'income')
        .reduce((sum, t) => sum + (t.amount ?? 0), 0),
    [transactions]
  );

  const totalExpenses = useMemo(
    () =>
      transactions
        .filter((t) => t.kind === 'expense')
        .reduce((sum, t) => sum + (t.amount ?? 0), 0),
    [transactions]
  );

  const net = useMemo(() => totalIncome - totalExpenses, [totalIncome, totalExpenses]);

  const openCreateModal = () => {
    setModalMode('create');
    setEditingTransaction(null);
    setModalOpen(true);
  };

  const openEditModal = (tx: FinanceTransactionRow) => {
    setModalMode('edit');
    setEditingTransaction(tx);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!tenantId) return;
    const confirmed = window.confirm('Σίγουρα θέλεις να διαγράψεις αυτή την κίνηση;');
    if (!confirmed) return;

    const { error } = await supabase
      .from('finance_transactions')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('Error deleting finance_transaction', error);
      return;
    }

    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  const handleKindFilterChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setKindFilter(e.target.value as 'all' | 'income' | 'expense');
  };

  const handleCategoryFilterChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setCategoryFilter(e.target.value);
  };

  const handleFromDateChange = (date: Date | null) => {
    setDatePreset('custom');
    setFromDate(date);
  };

  const handleToDateChange = (date: Date | null) => {
    setDatePreset('custom');
    setToDate(date);
  };

  const applyPreset = (preset: DatePreset) => {
    const now = new Date();

    if (preset === 'this_week') {
      const start = startOfWeekMonday(now);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      setFromDate(start);
      setToDate(end);
    } else if (preset === 'this_month') {
      const f = new Date(now.getFullYear(), now.getMonth(), 1);
      const l = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setFromDate(f);
      setToDate(l);
      setMonthPickerDate(now);
    } else if (preset === 'this_year') {
      const f = new Date(now.getFullYear(), 0, 1);
      const l = new Date(now.getFullYear(), 11, 31);
      setFromDate(f);
      setToDate(l);
    } else if (preset === 'month') {
      const base = monthPickerDate ?? now;
      const f = new Date(base.getFullYear(), base.getMonth(), 1);
      const l = new Date(base.getFullYear(), base.getMonth() + 1, 0);
      setFromDate(f);
      setToDate(l);
    }
    // 'custom' => do not change from/to
  };

  const handleDatePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset !== 'custom') {
      applyPreset(preset);
    }
  };

  const handleMonthPickerChange = (date: Date | null) => {
    setMonthPickerDate(date);
    if (!date) return;
    if (datePreset !== 'month') return;
    const f = new Date(date.getFullYear(), date.getMonth(), 1);
    const l = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    setFromDate(f);
    setToDate(l);
  };

  const getCategory = (categoryId: string | null): FinanceCategoryRow | null => {
    if (!categoryId) return null;
    const cat = categories.find((c) => c.id === categoryId);
    return cat ?? null;
  };

  const PresetButton = ({
    value,
    label,
  }: {
    value: DatePreset;
    label: string;
  }) => (
    <button
      type="button"
      onClick={() => handleDatePresetChange(value)}
      className={`rounded-full border px-3 py-1 text-[0.70rem] ${datePreset === value
        ? 'bg-primary text-white border-primary'
        : 'border-border/15 text-text-secondary hover:bg-secondary/30'
        }`}
    >
      {label}
    </button>
  );

  // 🔹 Pagination calculations
  const pageCount = Math.max(1, Math.ceil(transactions.length / pageSize));

  const paginatedTransactions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return transactions.slice(start, start + pageSize);
  }, [transactions, page, pageSize]);

  const startIdx =
    transactions.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(transactions.length, page * pageSize);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Οικονομικά</h1>
          <p className="mt-1 text-xs text-text-secondary">
            Παρακολούθηση εσόδων / εξόδων για το γυμναστήριό σου.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCategoriesModal(true)}
            className="rounded-md border border-border/10 bg-secondary-background px-4 py-2 text-xs font-medium text-text-primary hover:bg-secondary/30"
          >
            Κατηγορίες
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-md bg-accent px-4 py-2 text-xs font-semibold text-slate-900 shadow hover:bg-accent/80"
          >
            + Νέα Κίνηση
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-xl border border-border bg-secondary-background p-4 text-xs text-slate-100">
        {/* Date presets */}
        <div className="mb-3">
          <div className="mb-1 text-[0.70rem] font-semibold uppercase tracking-wide text-text-primary">
            Περίοδος
          </div>
          <div className="flex flex-wrap gap-2">
            <PresetButton value="custom" label="Προσαρμοσμένο" />
            <PresetButton value="this_week" label="Αυτή η εβδομάδα" />
            <PresetButton value="this_month" label="Αυτός ο μήνας" />
            <PresetButton value="month" label="Επιλογή μήνα" />
            <PresetButton value="this_year" label="Αυτό το έτος" />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <div className="mb-1 text-[0.70rem] font-semibold uppercase tracking-wide text-text-primary">
              Από
            </div>
            <DatePicker
              selected={fromDate}
              onChange={handleFromDateChange}
              dateFormat="dd/MM/yyyy"
              locale={el}
              placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
              className="w-full rounded-md border border-border/20 bg-bulk-bg/60 px-2 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
              wrapperClassName="w-full"
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
              scrollableYearDropdown
              yearDropdownItemNumber={80}
              disabled={datePreset !== 'custom'}
            />
          </div>

          <div>
            <div className="mb-1 text-[0.70rem] font-semibold uppercase tracking-wide text-slate-400">
              Έως
            </div>
            <DatePicker
              selected={toDate}
              onChange={handleToDateChange}
              dateFormat="dd/MM/yyyy"
              locale={el}
              placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
              className="w-full rounded-md border border-border/20 bg-bulk-bg/60 px-2 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
              wrapperClassName="w-full"
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
              scrollableYearDropdown
              yearDropdownItemNumber={80}
              disabled={datePreset !== 'custom'}
            />
          </div>

          {/* Month selection when preset = 'month' */}
          {datePreset === 'month' && (
            <div className="md:col-span-2">
              <div className="mb-1 text-[0.70rem] font-semibold uppercase tracking-wide text-slate-400">
                Επιλογή μήνα
              </div>
              <DatePicker
                selected={monthPickerDate}
                onChange={handleMonthPickerChange}
                dateFormat="MM/yyyy"
                locale={el}
                placeholderText="ΜΜ/ΕΕΕΕ"
                className="w-full rounded-md border border-border/20 bg-bulk-bg/60 px-2 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                wrapperClassName="w-full"
                showMonthYearPicker
              />
            </div>
          )}

          <div>
            <div className="mb-1 text-[0.70rem] font-semibold uppercase tracking-wide text-slate-400">
              Τύπος
            </div>
            <select
              className="w-full rounded-md border border-border/20 bg-bulk-bg/60 px-2 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
              value={kindFilter}
              onChange={handleKindFilterChange}
            >
              <option value="all">Όλα</option>
              <option value="income">Έσοδα</option>
              <option value="expense">Έξοδα</option>
            </select>
          </div>

          <div>
            <div className="mb-1 text-[0.70rem] font-semibold uppercase tracking-wide text-slate-400">
              Κατηγορία
            </div>
            <select
              className="w-full rounded-md border border-border/20 bg-bulk-bg/60 px-2 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
              value={categoryFilter}
              onChange={handleCategoryFilterChange}
            >
              <option value="all">Όλες</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} ({cat.kind === 'income' ? 'Έσοδο' : 'Έξοδο'})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-success/60 bg-secondary-background p-4 text-xs text-success/80">
          <div className="text-[0.70rem] uppercase tracking-wide text-success/80">
            Σύνολο Εσόδων
          </div>
          <div className="mt-2 text-lg font-semibold">
            {formatCurrency(totalIncome)}
          </div>
        </div>

        <div className="rounded-xl border border-danger/60 bg-secondary-background p-4 text-xs text-danger/80">
          <div className="text-[0.70rem] uppercase tracking-wide text-danger/80">
            Σύνολο Εξόδων
          </div>
          <div className="mt-2 text-lg font-semibold">
            {formatCurrency(totalExpenses)}
          </div>
        </div>

        <div className="rounded-xl border border-success/60 bg-secondary-background p-4 text-xs text-success/80">
          <div className="text-[0.70rem] uppercase tracking-wide text-success/80">
            Καθαρό Αποτέλεσμα
          </div>
          <div
            className={`mt-2 text-lg font-semibold ${net >= 0 ? 'text-success/80' : 'text-danger/80'
              }`}
          >
            {formatCurrency(net)}
          </div>
        </div>


        <div className="rounded-xl border border-warning/60 bg-secondary-background p-4 text-xs text-warning/80">
          <div className="text-[0.70rem] uppercase tracking-wide text-warning/80">
            Συνολικά Χρέη
          </div>

          <div className="mt-2 text-lg font-semibold">
            {debtLoading ? '...' : formatCurrency(debt?.total_debt ?? 0)}
          </div>

          <div className="mt-1 text-[0.70rem] text-slate-400">
            Συνδρομές: {formatCurrency(debt?.membership_debt ?? 0)} • Drop-in:{' '}
            {formatCurrency(debt?.dropin_debt ?? 0)}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border/10 bg-secondary-background">
        <div className="max-h-125 overflow-auto no-scrollbar">
          <table className="min-w-full text-left text-xs text-text-primary ">
            <thead className="bg-secondary-background text-[0.70rem] uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-4 py-2">Ημερομηνία</th>
                <th className="px-4 py-2">Τίτλος</th>
                <th className="px-4 py-2">Κατηγορία</th>
                <th className="px-4 py-2">Τύπος</th>
                <th className="px-4 py-2 text-right">Ποσό</th>
                <th className="px-4 py-2">Σημειώσεις</th>
                <th className="px-4 py-2 text-right">Ενέργειες</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-4 text-center text-xs text-text-secondary"
                  >
                    Φόρτωση δεδομένων...
                  </td>
                </tr>
              )}

              {!loading && paginatedTransactions.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-4 text-center text-xs text-text-secondary"
                  >
                    Δεν βρέθηκαν κινήσεις για τα επιλεγμένα φίλτρα.
                  </td>
                </tr>
              )}

              {!loading &&
                paginatedTransactions.map((tx) => {
                  const cat = getCategory(tx.category_id);

                  return (
                    <tr
                      key={tx.id}
                      className="border-t border-border/10 hover:bg-border/10"
                    >
                      <td className="px-4 py-2 align-middle text-[0.75rem] text-text-secondary">
                        {formatDateDMY(tx.tx_date)}
                      </td>
                      <td className="px-4 py-2 align-middle text-[0.75rem]">
                        {tx.title}
                      </td>
                      <td className="px-4 py-2 align-middle text-[0.75rem] text-text-secondary">
                        {cat ? (
                          <div className="flex items-center gap-2">
                            {cat.color && (
                              <span
                                className="inline-block h-3 w-3 rounded-full border border-border/20"
                                style={{ backgroundColor: cat.color }}
                              />
                            )}
                            <span>{cat.name}</span>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-2 align-middle text-[0.75rem]">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${tx.kind === 'income'
                            ? 'bg-emerald-500/10 text-success border border-emerald-500/40'
                            : 'bg-rose-500/10 text-danger/60 border border-rose-500/40'
                            }`}
                        >
                          {tx.kind === 'income' ? 'Έσοδο' : 'Έξοδο'}
                        </span>
                      </td>
                      <td className="px-4 py-2 align-middle text-right text-[0.75rem] font-semibold">
                        <span
                          className={
                            tx.kind === 'income' ? 'text-success' : 'text-danger'
                          }
                        >
                          {formatCurrency(tx.amount ?? 0)}
                        </span>
                      </td>
                      <td className="px-4 py-2 align-middle text-[0.75rem] text-text-secondary">
                        {tx.notes ?? '-'}
                      </td>
                      <td className="px-4 py-2 align-middle text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(tx)}
                            className="rounded-md border border-border bg-slate-800/80 p-1.5 text-slate-100 hover:bg-slate-700"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(tx.id)}
                            className="rounded-md border border-rose-600/80 bg-danger p-1.5 text-white hover:bg-rose-800/80"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* 🔹 Pagination footer */}
        {!loading && transactions.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2 text-xs text-text-secondary border-t border-border/10">
            <div>
              Εμφάνιση{' '}
              <span className="font-semibold">{startIdx}</span>
              {transactions.length > 0 && (
                <>
                  –<span className="font-semibold">{endIdx}</span>
                </>
              )}{' '}
              από <span className="font-semibold">{transactions.length}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span>Γραμμές ανά σελίδα:</span>
                <select
                  className="bg-transparent border border-border/10 rounded px-1 py-0.5"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-2 py-1 rounded border border-border/10 disabled:opacity-40"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Προηγ.
                </button>
                <span>
                  Σελίδα <span className="font-semibold">{page}</span> από{' '}
                  <span className="font-semibold">{pageCount}</span>
                </span>
                <button
                  className="px-2 py-1 rounded border border-border/10 disabled:opacity-40"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page === pageCount}
                >
                  Επόμενο
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <FinanceTransactionModal
        open={modalOpen}
        mode={modalMode}
        tenantId={tenantId}
        profileId={profileId}
        categories={categories}
        initialTransaction={editingTransaction}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          loadTransactions();
          loadDebt();
        }}
      />

      <FinanceCategoriesModal
        open={showCategoriesModal}
        tenantId={tenantId}
        categories={categories}
        onClose={() => setShowCategoriesModal(false)}
        onChanged={() => {
          loadCategories();
          loadTransactions(); // refresh names/colors in table
        }}
      />
    </div>
  );
}

/* ---------- Shared Modal + FormRow (same style as MembersPage) ---------- */

function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-md border border-border/10 bg-secondary-background text-text-primary shadow-xl">
        <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 hover:bg-white/5"
          >
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function FormRow({ label, children }: any) {
  return (
    <label className="block mb-3">
      <div className="mb-1 text-sm opacity-80">{label}</div>
      {children}
    </label>
  );
}
