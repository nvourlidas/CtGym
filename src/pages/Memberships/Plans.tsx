import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import { Plus, Search, AlertTriangle, CreditCard } from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';
import type { Category, Plan, Toast } from './plans/types';
import ToastHost from './plans/components/ToastHost';
import PlansTable from './plans/components/PlansTable';
import CreatePlanModal from './plans/modals/CreatePlanModal';
import EditPlanModal from './plans/modals/EditPlanModal';

export default function Plans() {
  const { profile, subscription } = useAuth();
  const [showSubModal, setShowSubModal] = useState(false);
  const [rows, setRows] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const subscriptionInactive = !subscription?.is_active;
  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) { setShowSubModal(true); return; }
    action();
  }

  const pushToast = (t: Omit<Toast, 'id'>, ms = 4500) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, ...t }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), ms);
  };
  const dismissToast = (id: string) => setToasts((prev) => prev.filter((x) => x.id !== id));

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true); setError(null);
    const { data, error } = await supabase.from('membership_plans')
      .select('id,tenant_id,name,description,price,plan_kind,duration_days,session_credits,created_at,membership_plan_categories(category_id,class_categories(id,name,color))')
      .eq('tenant_id', profile.tenant_id).order('created_at', { ascending: false });
    if (error) { setError(error.message); setRows([]); setLoading(false); return; }
    setRows(((data as any[]) ?? []).map((row) => ({
      id: row.id, tenant_id: row.tenant_id, name: row.name, description: row.description,
      price: row.price, plan_kind: row.plan_kind, duration_days: row.duration_days,
      session_credits: row.session_credits, created_at: row.created_at,
      categories: (row.membership_plan_categories ?? []).map((l: any) => l.class_categories).filter(Boolean).map((c: any) => ({ id: c.id, name: c.name, color: c.color })),
    })));
    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id]);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    supabase.from('class_categories').select('id,name,color').eq('tenant_id', profile.tenant_id).order('name')
      .then(({ data }) => setCategories((data || []) as Category[]));
  }, [profile?.tenant_id]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => (r.name ?? '').toLowerCase().includes(needle) || (r.description ?? '').toLowerCase().includes(needle) || r.categories.some((c) => (c.name ?? '').toLowerCase().includes(needle)));
  }, [rows, q]);

  useEffect(() => { setPage(1); }, [q, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);
  const startIdx = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(filtered.length, page * pageSize);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <ToastHost toasts={toasts} dismiss={dismissToast} />

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <CreditCard className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-black text-text-primary tracking-tight">Πλάνα Συνδρομής</h1>
            <p className="text-xs text-text-secondary mt-px">{loading ? '…' : `${rows.length} πλάνα`}</p>
          </div>
        </div>
        <button onClick={() => requireActiveSubscription(() => setShowCreate(true))}
          className="group relative inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px transition-all cursor-pointer overflow-hidden shrink-0"
        >
          <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          <Plus className="h-3.5 w-3.5 relative z-10" />
          <span className="relative z-10">Νέο Πλάνο</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
        <input className="w-full h-9 pl-9 pr-3 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all" placeholder="Αναζήτηση Πλάνων…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      <PlansTable
        loading={loading} paginated={paginated} filtered={filtered}
        page={page} setPage={setPage} pageCount={pageCount} pageSize={pageSize} setPageSize={setPageSize}
        startIdx={startIdx} endIdx={endIdx}
        tenantId={profile?.tenant_id ?? ''}
        subscriptionInactive={subscriptionInactive}
        onShowSubModal={() => setShowSubModal(true)}
        onEdit={(p) => requireActiveSubscription(() => setEditRow(p))}
        onDeleted={load}
      />

      {showCreate && <CreatePlanModal tenantId={profile?.tenant_id!} categories={categories} toast={pushToast} onClose={() => { setShowCreate(false); load(); }} />}
      {editRow && <EditPlanModal row={editRow} categories={categories} toast={pushToast} onClose={() => { setEditRow(null); load(); }} />}
      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </div>
  );
}
