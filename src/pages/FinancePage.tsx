import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { TrendingUp, TrendingDown, Plus, Tag, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PlanGate from '../components/billing/PlanGate';
import type { FinanceCategoryRow, FinanceTransactionRow, GymDebt, ModalMode } from './Finance/types';
import { dateToISODate, formatCurrency } from './Finance/financeUtils';
import StatCard from './Finance/components/StatCard';
import FiltersPanel from './Finance/components/FiltersPanel';
import TransactionsTable from './Finance/components/TransactionsTable';
import TransactionModal from './Finance/modals/TransactionModal';
import CategoriesModal from './Finance/modals/CategoriesModal';

export default function FinancePage() {
  const { profile, subscription } = useAuth();
  const tenantId  = profile?.tenant_id ?? null;
  const profileId = profile?.id ?? null;
  const navigate  = useNavigate();

  const tier = String((subscription as any)?.plan_id ?? '').toLowerCase() || String((subscription as any)?.plan_name ?? (subscription as any)?.name ?? '').toLowerCase();
  const isFree = !['pro', 'starter', 'friend_app'].some((k) => tier.includes(k));

  const now = new Date();
  const [categories, setCategories]         = useState<FinanceCategoryRow[]>([]);
  const [transactions, setTransactions]     = useState<FinanceTransactionRow[]>([]);
  const [loading, setLoading]               = useState(false);
  const [fromDate, setFromDate]             = useState<Date | null>(new Date(now.getFullYear(), now.getMonth(), 1));
  const [toDate, setToDate]                 = useState<Date | null>(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const [kindFilter, setKindFilter]         = useState<'all' | 'income' | 'expense'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [page, setPage]                     = useState(1);
  const [pageSize, setPageSize]             = useState(25);
  const [modalOpen, setModalOpen]           = useState(false);
  const [modalMode, setModalMode]           = useState<ModalMode>('create');
  const [editingTx, setEditingTx]           = useState<FinanceTransactionRow | null>(null);
  const [debt, setDebt]                     = useState<GymDebt | null>(null);
  const [debtLoading, setDebtLoading]       = useState(false);
  const [showCatModal, setShowCatModal]     = useState(false);

  const loadDebt = async () => {
    if (!tenantId) return;
    setDebtLoading(true);
    const { data, error } = await supabase.rpc('get_gym_debt', { p_tenant_id: tenantId });
    if (!error) { const row = Array.isArray(data) ? data[0] : (data as any); setDebt({ membership_debt: Number(row?.membership_debt ?? 0), dropin_debt: Number(row?.dropin_debt ?? 0), total_debt: Number(row?.total_debt ?? 0) }); }
    setDebtLoading(false);
  };

  const loadCategories = async () => {
    if (!tenantId) return;
    const { data } = await supabase.from('finance_categories').select('*').eq('tenant_id', tenantId).order('position', { ascending: true }).order('name', { ascending: true });
    setCategories((data ?? []) as FinanceCategoryRow[]);
  };

  const loadTransactions = async () => {
    if (!tenantId) return;
    setLoading(true);
    let q = supabase.from('finance_transactions').select('*').eq('tenant_id', tenantId);
    if (fromDate) q = q.gte('tx_date', dateToISODate(fromDate));
    if (toDate)   q = q.lte('tx_date', dateToISODate(toDate));
    if (kindFilter !== 'all') q = q.eq('kind', kindFilter);
    if (categoryFilter !== 'all') q = q.eq('category_id', categoryFilter);
    const { data } = await q.order('tx_date', { ascending: false });
    setTransactions(((data ?? []) as any[]).map((r) => ({ ...r, amount: Number(r.amount ?? 0) })) as FinanceTransactionRow[]);
    setLoading(false);
  };

  useEffect(() => { loadDebt(); }, [tenantId]);
  useEffect(() => { loadCategories(); }, [tenantId]);
  useEffect(() => { loadTransactions(); }, [tenantId, fromDate, toDate, kindFilter, categoryFilter]);
  useEffect(() => { setPage(1); }, [fromDate, toDate, kindFilter, categoryFilter, transactions.length]);

  const totalIncome   = useMemo(() => transactions.filter((t) => t.kind === 'income').reduce((s, t) => s + (t.amount ?? 0), 0), [transactions]);
  const totalExpenses = useMemo(() => transactions.filter((t) => t.kind === 'expense').reduce((s, t) => s + (t.amount ?? 0), 0), [transactions]);
  const net           = totalIncome - totalExpenses;

  const pageCount = Math.max(1, Math.ceil(transactions.length / pageSize));
  const paginated = useMemo(() => transactions.slice((page - 1) * pageSize, page * pageSize), [transactions, page, pageSize]);
  const startIdx  = transactions.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx    = Math.min(transactions.length, page * pageSize);

  return (
    <div className="relative">
      <div className={isFree ? 'pointer-events-none select-none blur-sm opacity-60' : ''}>
        <div className="p-4 md:p-6 space-y-5">

          {/* Header */}
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
              <button onClick={() => setShowCatModal(true)}
                className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Tag className="h-3.5 w-3.5" />Κατηγορίες
              </button>
              <button onClick={() => { setModalMode('create'); setEditingTx(null); setModalOpen(true); }}
                className="group relative inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px transition-all cursor-pointer overflow-hidden"
              >
                <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                <Plus className="h-3.5 w-3.5 relative z-10" /><span className="relative z-10">Νέα Κίνηση</span>
              </button>
            </div>
          </div>

          {/* Filters */}
          <FiltersPanel
            fromDate={fromDate} setFromDate={setFromDate}
            toDate={toDate} setToDate={setToDate}
            kindFilter={kindFilter} setKindFilter={setKindFilter}
            categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
            categories={categories}
          />

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Σύνολο Εσόδων"     value={formatCurrency(totalIncome)}   icon={TrendingUp}   borderCls="border-success/40" textCls="text-success" />
            <StatCard label="Σύνολο Εξόδων"     value={formatCurrency(totalExpenses)} icon={TrendingDown} borderCls="border-danger/40"  textCls="text-danger" />
            <StatCard label="Καθαρό Αποτέλεσμα" value={formatCurrency(net)} icon={net >= 0 ? TrendingUp : TrendingDown} borderCls={net >= 0 ? 'border-success/40' : 'border-danger/40'} textCls={net >= 0 ? 'text-success' : 'text-danger'} />
            <StatCard label="Συνολικές Οφειλές"
              value={debtLoading ? '…' : formatCurrency(debt?.total_debt ?? 0)}
              icon={Wallet} borderCls="border-warning/40" textCls="text-warning"
              sublabel={debt ? `Συνδρομές: ${formatCurrency(debt.membership_debt)} · Drop-in: ${formatCurrency(debt.dropin_debt)}` : ''}
            />
          </div>

          {/* Transactions table */}
          <TransactionsTable
            loading={loading} paginated={paginated} total={transactions.length}
            page={page} setPage={setPage} pageCount={pageCount}
            pageSize={pageSize} setPageSize={setPageSize}
            startIdx={startIdx} endIdx={endIdx}
            categories={categories} tenantId={tenantId}
            onEdit={(tx) => { setModalMode('edit'); setEditingTx(tx); setModalOpen(true); }}
            onDeleted={(id) => setTransactions((prev) => prev.filter((t) => t.id !== id))}
          />
        </div>
      </div>

      {isFree && (
        <div className="absolute inset-0 z-60 flex items-start justify-center p-6">
          <div className="w-full max-w-xl">
            <PlanGate blocked asOverlay allow={['starter', 'pro']} title="Τα Οικονομικά είναι διαθέσιμα από Starter" description="Αναβάθμισε για να δημιουργείς και να παρακολουθείς οικονομικά." onUpgradeClick={() => navigate('/settings/billing')} />
          </div>
        </div>
      )}

      <TransactionModal
        open={modalOpen} mode={modalMode} tenantId={tenantId} profileId={profileId}
        categories={categories} initialTransaction={editingTx}
        onClose={() => setModalOpen(false)}
        onSaved={() => { loadTransactions(); loadDebt(); }}
      />
      <CategoriesModal
        open={showCatModal} tenantId={tenantId} categories={categories}
        onClose={() => setShowCatModal(false)}
        onChanged={() => { loadCategories(); loadTransactions(); }}
      />
    </div>
  );
}
