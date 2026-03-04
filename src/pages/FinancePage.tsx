// src/pages/FinancePage.tsx
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import {
  Pencil, Trash2, Plus, Loader2, ChevronLeft, ChevronRight, ChevronDown,
  TrendingUp, TrendingDown,  AlertTriangle, X, Euro, 
  Tag, Wallet, Receipt,
} from 'lucide-react';
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import PlanGate from '../components/billing/PlanGate';

type FinanceCategoryRow = {
  id: string; tenant_id: string; name: string;
  kind: 'income' | 'expense'; color: string | null; position: number | null;
};
type FinanceTransactionRow = {
  id: string; tenant_id: string; category_id: string | null;
  kind: 'income' | 'expense'; title: string; tx_date: string;
  amount: number; notes: string | null; created_by: string | null; created_at: string;
};
type ModalMode = 'create' | 'edit';
type FinanceFormValues = {
  title: string; kind: 'income' | 'expense'; txDate: Date | null;
  categoryId: string | 'none'; amount: string; notes: string;
};
type GymDebt = { membership_debt: number; dropin_debt: number; total_debt: number };
type DatePreset = 'custom' | 'this_week' | 'this_month' | 'month' | 'this_year';

// ── Helpers ───────────────────────────────────────────────────────────────
function formatCurrency(v: number) { return new Intl.NumberFormat('el-GR',{style:'currency',currency:'EUR',minimumFractionDigits:2}).format(v); }
function dateToISODate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function parseISODateToLocal(s?: string | null): Date | null {
  if (!s) return null;
  const [y,m,d] = s.slice(0,10).split('-');
  const r = new Date(Number(y),Number(m)-1,Number(d));
  return isNaN(r.getTime()) ? null : r;
}
function formatDateDMY(s: string) {
  const d = parseISODateToLocal(s); if (!d) return '—';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function startOfWeekMonday(d: Date) {
  const x = new Date(d); const day=x.getDay(); x.setDate(x.getDate()+(day===0?-6:1-day)); x.setHours(0,0,0,0); return x;
}

// ── Shared UI primitives ──────────────────────────────────────────────────

function ModalShell({ title, icon, onClose, children, footer }: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-2xl overflow-hidden" style={{ animation:'finModalIn 0.2s ease' }}>
        <div className="h-0.75 bg-linear-to-r from-primary/0 via-primary to-primary/0" />
        <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">{icon ?? <Wallet className="h-4 w-4 text-primary" />}</div>
            <h2 className="font-black text-text-primary tracking-tight">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl border border-border/10 hover:bg-secondary/30 text-text-secondary hover:text-text-primary transition-all cursor-pointer"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 max-h-[78vh] overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-border/10 flex justify-end gap-2">{footer}</div>}
      </div>
      <style>{`@keyframes finModalIn { from{opacity:0;transform:translateY(16px) scale(0.98)} to{opacity:1;transform:none} }`}</style>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">{label}</label>
      {children}
    </div>
  );
}

function StyledInput({ value, onChange, name, type='text', placeholder, className='' }: any) {
  return <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder}
    className={`w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary ${className}`} />;
}
function StyledTextarea({ value, onChange, name, rows=3, placeholder }: any) {
  return <textarea name={name} value={value} onChange={onChange} rows={rows} placeholder={placeholder}
    className="w-full px-3.5 py-2.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all resize-none placeholder:text-text-secondary" />;
}
function StyledSelect({ value, onChange, name, children, disabled }: any) {
  return (
    <div className="relative">
      <select name={name} value={value} onChange={onChange} disabled={disabled}
        className="w-full h-9 pl-3.5 pr-9 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary appearance-none outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer disabled:opacity-50"
      >{children}</select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
    </div>
  );
}

function PrimaryBtn({ busy, busyLabel, label, onClick, disabled, type='button' }: any) {
  return (
    <button type={type} onClick={onClick} disabled={busy||disabled}
      className="group relative inline-flex items-center gap-2 h-9 px-5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px disabled:opacity-50 disabled:translate-y-0 transition-all cursor-pointer overflow-hidden"
    >
      <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
      {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /><span className="relative z-10">{busyLabel}</span></> : <span className="relative z-10">{label}</span>}
    </button>
  );
}
function SecondaryBtn({ label, onClick, disabled }: any) {
  return <button type="button" onClick={onClick} disabled={disabled} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer disabled:opacity-50">{label}</button>;
}

// ── Transaction Modal ─────────────────────────────────────────────────────

type FinanceTransactionModalProps = {
  open: boolean; mode: ModalMode; tenantId: string | null; profileId: string | null;
  categories: FinanceCategoryRow[]; initialTransaction: FinanceTransactionRow | null;
  onClose: () => void; onSaved: () => void;
};

function FinanceTransactionModal({ open, mode, tenantId, profileId, categories, initialTransaction, onClose, onSaved }: FinanceTransactionModalProps) {
  const [values, setValues] = useState<FinanceFormValues>({ title:'', kind:'income', txDate:new Date(), categoryId:'none', amount:'', notes:'' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode==='edit' && initialTransaction) {
      setValues({ title:initialTransaction.title, kind:initialTransaction.kind, txDate:parseISODateToLocal(initialTransaction.tx_date)??new Date(), categoryId:initialTransaction.category_id??'none', amount:String(initialTransaction.amount??''), notes:initialTransaction.notes??'' });
    } else {
      setValues({ title:'', kind:'income', txDate:new Date(), categoryId:'none', amount:'', notes:'' });
    }
    setError(null);
  }, [open, mode, initialTransaction]);

  const handleChange = (e: ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!tenantId) { setError('Λείπει το tenant_id.'); return; }
    if (!values.title.trim()) { setError('Συμπλήρωσε τίτλο.'); return; }
    if (!values.txDate) { setError('Συμπλήρωσε ημερομηνία.'); return; }
    const amount = Number(values.amount.replace(',','.'));
    if (isNaN(amount) || amount < 0) { setError('Το ποσό πρέπει να είναι έγκυρος αριθμός (>= 0).'); return; }
    setSaving(true); setError(null);
    const payload: any = { tenant_id:tenantId, title:values.title.trim(), kind:values.kind, tx_date:dateToISODate(values.txDate), amount, notes:values.notes.trim()||null, category_id:values.categoryId==='none'?null:values.categoryId, created_by:profileId };
    try {
      if (mode==='create') { const { error: e } = await supabase.from('finance_transactions').insert(payload); if (e) { setError(e.message); setSaving(false); return; } }
      else if (mode==='edit' && initialTransaction) { const { error: e } = await supabase.from('finance_transactions').update(payload).eq('id',initialTransaction.id).eq('tenant_id',tenantId); if (e) { setError(e.message); setSaving(false); return; } }
      setSaving(false); onSaved(); onClose();
    } catch (err: any) { setError('Κάτι πήγε στραβά.'); setSaving(false); }
  };

  if (!open) return null;

 

  return (
    <ModalShell title={mode==='create'?'Νέα Κίνηση':'Επεξεργασία Κίνησης'} icon={<Receipt className="h-4 w-4 text-primary" />} onClose={onClose}
      footer={<><SecondaryBtn label="Ακύρωση" onClick={onClose} disabled={saving} /><PrimaryBtn busy={saving} busyLabel="Αποθήκευση…" label="Αποθήκευση" onClick={handleSubmit} /></>}
    >
      <FormField label="Τίτλος">
        <StyledInput name="title" value={values.title} onChange={handleChange} placeholder="π.χ. Συνδρομή Πελάτη" />
      </FormField>

      {/* Kind card selector */}
      <FormField label="Τύπος">
        <div className="grid grid-cols-2 gap-2">
          {(['income','expense'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setValues((p) => ({ ...p, kind:k }))}
              className={['px-4 py-3 rounded-xl border text-sm font-bold transition-all cursor-pointer', values.kind===k ? (k==='income'?'border-success/40 bg-success/10 text-success':'border-danger/40 bg-danger/10 text-danger') : 'border-border/15 text-text-secondary hover:border-primary/25 hover:text-text-primary'].join(' ')}
            >
              {k==='income' ? <><TrendingUp className="h-4 w-4 mx-auto mb-1" />Έσοδο</> : <><TrendingDown className="h-4 w-4 mx-auto mb-1" />Έξοδο</>}
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
          <DatePicker selected={values.txDate} onChange={(d) => setValues((p) => ({ ...p, txDate:d }))} dateFormat="dd/MM/yyyy" locale={el} placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
            className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all"
            wrapperClassName="w-full" showMonthDropdown showYearDropdown dropdownMode="select" scrollableYearDropdown yearDropdownItemNumber={80}
          />
        </FormField>
      </div>

      <FormField label="Κατηγορία">
        <StyledSelect name="categoryId" value={values.categoryId} onChange={handleChange}>
          <option value="none">Χωρίς κατηγορία</option>
          {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name} ({cat.kind==='income'?'Έσοδο':'Έξοδο'})</option>)}
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

// ── Categories Modal ──────────────────────────────────────────────────────

type FinanceCategoriesModalProps = {
  open: boolean; tenantId: string | null; categories: FinanceCategoryRow[];
  onClose: () => void; onChanged: () => void;
};

function FinanceCategoriesModal({ open, tenantId, categories, onClose, onChanged }: FinanceCategoriesModalProps) {
  const [newName, setNewName]   = useState('');
  const [newKind, setNewKind]   = useState<'income'|'expense'>('income');
  const [newColor, setNewColor] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [editName, setEditName]   = useState('');
  const [editKind, setEditKind]   = useState<'income'|'expense'>('income');
  const [editColor, setEditColor] = useState('');
  const [busyId, setBusyId]       = useState<string|null>(null);
  const [error, setError]         = useState<string|null>(null);

  useEffect(() => {
    if (!open) { setNewName(''); setNewColor(''); setNewKind('income'); setEditingId(null); setError(null); }
  }, [open]);

  const handleAdd = async () => {
    if (!tenantId||!newName.trim()) { setError('Συμπλήρωσε όνομα.'); return; }
    setSavingNew(true); setError(null);
    const { error: e } = await supabase.from('finance_categories').insert({ tenant_id:tenantId, name:newName.trim(), kind:newKind, color:newColor.trim()||null, position:(categories?.length??0)+1 });
    setSavingNew(false);
    if (e) { setError(e.message); return; }
    setNewName(''); setNewColor(''); setNewKind('income'); onChanged();
  };

  const startEdit = (cat: FinanceCategoryRow) => { setEditingId(cat.id); setEditName(cat.name); setEditKind(cat.kind); setEditColor(cat.color??''); setError(null); };
  const cancelEdit = () => { setEditingId(null); setEditName(''); setEditKind('income'); setEditColor(''); };

  const handleSaveEdit = async () => {
    if (!tenantId||!editingId||!editName.trim()) { setError('Συμπλήρωσε όνομα.'); return; }
    setBusyId(editingId); setError(null);
    const { error: e } = await supabase.from('finance_categories').update({ name:editName.trim(), kind:editKind, color:editColor.trim()||null }).eq('id',editingId).eq('tenant_id',tenantId);
    setBusyId(null);
    if (e) { setError(e.message); return; }
    cancelEdit(); onChanged();
  };

  const handleDelete = async (cat: FinanceCategoryRow) => {
    if (!tenantId||!confirm(`Διαγραφή κατηγορίας "${cat.name}";`)) return;
    setBusyId(cat.id); setError(null);
    const { error: e } = await supabase.from('finance_categories').delete().eq('id',cat.id).eq('tenant_id',tenantId);
    setBusyId(null);
    if (e) { setError(e.message); return; }
    if (editingId===cat.id) cancelEdit();
    onChanged();
  };

  if (!open) return null;

  return (
    <ModalShell title="Κατηγορίες Οικονομικών" icon={<Tag className="h-4 w-4 text-primary" />} onClose={onClose}>
      <p className="text-xs text-text-secondary">Οργάνωσε τις κατηγορίες για τα έσοδα και τα έξοδά σου.</p>

      {/* Add new */}
      <div className="rounded-xl border border-border/15 bg-secondary/5 p-4 space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Νέα Κατηγορία</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FormField label="Όνομα">
            <StyledInput value={newName} onChange={(e: any) => setNewName(e.target.value)} placeholder="π.χ. Συνδρομές" />
          </FormField>
          <FormField label="Τύπος">
            <StyledSelect value={newKind} onChange={(e: any) => setNewKind(e.target.value)}>
              <option value="income">Έσοδο</option>
              <option value="expense">Έξοδο</option>
            </StyledSelect>
          </FormField>
          <FormField label="Χρώμα">
            <div className="flex items-center gap-2">
              <input type="color" value={newColor||'#22c55e'} onChange={(e) => setNewColor(e.target.value)} className="h-9 w-10 rounded-xl border border-border/15 bg-transparent cursor-pointer" />
              <StyledInput value={newColor} onChange={(e: any) => setNewColor(e.target.value)} placeholder="#22c55e" />
            </div>
          </FormField>
        </div>
        <div className="flex justify-end">
          <PrimaryBtn busy={savingNew} busyLabel="Προσθήκη…" label="Προσθήκη Κατηγορίας" onClick={handleAdd} />
        </div>
      </div>

      {/* Existing */}
      <div className="rounded-xl border border-border/10 overflow-hidden">
        <div className="max-h-72 overflow-y-auto">
          {categories.length === 0 && <div className="px-4 py-6 text-center text-xs text-text-secondary">Δεν υπάρχουν κατηγορίες ακόμα.</div>}
          {categories.map((cat) => {
            const isEditing = editingId === cat.id;
            return (
              <div key={cat.id} className="border-b border-border/5 last:border-0 px-4 py-3 hover:bg-secondary/5 transition-colors">
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <StyledInput value={editName} onChange={(e: any) => setEditName(e.target.value)} placeholder="Όνομα" />
                      <StyledSelect value={editKind} onChange={(e: any) => setEditKind(e.target.value)}>
                        <option value="income">Έσοδο</option>
                        <option value="expense">Έξοδο</option>
                      </StyledSelect>
                      <div className="flex items-center gap-2">
                        <input type="color" value={editColor||'#22c55e'} onChange={(e) => setEditColor(e.target.value)} className="h-9 w-10 rounded-xl border border-border/15 bg-transparent cursor-pointer shrink-0" />
                        <StyledInput value={editColor} onChange={(e: any) => setEditColor(e.target.value)} placeholder="#22c55e" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <SecondaryBtn label="Άκυρο" onClick={cancelEdit} disabled={busyId===cat.id} />
                      <PrimaryBtn busy={busyId===cat.id} busyLabel="Αποθήκευση…" label="Αποθήκευση" onClick={handleSaveEdit} />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {cat.color && <span className="h-3 w-3 rounded-full shrink-0 border border-border/20" style={{ backgroundColor:cat.color }} />}
                      <span className="text-sm font-medium text-text-primary truncate">{cat.name}</span>
                      <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-lg border ${cat.kind==='income'?'border-success/35 bg-success/10 text-success':'border-danger/35 bg-danger/10 text-danger'}`}>{cat.kind==='income'?'Έσοδο':'Έξοδο'}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => startEdit(cat)} className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"><Pencil className="h-3 w-3" /></button>
                      <button type="button" disabled={busyId===cat.id} onClick={() => handleDelete(cat)} className="h-7 w-7 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all cursor-pointer disabled:opacity-40">{busyId===cat.id?<Loader2 className="h-3 w-3 animate-spin" />:<Trash2 className="h-3 w-3" />}</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-danger/25 bg-danger/8 text-danger text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}
        </div>
      )}
    </ModalShell>
  );
}

// ── Summary stat card ─────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, borderCls, textCls, sublabel }: { label: string; value: string; icon: any; borderCls: string; textCls: string; sublabel?: string }) {
  return (
    <div className={`rounded-2xl border ${borderCls} bg-secondary-background p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">{label}</div>
          <div className={`mt-2 text-xl font-black ${textCls}`}>{value}</div>
          {sublabel && <div className="mt-1 text-[10.5px] text-text-secondary truncate">{sublabel}</div>}
        </div>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${borderCls.replace('border-','bg-').replace('/60','/12')}`}>
          <Icon className={`h-4 w-4 ${textCls}`} />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function FinancePage() {
  const { profile, subscription } = useAuth();
  const tenantId  = profile?.tenant_id ?? null;
  const profileId = profile?.id ?? null;
  const navigate  = useNavigate();

  const tier = String((subscription as any)?.plan_id??'').toLowerCase() || String((subscription as any)?.plan_name??(subscription as any)?.name??'').toLowerCase();
  const isFree = !['pro','starter','friend_app'].some((k) => tier.includes(k));

  const now = new Date();
  const [categories, setCategories]       = useState<FinanceCategoryRow[]>([]);
  const [transactions, setTransactions]   = useState<FinanceTransactionRow[]>([]);
  const [loading, setLoading]             = useState(false);
  const [fromDate, setFromDate]           = useState<Date|null>(new Date(now.getFullYear(),now.getMonth(),1));
  const [toDate, setToDate]               = useState<Date|null>(new Date(now.getFullYear(),now.getMonth()+1,0));
  const [datePreset, setDatePreset]       = useState<DatePreset>('this_month');
  const [monthPickerDate, setMonthPickerDate] = useState<Date|null>(now);
  const [kindFilter, setKindFilter]       = useState<'all'|'income'|'expense'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [page, setPage]                   = useState(1);
  const [pageSize, setPageSize]           = useState(25);
  const [modalOpen, setModalOpen]         = useState(false);
  const [modalMode, setModalMode]         = useState<ModalMode>('create');
  const [editingTransaction, setEditingTransaction] = useState<FinanceTransactionRow|null>(null);
  const [debt, setDebt]                   = useState<GymDebt|null>(null);
  const [debtLoading, setDebtLoading]     = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);

  const loadDebt = async () => {
    if (!tenantId) return;
    setDebtLoading(true);
    const { data, error } = await supabase.rpc('get_gym_debt', { p_tenant_id:tenantId });
    if (!error) { const row=Array.isArray(data)?data[0]:(data as any); setDebt({ membership_debt:Number(row?.membership_debt??0), dropin_debt:Number(row?.dropin_debt??0), total_debt:Number(row?.total_debt??0) }); }
    setDebtLoading(false);
  };

  const loadCategories = async () => {
    if (!tenantId) return;
    const { data } = await supabase.from('finance_categories').select('*').eq('tenant_id',tenantId).order('position',{ascending:true}).order('name',{ascending:true});
    setCategories((data??[]) as FinanceCategoryRow[]);
  };

  const loadTransactions = async () => {
    if (!tenantId) return;
    setLoading(true);
    let q = supabase.from('finance_transactions').select('*').eq('tenant_id',tenantId);
    if (fromDate) q = q.gte('tx_date',dateToISODate(fromDate));
    if (toDate)   q = q.lte('tx_date',dateToISODate(toDate));
    if (kindFilter!=='all') q = q.eq('kind',kindFilter);
    if (categoryFilter!=='all') q = q.eq('category_id',categoryFilter);
    const { data } = await q.order('tx_date',{ascending:false});
    setTransactions(((data??[]) as any[]).map((r) => ({ ...r, amount:Number(r.amount??0) })) as FinanceTransactionRow[]);
    setLoading(false);
  };

  useEffect(() => { loadDebt(); }, [tenantId]);
  useEffect(() => { loadCategories(); }, [tenantId]);
  useEffect(() => { loadTransactions(); }, [tenantId, fromDate, toDate, kindFilter, categoryFilter]);
  useEffect(() => { setPage(1); }, [fromDate, toDate, kindFilter, categoryFilter, transactions.length]);

  const totalIncome   = useMemo(() => transactions.filter((t) => t.kind==='income').reduce((s,t) => s+(t.amount??0), 0), [transactions]);
  const totalExpenses = useMemo(() => transactions.filter((t) => t.kind==='expense').reduce((s,t) => s+(t.amount??0), 0), [transactions]);
  const net           = totalIncome - totalExpenses;

  const pageCount = Math.max(1, Math.ceil(transactions.length/pageSize));
  const paginated = useMemo(() => transactions.slice((page-1)*pageSize, page*pageSize), [transactions, page, pageSize]);
  const startIdx  = transactions.length===0?0:(page-1)*pageSize+1;
  const endIdx    = Math.min(transactions.length, page*pageSize);

  const applyPreset = (preset: DatePreset) => {
    const n = new Date();
    if (preset==='this_week') { const s=startOfWeekMonday(n); const e=new Date(s); e.setDate(s.getDate()+6); setFromDate(s); setToDate(e); }
    else if (preset==='this_month') { setFromDate(new Date(n.getFullYear(),n.getMonth(),1)); setToDate(new Date(n.getFullYear(),n.getMonth()+1,0)); setMonthPickerDate(n); }
    else if (preset==='this_year') { setFromDate(new Date(n.getFullYear(),0,1)); setToDate(new Date(n.getFullYear(),11,31)); }
    else if (preset==='month') { const b=monthPickerDate??n; setFromDate(new Date(b.getFullYear(),b.getMonth(),1)); setToDate(new Date(b.getFullYear(),b.getMonth()+1,0)); }
  };
  const handlePreset = (p: DatePreset) => { setDatePreset(p); if (p!=='custom') applyPreset(p); };

  const getCategory = (id: string|null) => id ? (categories.find((c) => c.id===id)??null) : null;

  const PRESETS: { value: DatePreset; label: string }[] = [
    { value:'custom', label:'Προσαρμοσμένο' },
    { value:'this_week', label:'Αυτή η εβδομάδα' },
    { value:'this_month', label:'Αυτός ο μήνας' },
    { value:'month', label:'Επιλογή μήνα' },
    { value:'this_year', label:'Αυτό το έτος' },
  ];

  return (
    <div className="relative">
      <div className={isFree ? 'pointer-events-none select-none blur-sm opacity-60' : ''}>
        <div className="p-4 md:p-6 space-y-5">

          {/* ── Header ── */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                <Wallet className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-black text-text-primary tracking-tight">Οικονομικά</h1>
                <p className="text-xs text-text-secondary mt-px">Παρακολούθηση εσόδων / εξόδων για το γυμναστήριό σου.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setShowCategoriesModal(true)} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" />Κατηγορίες
              </button>
              <button onClick={() => { setModalMode('create'); setEditingTransaction(null); setModalOpen(true); }}
                className="group relative inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px transition-all cursor-pointer overflow-hidden"
              >
                <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                <Plus className="h-3.5 w-3.5 relative z-10" /><span className="relative z-10">Νέα Κίνηση</span>
              </button>
            </div>
          </div>

          {/* ── Filters ── */}
          <div className="rounded-2xl border border-border/10 bg-secondary-background p-4 space-y-4 shadow-sm">
            {/* Preset pills */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Περίοδος</div>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(({ value, label }) => (
                  <button key={value} type="button" onClick={() => handlePreset(value)}
                    className={['h-7 px-3.5 rounded-full border text-xs font-semibold transition-all cursor-pointer', datePreset===value ? 'bg-primary text-white border-primary shadow-sm shadow-primary/30' : 'border-border/15 text-text-secondary hover:text-text-primary hover:bg-secondary/30'].join(' ')}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* Date + filters grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Από</div>
                <DatePicker selected={fromDate} onChange={(d) => { setDatePreset('custom'); setFromDate(d); }} dateFormat="dd/MM/yyyy" locale={el} placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ" disabled={datePreset!=='custom'}
                  className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all disabled:opacity-40"
                  wrapperClassName="w-full" showMonthDropdown showYearDropdown dropdownMode="select" scrollableYearDropdown yearDropdownItemNumber={80}
                />
              </div>
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Έως</div>
                <DatePicker selected={toDate} onChange={(d) => { setDatePreset('custom'); setToDate(d); }} dateFormat="dd/MM/yyyy" locale={el} placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ" disabled={datePreset!=='custom'}
                  className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all disabled:opacity-40"
                  wrapperClassName="w-full" showMonthDropdown showYearDropdown dropdownMode="select" scrollableYearDropdown yearDropdownItemNumber={80}
                />
              </div>
              {datePreset==='month' && (
                <div className="space-y-1.5 md:col-span-2">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Επιλογή μήνα</div>
                  <DatePicker selected={monthPickerDate} onChange={(d) => { setMonthPickerDate(d); if (!d) return; setFromDate(new Date(d.getFullYear(),d.getMonth(),1)); setToDate(new Date(d.getFullYear(),d.getMonth()+1,0)); }}
                    dateFormat="MM/yyyy" locale={el} placeholderText="ΜΜ/ΕΕΕΕ" showMonthYearPicker
                    className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all"
                    wrapperClassName="w-full"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Τύπος</div>
                <StyledSelect value={kindFilter} onChange={(e: any) => setKindFilter(e.target.value)}>
                  <option value="all">Όλα</option><option value="income">Έσοδα</option><option value="expense">Έξοδα</option>
                </StyledSelect>
              </div>
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Κατηγορία</div>
                <StyledSelect value={categoryFilter} onChange={(e: any) => setCategoryFilter(e.target.value)}>
                  <option value="all">Όλες</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name} ({cat.kind==='income'?'Έσοδο':'Έξοδο'})</option>)}
                </StyledSelect>
              </div>
            </div>
          </div>

          {/* ── Summary cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Σύνολο Εσόδων"     value={formatCurrency(totalIncome)}            icon={TrendingUp}    borderCls="border-success/40" textCls="text-success" />
            <StatCard label="Σύνολο Εξόδων"     value={formatCurrency(totalExpenses)}           icon={TrendingDown}  borderCls="border-danger/40"  textCls="text-danger" />
            <StatCard label="Καθαρό Αποτέλεσμα" value={formatCurrency(net)}                     icon={net>=0?TrendingUp:TrendingDown} borderCls={net>=0?'border-success/40':'border-danger/40'} textCls={net>=0?'text-success':'text-danger'} />
            <StatCard label="Συνολικές Οφειλές"
              value={debtLoading?'…':formatCurrency(debt?.total_debt??0)}
              icon={Wallet}
              borderCls="border-warning/40" textCls="text-warning"
              sublabel={debt?`Συνδρομές: ${formatCurrency(debt.membership_debt)} · Drop-in: ${formatCurrency(debt.dropin_debt)}`:''}
            />
          </div>

          {/* ── Transactions table ── */}
          <div className="rounded-2xl border border-border/10 bg-secondary-background overflow-hidden shadow-sm">
            {loading && <div className="flex items-center justify-center gap-2 py-10 text-text-secondary text-sm"><Loader2 className="h-4 w-4 animate-spin" />Φόρτωση δεδομένων…</div>}

            {!loading && (
              <>
                <div className="overflow-x-auto max-h-128 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-border/10 bg-secondary-background/95 backdrop-blur-sm">
                        {['Ημερομηνία','Τίτλος','Κατηγορία','Τύπος','Ποσό','Σημειώσεις',''].map((h,i) => (
                          <th key={i} className={['px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary', i===4||i===6?'text-right':'text-left'].join(' ')}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-text-secondary">Δεν βρέθηκαν κινήσεις για τα επιλεγμένα φίλτρα.</td></tr>
                      )}
                      {paginated.map((tx) => {
                        const cat = getCategory(tx.category_id);
                        const isIncome = tx.kind === 'income';
                        return (
                          <tr key={tx.id} className="border-t border-border/5 hover:bg-secondary/5 transition-colors">
                            <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">{formatDateDMY(tx.tx_date)}</td>
                            <td className="px-4 py-3 font-semibold text-text-primary max-w-36 truncate">{tx.title}</td>
                            <td className="px-4 py-3">
                              {cat ? (
                                <div className="flex items-center gap-1.5">
                                  {cat.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor:cat.color }} />}
                                  <span className="text-xs text-text-secondary truncate">{cat.name}</span>
                                </div>
                              ) : <span className="text-xs text-text-secondary opacity-40">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-lg border ${isIncome?'border-success/35 bg-success/10 text-success':'border-danger/35 bg-danger/10 text-danger'}`}>{isIncome?'Έσοδο':'Έξοδο'}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`font-black text-sm ${isIncome?'text-success':'text-danger'}`}>{isIncome?'+':'-'}{formatCurrency(tx.amount??0)}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-text-secondary max-w-40 truncate">{tx.notes??'—'}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button type="button" onClick={() => { setModalMode('edit'); setEditingTransaction(tx); setModalOpen(true); }} className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"><Pencil className="h-3 w-3" /></button>
                                <button type="button" onClick={async () => { if (!tenantId||!confirm('Σίγουρα θέλεις να διαγράψεις αυτή την κίνηση;')) return; const { error } = await supabase.from('finance_transactions').delete().eq('id',tx.id).eq('tenant_id',tenantId); if (!error) setTransactions((prev) => prev.filter((t) => t.id!==tx.id)); }} className="h-7 w-7 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all cursor-pointer"><Trash2 className="h-3 w-3" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {transactions.length > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border/10 text-xs text-text-secondary">
                    <span><span className="font-bold text-text-primary">{startIdx}–{endIdx}</span> από <span className="font-bold text-text-primary">{transactions.length}</span></span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="hidden sm:inline">Ανά σελίδα:</span>
                        <div className="relative">
                          <select className="h-7 pl-2 pr-7 rounded-lg border border-border/15 bg-secondary-background text-xs appearance-none outline-none cursor-pointer" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                            {[10,25,50].map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none" />
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setPage((p) => Math.max(1,p-1))} disabled={page===1} className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 cursor-pointer transition-all"><ChevronLeft className="h-3.5 w-3.5" /></button>
                        <span className="px-2"><span className="font-bold text-text-primary">{page}</span> / {pageCount}</span>
                        <button onClick={() => setPage((p) => Math.min(pageCount,p+1))} disabled={page===pageCount} className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 cursor-pointer transition-all"><ChevronRight className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Plan gate overlay */}
      {isFree && (
        <div className="absolute inset-0 z-60 flex items-start justify-center p-6">
          <div className="w-full max-w-xl">
            <PlanGate blocked asOverlay allow={['starter','pro']} title="Τα Οικονομικά είναι διαθέσιμα από Starter" description="Αναβάθμισε για να δημιουργείς και να παρακολουθείς οικονομικά." onUpgradeClick={() => navigate('/settings/billing')} />
          </div>
        </div>
      )}

      <FinanceTransactionModal open={modalOpen} mode={modalMode} tenantId={tenantId} profileId={profileId} categories={categories} initialTransaction={editingTransaction} onClose={() => setModalOpen(false)} onSaved={() => { loadTransactions(); loadDebt(); }} />
      <FinanceCategoriesModal open={showCategoriesModal} tenantId={tenantId} categories={categories} onClose={() => setShowCategoriesModal(false)} onChanged={() => { loadCategories(); loadTransactions(); }} />
    </div>
  );
}