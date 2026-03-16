import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import { Plus, Search, AlertTriangle, Users, ChevronDown } from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';
import type { Member, MembershipRow } from './memberships/types';
import MembershipsTable from './memberships/components/MembershipsTable';
import CreateMembershipModal from './memberships/modals/CreateMembershipModal';
import EditMembershipModal from './memberships/modals/EditMembershipModal';

export default function MembershipsPage() {
  const { profile, subscription } = useAuth();
  const [showSubModal, setShowSubModal] = useState(false);
  const [rows, setRows] = useState<MembershipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<MembershipRow | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDebt, setFilterDebt] = useState<'all' | 'with' | 'without'>('all');

  const subscriptionInactive = !subscription?.is_active;
  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) { setShowSubModal(true); return; }
    action();
  }

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true); setError(null);
    const { data, error } = await supabase.from('memberships')
      .select('id,tenant_id,user_id,plan_id,starts_at,ends_at,status,created_at,remaining_sessions,plan_kind,plan_name,plan_price,custom_price,discount_reason,days_remaining,debt,membership_plans(membership_plan_categories(class_categories(id,name,color)))')
      .eq('tenant_id', profile.tenant_id).order('created_at', { ascending: false });
    if (error) { setError(error.message); setRows([]); setLoading(false); return; }

    const { data: members } = await supabase.from('members').select('id,full_name').eq('tenant_id', profile.tenant_id).order('full_name');
    const memberMap = new Map<string, Member>();
    (members as any[] | null)?.forEach((m) => memberMap.set(m.id, { id: m.id, full_name: m.full_name }));

    setRows((data as any[]).map((r) => {
      const plan = r.membership_plans;
      const cats = plan && Array.isArray(plan.membership_plan_categories)
        ? (plan.membership_plan_categories as any[]).map((l: any) => l.class_categories).filter(Boolean).map((c: any) => ({ id: c.id, name: c.name, color: c.color ?? null }))
        : [];
      return { ...r, profile: memberMap.get(r.user_id) ?? null, plan_categories: cats } as MembershipRow;
    }));
    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id]);

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => (r.plan_categories ?? []).forEach((cat) => { if (cat.id) map.set(cat.id, cat.name); }));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const planOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => { if (r.plan_id && r.plan_name) map.set(r.plan_id, r.plan_name); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    let list = [...rows];
    if (q) { const n = q.toLowerCase(); list = list.filter((r) => (r.profile?.full_name ?? '').toLowerCase().includes(n) || (r.plan_name ?? '').toLowerCase().includes(n) || (r.plan_categories ?? []).some((c) => (c.name ?? '').toLowerCase().includes(n)) || (r.status ?? '').toLowerCase().includes(n)); }
    if (filterCategory) list = list.filter((r) => (r.plan_categories ?? []).some((c) => c.id === filterCategory));
    if (filterPlan) list = list.filter((r) => r.plan_id === filterPlan);
    if (filterStatus) list = list.filter((r) => (r.status ?? 'active') === filterStatus);
    if (filterDebt === 'with') list = list.filter((r) => (r.debt ?? 0) > 0);
    else if (filterDebt === 'without') list = list.filter((r) => !r.debt || r.debt === 0);
    return list;
  }, [rows, q, filterCategory, filterPlan, filterStatus, filterDebt]);

  useEffect(() => { setPage(1); }, [q, pageSize, filterCategory, filterPlan, filterStatus, filterDebt]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);
  const startIdx = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(filtered.length, page * pageSize);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <Users className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-black text-text-primary tracking-tight">Συνδρομές</h1>
            <p className="text-xs text-text-secondary mt-px">{loading ? '…' : `${rows.length} συνδρομές`}</p>
          </div>
        </div>
        <button onClick={() => requireActiveSubscription(() => setShowCreate(true))}
          className="group relative inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px transition-all cursor-pointer overflow-hidden shrink-0"
        >
          <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          <Plus className="h-3.5 w-3.5 relative z-10" />
          <span className="relative z-10">Νέα Συνδρομή</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-44">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
          <input className="w-full h-9 pl-9 pr-3 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all" placeholder="Αναζήτηση συνδρομών…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {[
          { value: filterCategory, onChange: setFilterCategory, opts: categoryOptions, all: 'Όλες οι κατηγορίες' },
          { value: filterPlan, onChange: setFilterPlan, opts: planOptions, all: 'Όλα τα πλάνα' },
        ].map(({ value, onChange, opts, all }, i) => (
          <div key={i} className="relative">
            <select value={value} onChange={(e) => onChange(e.target.value)}
              className="h-9 pl-3.5 pr-9 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary appearance-none outline-none focus:border-primary/40 transition-all cursor-pointer"
            >
              <option value="">{all}</option>
              {opts.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
          </div>
        ))}

        <div className="relative">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 pl-3.5 pr-9 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary appearance-none outline-none focus:border-primary/40 transition-all cursor-pointer"
          >
            <option value="">Όλες οι καταστάσεις</option>
            <option value="active">Ενεργή</option>
            <option value="paused">Σε παύση</option>
            <option value="cancelled">Ακυρωμένη</option>
            <option value="expired">Έληξε</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
        </div>

        {/* Debt segmented */}
        <div className="flex items-center gap-1 p-1 rounded-xl border border-border/15 bg-secondary-background">
          {([['all', 'Όλες'], ['with', 'Με οφειλή'], ['without', 'Εξοφλημένες']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilterDebt(v)}
              className={['h-7 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer', filterDebt === v ? 'bg-primary text-white shadow-sm shadow-primary/30' : 'text-text-secondary hover:text-text-primary hover:bg-secondary/30'].join(' ')}
            >{l}</button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      <MembershipsTable
        loading={loading} paginated={paginated} filtered={filtered}
        page={page} setPage={setPage} pageCount={pageCount} pageSize={pageSize} setPageSize={setPageSize}
        startIdx={startIdx} endIdx={endIdx}
        tenantId={profile?.tenant_id ?? ''}
        subscriptionInactive={subscriptionInactive}
        onShowSubModal={() => setShowSubModal(true)}
        onEdit={(m) => requireActiveSubscription(() => setEditRow(m))}
        onDeleted={load}
      />

      {showCreate && <CreateMembershipModal tenantId={profile?.tenant_id!} onClose={() => { setShowCreate(false); load(); }} />}
      {editRow && <EditMembershipModal row={editRow} onClose={() => { setEditRow(null); load(); }} />}
      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </div>
  );
}
