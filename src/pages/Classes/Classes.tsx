import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import { Dumbbell, Plus, Search } from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';

import type { GymClass, Category, Coach, Toast } from './types';

import ToastHost from './components/ToastHost';
import ClassesTable from './components/ClassesTable';
import CreateClassModal from './modals/CreateClassModal';
import EditClassModal from './modals/EditClassModal';

export default function ClassesPage() {
  const { profile, subscription } = useAuth();
  const [showSubModal, setShowSubModal] = useState(false);
  const [rows, setRows]                 = useState<GymClass[]>([]);
  const [loading, setLoading]           = useState(true);
  const [q, setQ]                       = useState('');
  const [showCreate, setShowCreate]     = useState(false);
  const [editRow, setEditRow]           = useState<GymClass | null>(null);
  const [categories, setCategories]     = useState<Category[]>([]);
  const [coaches, setCoaches]           = useState<Coach[]>([]);
  const [totalCount, setTotalCount]     = useState(0);
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(10);
  const subscriptionInactive = !subscription?.is_active;

  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (t: Omit<Toast, 'id'>, ms = 4500) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, ...t }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), ms);
  };
  const dismissToast = (id: string) => setToasts((prev) => prev.filter((x) => x.id !== id));

  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) { setShowSubModal(true); return; }
    action();
  }

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);
    const from = (page - 1) * pageSize;
    let query = supabase
      .from('classes_list')
      .select('id,tenant_id,title,description,created_at,category_id,drop_in_enabled,drop_in_price,member_drop_in_price,coach_id,category_name,category_color,coach_full_name', { count: 'exact' })
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false });

    const needle = q.trim();
    if (needle) query = query.or(`title.ilike.%${needle}%,description.ilike.%${needle}%,id.ilike.%${needle}%,category_name.ilike.%${needle}%,coach_full_name.ilike.%${needle}%`);

    const { data, error, count } = await query.range(from, from + pageSize - 1);

    if (!error) {
      setRows(((data as any[]) ?? []).map((r) => ({
        id: r.id, tenant_id: r.tenant_id, title: r.title,
        description: r.description ?? null, created_at: r.created_at,
        category_id: r.category_id ?? null,
        drop_in_enabled: !!r.drop_in_enabled,
        drop_in_price: r.drop_in_price ?? null,
        member_drop_in_price: r.member_drop_in_price ?? null,
        coach_id: r.coach_id ?? null,
        class_categories: r.category_name ? { id: r.category_id ?? '', name: r.category_name, color: r.category_color ?? null } : null,
        coach: r.coach_full_name ? { id: r.coach_id ?? '', full_name: r.coach_full_name } : null,
      })));
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id, page, pageSize, q]);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    supabase.from('class_categories').select('id,name,color').eq('tenant_id', profile.tenant_id).order('name')
      .then(({ data }) => setCategories(data ?? []));
  }, [profile?.tenant_id]);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    supabase.from('coaches').select('id,full_name').eq('tenant_id', profile.tenant_id).eq('is_active', true).order('full_name')
      .then(({ data }) => setCoaches(data ?? []));
  }, [profile?.tenant_id]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIdx  = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx    = Math.min(totalCount, page * pageSize);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <ToastHost toasts={toasts} dismiss={dismissToast} />

      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <Dumbbell className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-black text-text-primary tracking-tight">Τμήματα</h1>
            <p className="text-xs text-text-secondary mt-px">
              {loading ? '…' : `${totalCount} τμήματα`}
            </p>
          </div>
        </div>
        <button
          onClick={() => requireActiveSubscription(() => setShowCreate(true))}
          className="group relative inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px active:translate-y-0 transition-all duration-150 cursor-pointer overflow-hidden shrink-0"
        >
          <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          <Plus className="h-3.5 w-3.5 relative z-10" />
          <span className="relative z-10 hidden sm:inline">Νέο Τμήμα</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
        <input
          className="w-full h-9 pl-9 pr-3 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
          placeholder="Αναζήτηση τμημάτων…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
      </div>

      {/* Table */}
      <ClassesTable
        loading={loading}
        rows={rows}
        totalCount={totalCount}
        page={page} pageCount={pageCount}
        pageSize={pageSize} startIdx={startIdx} endIdx={endIdx}
        setPage={setPage} setPageSize={setPageSize}
        onEdit={(c) => requireActiveSubscription(() => setEditRow(c))}
        onDeleteGuard={() => { if (subscriptionInactive) { setShowSubModal(true); return false; } return true; }}
        onDeleted={load}
      />

      {/* Modals */}
      {showCreate && (
        <CreateClassModal
          tenantId={profile?.tenant_id!}
          categories={categories} coaches={coaches}
          toast={pushToast}
          onClose={() => { setShowCreate(false); load(); }}
        />
      )}
      {editRow && (
        <EditClassModal
          row={editRow}
          categories={categories} coaches={coaches}
          onClose={() => { setEditRow(null); load(); }}
        />
      )}

      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </div>
  );
}
