import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import { useNavigate } from 'react-router-dom';
import { Users, Plus } from 'lucide-react';
import '../../styles/quill-dark.css';

import SendMemberEmailModal from '../../components/Members/SendMemberEmailModal';
import SendMemberPushModal from '../../components/Members/SendMemberPushModal';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';

import type { Member, TenantRow, ColumnKey, Toast } from './types';
import { ALL_COLUMNS, DEFAULT_VISIBLE } from './types';
import { exportExcel, exportPdf } from './memberUtils';

import ToastHost from './components/ToastHost';
import MembersToolbar from './components/MembersToolbar';
import MembersTable from './components/MembersTable';
import CreateMemberModal from './modals/CreateMemberModal';
import EditMemberModal from './modals/EditMemberModal';
import ExistingMemberModal from './modals/ExistingMemberModal';

// ── Column localStorage keys
const COLS_GLOBAL_KEY = 'members_table_visible_cols_v1';

function sanitizeCols(input: unknown): ColumnKey[] {
  if (!Array.isArray(input)) return DEFAULT_VISIBLE;
  const valid = input.filter((k): k is ColumnKey => ALL_COLUMNS.some((c) => c.key === k));
  return valid.length ? valid : DEFAULT_VISIBLE;
}

export default function MembersPage() {
  const { profile, subscription } = useAuth();
  const navigate = useNavigate();
  const tenantId = profile?.tenant_id;

  // ── Data state
  const [tenant, setTenant]                   = useState<TenantRow | null>(null);
  const [rows, setRows]                       = useState<Member[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [membershipDebts, setMembershipDebts] = useState<Record<string, number>>({});
  const [dropinDebts, setDropinDebts]         = useState<Record<string, number>>({});

  // ── UI state
  const [q, setQ]                             = useState('');
  const [page, setPage]                       = useState(1);
  const [pageSize, setPageSize]               = useState(10);
  const [selectedIds, setSelectedIds]         = useState<string[]>([]);
  const [toasts, setToasts]                   = useState<Toast[]>([]);

  // ── Column visibility
  const COLS_TENANT_KEY = tenantId ? `members_table_visible_cols_v1_${tenantId}` : null;
  const [visibleCols, setVisibleCols] = useState<ColumnKey[]>(() => {
    try {
      const raw = localStorage.getItem(COLS_GLOBAL_KEY);
      if (!raw) return DEFAULT_VISIBLE;
      return sanitizeCols(JSON.parse(raw));
    } catch { return DEFAULT_VISIBLE; }
  });

  // ── Modal state
  const [showCreate, setShowCreate]                     = useState(false);
  const [editRow, setEditRow]                           = useState<Member | null>(null);
  const [showExistingMemberInfo, setShowExistingMemberInfo] = useState(false);
  const [showEmailModal, setShowEmailModal]             = useState(false);
  const [showPushModal, setShowPushModal]               = useState(false);
  const [showSubModal, setShowSubModal]                 = useState(false);

  // ── Subscription gating
  const subscriptionInactive = !subscription?.is_active;
  const tier = String((subscription as any)?.plan_id ?? (subscription as any)?.tier ?? (subscription as any)?.plan_name ?? (subscription as any)?.name ?? '').toLowerCase();
  const isPro    = tier.includes('pro');
  const isFriend = tier.includes('friend_app');
  const isFree   = !(isPro || tier.includes('starter'));
  const canSendComms = !isFree || isFriend;
  const canExport    = isPro || isFriend;

  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) { setShowSubModal(true); return; }
    action();
  }

  // ── Toast helpers
  const pushToast = (t: Omit<Toast, 'id'>, ms = 4500) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, ...t }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), ms);
  };
  const dismissToast = (id: string) => setToasts((prev) => prev.filter((x) => x.id !== id));

  // ── Gate helpers
  function gateExport(actionName: 'Excel' | 'PDF', action: () => void) {
    if (!canExport) {
      pushToast({ variant: 'info', title: `🔒 Export ${actionName} διαθέσιμο μόνο στο Pro`, message: 'Αναβάθμισε για εξαγωγή αρχείων (Excel/PDF).', actionLabel: 'Αναβάθμιση', onAction: () => navigate('/settings/billing') });
      return;
    }
    action();
  }
  function gateComms(actionName: 'Email' | 'Push', action: () => void) {
    if (!canSendComms) {
      pushToast({ variant: 'info', title: `🔒 ${actionName} διαθέσιμο από Starter`, message: 'Αναβάθμισε για αποστολή μηνυμάτων σε μέλη.', actionLabel: 'Αναβάθμιση', onAction: () => navigate('/settings/billing') });
      return;
    }
    action();
  }

  // ── Data loading
  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('members')
      .select('id,user_id,full_name,phone,tenant_id,role,created_at,birth_date,address,afm,max_dropin_debt,email,notes')
      .eq('tenant_id', profile.tenant_id)
      .eq('role', 'member')
      .order('created_at', { ascending: false });

    if (error) {
      setRows([]); setMembershipDebts({}); setDropinDebts({}); setSelectedIds([]);
      setLoading(false);
      return;
    }

    const members = (data as Member[]) ?? [];
    setRows(members);
    setSelectedIds([]);

    const memberIds = members.map((m) => m.id);
    if (!memberIds.length) {
      setMembershipDebts({}); setDropinDebts({});
      setLoading(false);
      return;
    }

    const { data: membershipsData, error: membErr } = await supabase
      .from('memberships').select('user_id,debt')
      .eq('tenant_id', profile.tenant_id).in('user_id', memberIds);

    const membershipMap: Record<string, number> = {};
    if (!membErr && membershipsData) {
      (membershipsData as any[]).forEach((m) => {
        const uid = m.user_id as string;
        const v = Number(m.debt ?? 0);
        if (Number.isFinite(v)) membershipMap[uid] = (membershipMap[uid] ?? 0) + v;
      });
    }

    const { data: bookingsData, error: bookErr } = await supabase
      .from('bookings').select('user_id,drop_in_price,booking_type,drop_in_paid')
      .eq('tenant_id', profile.tenant_id).eq('booking_type', 'drop_in').eq('drop_in_paid', false).in('user_id', memberIds);

    const dropinMap: Record<string, number> = {};
    if (!bookErr && bookingsData) {
      (bookingsData as any[]).forEach((b) => {
        const uid = b.user_id as string;
        const v = Number(b.drop_in_price ?? 0);
        if (Number.isFinite(v)) dropinMap[uid] = (dropinMap[uid] ?? 0) + v;
      });
    }

    setMembershipDebts(membershipMap);
    setDropinDebts(dropinMap);
    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id]);

  useEffect(() => {
    (async () => {
      if (!profile?.tenant_id) { setTenant(null); return; }
      const { data, error } = await supabase.from('tenants').select('name').eq('id', profile.tenant_id).maybeSingle();
      if (!error) setTenant(data as TenantRow | null);
    })();
  }, [profile?.tenant_id]);

  // ── Column persistence
  useEffect(() => {
    if (!COLS_TENANT_KEY) return;
    try {
      const raw = localStorage.getItem(COLS_TENANT_KEY);
      if (raw) setVisibleCols(sanitizeCols(JSON.parse(raw)));
    } catch { }
  }, [COLS_TENANT_KEY]);

  useEffect(() => {
    try {
      localStorage.setItem(COLS_GLOBAL_KEY, JSON.stringify(visibleCols));
      if (COLS_TENANT_KEY) localStorage.setItem(COLS_TENANT_KEY, JSON.stringify(visibleCols));
    } catch { }
  }, [visibleCols, COLS_TENANT_KEY]);

  // ── Filtering & pagination
  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) =>
      (r.full_name ?? '').toLowerCase().includes(needle) ||
      (r.phone ?? '').toLowerCase().includes(needle) ||
      r.id.toLowerCase().includes(needle));
  }, [rows, q]);

  useEffect(() => { setPage(1); }, [q, pageSize]);

  const pageCount   = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated   = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);
  const startIdx    = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx      = Math.min(filtered.length, page * pageSize);
  const pageIds     = paginated.map((m) => m.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  // ── Selection helpers
  const selectedMembers = useMemo(() => rows.filter((m) => selectedIds.includes(m.id)), [rows, selectedIds]);
  const toggleSelect    = (id: string) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const clearSelection  = () => setSelectedIds([]);
  const toggleSelectPage = () => setSelectedIds((prev) =>
    allPageSelected ? prev.filter((id) => !pageIds.includes(id)) : [...prev, ...pageIds.filter((id) => !prev.includes(id))]);

  // ── Column helpers
  const toggleCol  = (key: ColumnKey) => setVisibleCols((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  const setAllCols = () => setVisibleCols(ALL_COLUMNS.map((c) => c.key));
  const resetCols  = () => setVisibleCols(DEFAULT_VISIBLE);

  // ── Export
  const exportRows = useMemo(() =>
    selectedIds.length > 0 ? rows.filter((m) => selectedIds.includes(m.id)) : filtered,
    [rows, filtered, selectedIds]);

  const tenantNameFromProfile = tenant?.name ?? 'Cloudtec Gym';

  return (
    <div className="p-5 md:p-6 space-y-5">
      <ToastHost toasts={toasts} dismiss={dismissToast} />

      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <Users className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-black text-text-primary tracking-tight leading-none">Μέλη</h1>
            <p className="text-xs text-text-secondary mt-0.5">
              {loading ? '…' : `${rows.length} μέλη συνολικά`}
            </p>
          </div>
        </div>
        <button
          className="group relative inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-md shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-px active:translate-y-0 transition-all duration-150 cursor-pointer overflow-hidden"
          onClick={() => requireActiveSubscription(() => setShowCreate(true))}
        >
          <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          <Plus className="h-4 w-4 relative z-10" />
          <span className="relative z-10">Νέο Μέλος</span>
        </button>
      </div>

      {/* Toolbar */}
      <MembersToolbar
        q={q} setQ={setQ}
        rows={rows} loading={loading}
        selectedIds={selectedIds} clearSelection={clearSelection}
        canSendComms={canSendComms} canExport={canExport}
        onEmailClick={() => gateComms('Email', () => setShowEmailModal(true))}
        onPushClick={()  => gateComms('Push',  () => setShowPushModal(true))}
        onExcelClick={() => gateExport('Excel', () => exportExcel(exportRows, visibleCols, membershipDebts, dropinDebts))}
        onPdfClick={()   => gateExport('PDF',   () => exportPdf(exportRows, visibleCols, membershipDebts, dropinDebts))}
        visibleCols={visibleCols} toggleCol={toggleCol}
        setAllCols={setAllCols} resetCols={resetCols}
      />

      {/* Table */}
      <MembersTable
        loading={loading}
        filtered={filtered}
        paginated={paginated}
        visibleCols={visibleCols}
        membershipDebts={membershipDebts}
        dropinDebts={dropinDebts}
        selectedIds={selectedIds}
        toggleSelect={toggleSelect}
        allPageSelected={allPageSelected}
        toggleSelectPage={toggleSelectPage}
        page={page} pageCount={pageCount}
        pageSize={pageSize} startIdx={startIdx} endIdx={endIdx}
        setPage={setPage} setPageSize={setPageSize}
        onEdit={(m) => requireActiveSubscription(() => setEditRow(m))}
        onDeleteGuard={() => { if (subscriptionInactive) { setShowSubModal(true); return false; } return true; }}
        onDeleted={load}
        tenantId={tenantId ?? undefined}
        subscriptionInactive={subscriptionInactive}
      />

      {/* Modals */}
      {showCreate && tenantId && (
        <CreateMemberModal
          tenantId={tenantId}
          toast={pushToast}
          onClose={(result) => {
            setShowCreate(false);
            void load();
            if (result?.existingUser) setShowExistingMemberInfo(true);
          }}
        />
      )}
      {editRow && (
        <EditMemberModal row={editRow} onClose={() => { setEditRow(null); load(); }} />
      )}
      {showExistingMemberInfo && (
        <ExistingMemberModal onClose={() => setShowExistingMemberInfo(false)} />
      )}
      {showEmailModal && (
        <SendMemberEmailModal
          isOpen={showEmailModal} onClose={() => setShowEmailModal(false)}
          tenantName={tenantNameFromProfile} tenantId={tenantId ?? null}
          memberIds={selectedIds}
          selectedMembers={selectedMembers.map((m) => ({ id: m.id, full_name: m.full_name, email: m.email, user_id: m.user_id }))}
        />
      )}
      {showPushModal && (
        <SendMemberPushModal
          isOpen={showPushModal} onClose={() => setShowPushModal(false)}
          tenantName={tenantNameFromProfile} tenantId={tenantId ?? null}
          selectedMembers={selectedMembers.map((m) => ({ id: m.id, full_name: m.full_name, email: m.email, user_id: m.user_id }))}
        />
      )}
      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
      `}</style>
    </div>
  );
}
