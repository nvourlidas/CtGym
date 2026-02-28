import { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import SendMemberEmailModal from '../../components/Members/SendMemberEmailModal';
import type { LucideIcon } from 'lucide-react';
import {
  Eye, Pencil, Trash2, Loader2, Sheet, FileText, Inbox, BellDot,
  Search, Plus, SlidersHorizontal, Users, Check, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import '../../styles/quill-dark.css';
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale';
import SendMemberPushModal from '../../components/Members/SendMemberPushModal';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';
import { useNavigate } from 'react-router-dom';

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import notoSansUrl from '../../assets/fonts/NotoSans-Regular.ttf?url';
import notoSansBoldUrl from '../../assets/fonts/NotoSans-Bold.ttf?url';

type Member = {
  id: string;
  full_name: string | null;
  phone: string | null;
  tenant_id: string | null;
  role: 'member';
  created_at: string;
  email: string | null;
  birth_date?: string | null;
  address?: string | null;
  afm?: string | null;
  max_dropin_debt?: number | null;
  notes?: string | null;
};

type TenantRow = { name: string };

type ColumnKey =
  | 'email' | 'birth_date' | 'address' | 'afm'
  | 'total_debt' | 'max_dropin_debt' | 'created_at' | 'notes';

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'email',          label: 'Email'               },
  { key: 'birth_date',     label: 'Ημ. Γέννησης'        },
  { key: 'address',        label: 'Διεύθυνση'           },
  { key: 'afm',            label: 'ΑΦΜ'                 },
  { key: 'total_debt',     label: 'Συνολική Οφειλή'     },
  { key: 'max_dropin_debt',label: 'Max Drop-in Οφειλή'  },
  { key: 'notes',          label: 'Σημειώσεις'          },
  { key: 'created_at',     label: 'Ημ. Δημιουργίας'     },
];

const DEFAULT_VISIBLE: ColumnKey[] = ['total_debt', 'max_dropin_debt', 'created_at'];

function formatDateDMY(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function dateToISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseISODateToLocal(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.slice(0,10).split('-');
  const year = Number(y), month = Number(m), day = Number(d);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

type Toast = {
  id: string; title: string; message?: string;
  variant?: 'error' | 'success' | 'info';
  actionLabel?: string; onAction?: () => void;
};

function ToastHost({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  return (
    <div className="fixed right-4 top-4 z-100 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="rounded-xl border border-border/15 bg-secondary-background/95 backdrop-blur-xl shadow-2xl shadow-black/20 overflow-hidden"
             style={{ animation: 'toastIn 0.2s ease' }}>
          <div className={['h-0.75 w-full',
            t.variant === 'error'   ? 'bg-danger'  :
            t.variant === 'success' ? 'bg-success'  : 'bg-primary',
          ].join(' ')} />
          <div className="px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={['text-sm font-bold',
                t.variant === 'error'   ? 'text-danger'  :
                t.variant === 'success' ? 'text-success'  : 'text-text-primary',
              ].join(' ')}>{t.title}</div>
              {t.message && <div className="mt-0.5 text-xs text-text-secondary leading-relaxed">{t.message}</div>}
              {t.actionLabel && t.onAction && (
                <button type="button" onClick={() => t.onAction?.()}
                  className="mt-2.5 h-7 rounded-lg px-3 text-xs font-bold bg-primary hover:bg-primary/90 text-white transition-all">
                  {t.actionLabel}
                </button>
              )}
            </div>
            <button type="button" onClick={() => dismiss(t.id)}
              className="shrink-0 p-1 rounded-lg hover:bg-border/10 text-text-secondary hover:text-text-primary transition-all">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MembersPage() {
  const { profile, subscription } = useAuth();
  const [showSubModal, setShowSubModal]   = useState(false);
  const [tenant, setTenant]               = useState<TenantRow | null>(null);
  const [rows, setRows]                   = useState<Member[]>([]);
  const [loading, setLoading]             = useState(true);
  const [q, setQ]                         = useState('');
  const [showCreate, setShowCreate]       = useState(false);
  const [editRow, setEditRow]             = useState<Member | null>(null);
  const colsBtnRef                        = useRef<HTMLButtonElement | null>(null);
  const colsPanelRef                      = useRef<HTMLDivElement | null>(null);
  const [dropdownPos, setDropdownPos]     = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const navigate                          = useNavigate();
  const tenantId                          = profile?.tenant_id;

  const COLS_GLOBAL_KEY = 'members_table_visible_cols_v1';
  const COLS_TENANT_KEY = tenantId ? `members_table_visible_cols_v1_${tenantId}` : null;

  function sanitizeCols(input: unknown): ColumnKey[] {
    if (!Array.isArray(input)) return DEFAULT_VISIBLE;
    const valid = input.filter((k): k is ColumnKey => ALL_COLUMNS.some((c) => c.key === k));
    return valid.length ? valid : DEFAULT_VISIBLE;
  }

  const [showCols, setShowCols]       = useState(false);
  const [visibleCols, setVisibleCols] = useState<ColumnKey[]>(() => {
    try {
      const raw = localStorage.getItem(COLS_GLOBAL_KEY);
      if (!raw) return DEFAULT_VISIBLE;
      return sanitizeCols(JSON.parse(raw));
    } catch { return DEFAULT_VISIBLE; }
  });

  const [page, setPage]       = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [membershipDebts, setMembershipDebts] = useState<Record<string,number>>({});
  const [dropinDebts, setDropinDebts]         = useState<Record<string,number>>({});
  const [selectedIds, setSelectedIds]         = useState<string[]>([]);
  const [showEmailModal, setShowEmailModal]   = useState(false);
  const [showPushModal, setShowPushModal]     = useState(false);
  const [toasts, setToasts]                   = useState<Toast[]>([]);

  const selectedMembers = useMemo(() => rows.filter((m) => selectedIds.includes(m.id)), [rows, selectedIds]);
  const formatMoney     = (value: number) => `${value.toFixed(2)} €`;
  const toggleSelect    = (id: string) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const clearSelection  = () => setSelectedIds([]);

  const pushToast = (t: Omit<Toast,'id'>, ms = 4500) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, ...t }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), ms);
  };
  const dismissToast = (id: string) => setToasts((prev) => prev.filter((x) => x.id !== id));

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id,full_name,phone,tenant_id,role,created_at,birth_date,address,afm,max_dropin_debt,email,notes')
      .eq('tenant_id', profile.tenant_id).eq('role', 'member')
      .order('created_at', { ascending: false });

    if (error) { setRows([]); setMembershipDebts({}); setDropinDebts({}); setSelectedIds([]); setLoading(false); return; }

    const members = (data as Member[]) ?? [];
    setRows(members); setSelectedIds([]);
    const memberIds = members.map((m) => m.id);
    if (!memberIds.length) { setMembershipDebts({}); setDropinDebts({}); setLoading(false); return; }

    const { data: membershipsData, error: membErr } = await supabase
      .from('memberships').select('user_id,debt').eq('tenant_id', profile.tenant_id).in('user_id', memberIds);

    const membershipMap: Record<string,number> = {};
    if (!membErr && membershipsData) {
      (membershipsData as any[]).forEach((m) => {
        const uid = m.user_id as string; const v = Number(m.debt ?? 0);
        if (Number.isFinite(v)) membershipMap[uid] = (membershipMap[uid] ?? 0) + v;
      });
    }

    const { data: bookingsData, error: bookErr } = await supabase
      .from('bookings').select('user_id,drop_in_price,booking_type,drop_in_paid')
      .eq('tenant_id', profile.tenant_id).eq('booking_type','drop_in').eq('drop_in_paid', false).in('user_id', memberIds);

    const dropinMap: Record<string,number> = {};
    if (!bookErr && bookingsData) {
      (bookingsData as any[]).forEach((b) => {
        const uid = b.user_id as string; const v = Number(b.drop_in_price ?? 0);
        if (Number.isFinite(v)) dropinMap[uid] = (dropinMap[uid] ?? 0) + v;
      });
    }

    setMembershipDebts(membershipMap); setDropinDebts(dropinMap); setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) =>
      (r.full_name ?? '').toLowerCase().includes(needle) ||
      (r.phone ?? '').toLowerCase().includes(needle) ||
      r.id.toLowerCase().includes(needle));
  }, [rows, q]);

  useEffect(() => { setPage(1); }, [q, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => filtered.slice((page-1)*pageSize, page*pageSize), [filtered, page, pageSize]);
  const startIdx = filtered.length === 0 ? 0 : (page-1)*pageSize+1;
  const endIdx   = Math.min(filtered.length, page*pageSize);
  const pageIds  = paginated.map((m) => m.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const toggleSelectPage = () => {
    setSelectedIds((prev) =>
      allPageSelected ? prev.filter((id) => !pageIds.includes(id))
                      : [...prev, ...pageIds.filter((id) => !prev.includes(id))]);
  };

  useEffect(() => {
    (async () => {
      if (!profile?.tenant_id) { setTenant(null); return; }
      const { data, error } = await supabase.from('tenants').select('name').eq('id', profile.tenant_id).maybeSingle();
      if (!error) setTenant(data as TenantRow | null);
    })();
  }, [profile?.tenant_id]);

  const isColVisible = (key: ColumnKey) => visibleCols.includes(key);
  const toggleCol    = (key: ColumnKey) => setVisibleCols((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  const setAllCols   = () => setVisibleCols(ALL_COLUMNS.map((c) => c.key));
  const resetCols    = () => setVisibleCols(DEFAULT_VISIBLE);
  const desktopColCount = 3 + visibleCols.length + 1;

  useEffect(() => {
    if (!showCols) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t || colsBtnRef.current?.contains(t) || colsPanelRef.current?.contains(t)) return;
      setShowCols(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showCols]);

  useEffect(() => {
    if (!showCols) return;
    const place = () => {
      const btn = colsBtnRef.current; const panel = colsPanelRef.current;
      if (!btn || !panel) return;
      const btnRect = btn.getBoundingClientRect();
      const panelWidth = panel.offsetWidth || 288; const panelHeight = panel.offsetHeight || 200;
      const margin = 8; const vw = window.innerWidth; const vh = window.innerHeight;
      let left = btnRect.left;
      if (left + panelWidth + margin > vw) left = btnRect.right - panelWidth;
      left = Math.max(margin, Math.min(left, vw - panelWidth - margin));
      const belowTop = btnRect.bottom + 8; const aboveTop = btnRect.top - 8 - panelHeight;
      let top = belowTop;
      if (belowTop + panelHeight + margin > vh && aboveTop >= margin) top = aboveTop;
      top = Math.max(margin, Math.min(top, vh - panelHeight - margin));
      setDropdownPos({ left, top });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [showCols]);

  useEffect(() => {
    if (!COLS_TENANT_KEY) return;
    try { const raw = localStorage.getItem(COLS_TENANT_KEY); if (raw) setVisibleCols(sanitizeCols(JSON.parse(raw))); } catch {}
  }, [COLS_TENANT_KEY]);

  useEffect(() => {
    try {
      localStorage.setItem(COLS_GLOBAL_KEY, JSON.stringify(visibleCols));
      if (COLS_TENANT_KEY) localStorage.setItem(COLS_TENANT_KEY, JSON.stringify(visibleCols));
    } catch {}
  }, [visibleCols, COLS_TENANT_KEY]);

  const subscriptionInactive = !subscription?.is_active;
  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) { setShowSubModal(true); return; }
    action();
  }

  const tier = String((subscription as any)?.plan_id ?? (subscription as any)?.tier ?? (subscription as any)?.plan_name ?? (subscription as any)?.name ?? '').toLowerCase();
  const isPro = tier.includes('pro'); const isStarter = tier.includes('starter'); const isFriend = tier.includes('friend_app'); const isFree = !(isPro || isStarter);
  const canSendComms = !isFree || isFriend;
  const canExport    = isPro || isFriend;

  function gateExport(actionName: 'Excel'|'PDF', action: () => void) {
    if (!canExport) { pushToast({ variant:'info', title:`🔒 Export ${actionName} διαθέσιμο μόνο στο Pro`, message:'Αναβάθμισε για εξαγωγή αρχείων (Excel/PDF).', actionLabel:'Αναβάθμιση', onAction: () => navigate('/settings/billing') }); return; }
    action();
  }

  function gateComms(actionName: 'Email'|'Push', action: () => void) {
    if (!canSendComms) { pushToast({ variant:'info', title:`🔒 ${actionName} διαθέσιμο από Starter`, message:'Αναβάθμισε για αποστολή μηνυμάτων σε μέλη.', actionLabel:'Αναβάθμιση', onAction: () => navigate('/settings/billing') }); return; }
    action();
  }

  const tenantNameFromProfile = tenant?.name ?? 'Cloudtec Gym';

  const exportRows = useMemo(() =>
    selectedIds.length > 0 ? rows.filter((m) => selectedIds.includes(m.id)) : filtered,
    [rows, filtered, selectedIds]);

  function buildExportColumns() {
    const base = [{ key:'full_name', label:'Όνομα' }, { key:'phone', label:'Τηλέφωνο' }] as const;
    const map: Record<ColumnKey,{key:string;label:string}> = {
      email:{ key:'email', label:'Email' }, birth_date:{ key:'birth_date', label:'Ημ. Γέννησης' },
      address:{ key:'address', label:'Διεύθυνση' }, afm:{ key:'afm', label:'ΑΦΜ' },
      total_debt:{ key:'total_debt', label:'Συνολική Οφειλή' }, max_dropin_debt:{ key:'max_dropin_debt', label:'Max Drop-in Οφειλή' },
      notes:{ key:'notes', label:'Σημειώσεις' }, created_at:{ key:'created_at', label:'Ημ. Δημιουργίας' },
    };
    return [...base, ...visibleCols.map((k) => map[k]).filter(Boolean)];
  }

  function toExportObject(m: Member) {
    const totalDebt = (membershipDebts[m.id] ?? 0) + (dropinDebts[m.id] ?? 0);
    return {
      full_name: m.full_name ?? '—', phone: m.phone ?? '—', email: m.email ?? '—',
      birth_date: formatDateDMY(m.birth_date), address: m.address ?? '—', afm: m.afm ?? '—',
      total_debt: totalDebt ? formatMoney(totalDebt) : '0',
      max_dropin_debt: m.max_dropin_debt != null ? formatMoney(Number(m.max_dropin_debt)) : '—',
      notes: m.notes ?? '-', created_at: formatDateDMY(m.created_at),
    };
  }

  function exportExcel() {
    const cols = buildExportColumns();
    const data = exportRows.map((m) => { const obj = toExportObject(m); const out: Record<string,any> = {}; cols.forEach((c) => (out[c.label] = (obj as any)[c.key])); return out; });
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Members');
    const buf = XLSX.write(wb, { bookType:'xlsx', type:'array' });
    saveAs(new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `members_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  async function exportPdf() {
    const cols = buildExportColumns(); const doc = new jsPDF({ orientation:'landscape' });
    const regular64 = await loadTtfAsBase64(notoSansUrl); doc.addFileToVFS('NotoSans-Regular.ttf', regular64); doc.addFont('NotoSans-Regular.ttf','NotoSans','normal');
    const bold64 = await loadTtfAsBase64(notoSansBoldUrl); doc.addFileToVFS('NotoSans-Bold.ttf', bold64); doc.addFont('NotoSans-Bold.ttf','NotoSans','bold');
    doc.setFont('NotoSans','normal'); doc.setFontSize(14); doc.text(`Μέλη (${exportRows.length})`, 14, 14);
    autoTable(doc, { head:[cols.map((c) => c.label)], body:exportRows.map((m) => { const obj = toExportObject(m); return cols.map((c) => String((obj as any)[c.key] ?? '')); }), startY:20, styles:{ font:'NotoSans', fontStyle:'normal', fontSize:9, cellPadding:2 }, headStyles:{ font:'NotoSans', fontStyle:'bold' }, theme:'grid' });
    doc.save(`members_${new Date().toISOString().slice(0,10)}.pdf`);
  }

  async function loadTtfAsBase64(url: string): Promise<string> {
    const res = await fetch(url); const buf = await res.arrayBuffer(); let binary = '';
    const bytes = new Uint8Array(buf); const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    return btoa(binary);
  }

  // ── Action button helper
  const ActionBtn = ({ icon: Icon, label, onClick, locked, disabled, className = '' }: {
    icon: LucideIcon; label: string; onClick: () => void;
    locked?: boolean; disabled?: boolean; className?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={[
        'h-9 px-3.5 rounded-xl border text-sm font-medium inline-flex items-center gap-2 transition-all duration-150',
        locked || disabled
          ? 'border-border/10 text-text-secondary opacity-50 cursor-not-allowed'
          : 'border-border/15 text-text-primary hover:bg-secondary/30 cursor-pointer',
        className,
      ].join(' ')}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="hidden sm:inline">{label}</span>
      {locked && <span className="text-[10px] opacity-70">🔒</span>}
    </button>
  );

  return (
    <div className="p-5 md:p-6 space-y-5">
      <ToastHost toasts={toasts} dismiss={dismissToast} />

      {/* ── Page header ── */}
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
          className="
            group relative inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-bold text-white
            bg-primary hover:bg-primary/90
            shadow-md shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-px
            active:translate-y-0 transition-all duration-150 cursor-pointer overflow-hidden
          "
          onClick={() => requireActiveSubscription(() => setShowCreate(true))}
        >
          <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          <Plus className="h-4 w-4 relative z-10" />
          <span className="relative z-10">Νέο Μέλος</span>
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-45 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
          <input
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
            placeholder="Αναζήτηση μελών…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* Comms */}
        <ActionBtn icon={Inbox}  label="Αποστολή Email"        onClick={() => gateComms('Email', () => setShowEmailModal(true))} locked={!canSendComms} disabled={rows.length === 0} />
        <ActionBtn icon={BellDot} label="Αποστολή Ειδοποίησης" onClick={() => gateComms('Push',  () => setShowPushModal(true))}  locked={!canSendComms} disabled={rows.length === 0} />

        {/* Columns toggle */}
        <div className="relative">
          <button
            ref={colsBtnRef}
            type="button"
            className="h-9 px-3.5 rounded-xl border border-border/15 text-sm text-text-primary hover:bg-secondary/30 inline-flex items-center gap-2 cursor-pointer transition-all"
            onClick={() => setShowCols((s) => !s)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Στήλες</span>
          </button>

          {showCols && (
            <div
              ref={colsPanelRef}
              className="fixed z-50 w-72 rounded-xl border border-border/15 bg-secondary-background/95 backdrop-blur-xl shadow-2xl shadow-black/20 overflow-hidden"
              style={{ left: dropdownPos.left, top: dropdownPos.top }}
            >
              <div className="h-0.75 w-full bg-linear-to-r from-primary/0 via-primary to-primary/0" />
              <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
                <span className="text-sm font-bold text-text-primary">Στήλες πίνακα</span>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={setAllCols}  className="text-[11px] px-2 py-1 rounded-lg border border-border/15 hover:bg-secondary/30 text-text-secondary transition-all">όλα</button>
                  <button type="button" onClick={resetCols}   className="text-[11px] px-2 py-1 rounded-lg border border-border/15 hover:bg-secondary/30 text-text-secondary transition-all">reset</button>
                  <button type="button" onClick={() => setShowCols(false)} className="p-1 rounded-lg hover:bg-border/10 text-text-secondary transition-all"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="p-2 max-h-72 overflow-auto space-y-0.5 no-scrollbar">
                {ALL_COLUMNS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-secondary/25 cursor-pointer transition-all">
                    <div className={['w-4 h-4 rounded-md border flex items-center justify-center transition-all', isColVisible(c.key) ? 'bg-primary border-primary' : 'border-border/30'].join(' ')}>
                      {isColVisible(c.key) && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <input type="checkbox" className="sr-only" checked={isColVisible(c.key)} onChange={() => toggleCol(c.key)} />
                    <span className="text-sm text-text-primary">{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Export row */}
      <div className="flex items-center gap-2">
        <ActionBtn
          icon={Sheet} label="Εξαγωγή Excel"
          onClick={() => gateExport('Excel', () => exportExcel())}
          locked={!canExport} disabled={loading || rows.length === 0}
          className={canExport ? 'hover:bg-emerald-600! hover:border-emerald-600! hover:text-white!' : ''}
        />
        <ActionBtn
          icon={FileText} label="Εξαγωγή PDF"
          onClick={() => gateExport('PDF', () => exportPdf())}
          locked={!canExport} disabled={loading || rows.length === 0}
          className={canExport ? 'hover:bg-red-600! hover:border-red-600! hover:text-white!' : ''}
        />
        {selectedIds.length > 0 && (
          <div className="ml-auto flex items-center gap-2 text-xs text-text-secondary bg-primary/10 border border-primary/20 rounded-xl px-3 py-2">
            <span className="font-bold text-primary">{selectedIds.length}</span>
            επιλεγμένα
            <button type="button" onClick={clearSelection} className="ml-1 text-text-secondary hover:text-text-primary transition-all">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* ── Table card ── */}
      <div className="rounded-2xl border border-border/10 overflow-hidden bg-secondary-background/40">

        {/* DESKTOP TABLE */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-180 text-sm">
            <thead>
              <tr className="border-b border-border/10 bg-secondary/10">
                <th className="px-4 py-3 w-10">
                  <div onClick={toggleSelectPage} className={['w-4 h-4 rounded-md border flex items-center justify-center cursor-pointer transition-all', allPageSelected ? 'bg-primary border-primary' : 'border-border/30 hover:border-primary/50'].join(' ')}>
                    {allPageSelected && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                </th>
                {['Όνομα','Τηλέφωνο'].map((h) => <Th key={h}>{h}</Th>)}
                {isColVisible('email')           && <Th>Email</Th>}
                {isColVisible('birth_date')       && <Th>Ημ. Γέννησης</Th>}
                {isColVisible('address')          && <Th>Διεύθυνση</Th>}
                {isColVisible('afm')              && <Th>ΑΦΜ</Th>}
                {isColVisible('total_debt')       && <Th>Συνολική Οφειλή</Th>}
                {isColVisible('max_dropin_debt')  && <Th>Max Drop-in</Th>}
                {isColVisible('notes')            && <Th>Σημειώσεις</Th>}
                {isColVisible('created_at')       && <Th>Εγγραφή</Th>}
                <Th className="text-right pr-4">Ενέργειες</Th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={desktopColCount} className="px-4 py-8 text-center">
                  <div className="flex items-center justify-center gap-2 text-text-secondary text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…
                  </div>
                </td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={desktopColCount} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-text-secondary">
                    <Users className="h-8 w-8 opacity-30" />
                    <span className="text-sm">Δεν βρέθηκαν μέλη</span>
                  </div>
                </td></tr>
              )}
              {!loading && paginated.map((m) => {
                const totalDebt = (membershipDebts[m.id] ?? 0) + (dropinDebts[m.id] ?? 0);
                const isSelected = selectedIds.includes(m.id);
                return (
                  <tr key={m.id} className={['border-t border-border/5 transition-colors', isSelected ? 'bg-primary/5' : 'hover:bg-secondary/10'].join(' ')}>
                    <td className="px-4 py-3">
                      <div onClick={() => toggleSelect(m.id)} className={['w-4 h-4 rounded-md border flex items-center justify-center cursor-pointer transition-all', isSelected ? 'bg-primary border-primary' : 'border-border/30 hover:border-primary/50'].join(' ')}>
                        {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>
                    </td>
                    <Td><span className="font-medium text-text-primary">{m.full_name ?? '—'}</span></Td>
                    <Td><span className="text-text-secondary">{m.phone ?? '—'}</span></Td>

                    {isColVisible('email')          && <Td><span className="text-text-secondary text-xs">{m.email ?? '—'}</span></Td>}
                    {isColVisible('birth_date')      && <Td>{formatDateDMY(m.birth_date)}</Td>}
                    {isColVisible('address')         && <Td>{m.address ?? '—'}</Td>}
                    {isColVisible('afm')             && <Td>{m.afm ?? '—'}</Td>}
                    {isColVisible('total_debt') && (
                      <Td>
                        {totalDebt !== 0
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-warning/10 border border-warning/20 text-warning text-xs font-bold">{formatMoney(totalDebt)}</span>
                          : <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-success/10 border border-success/20 text-success text-xs font-bold">0 €</span>}
                      </Td>
                    )}
                    {isColVisible('max_dropin_debt') && <Td>{m.max_dropin_debt != null ? formatMoney(Number(m.max_dropin_debt)) : '—'}</Td>}
                    {isColVisible('notes')           && <Td><span className="max-w-50 truncate block text-text-secondary text-xs">{m.notes ?? '—'}</span></Td>}
                    {isColVisible('created_at')      && <Td><span className="text-text-secondary text-xs">{formatDateDMY(m.created_at)}</span></Td>}

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton icon={Eye}    label="Λεπτομέρειες" onClick={() => navigate(`/members/${m.id}`, { state: { member: m, tenantId, subscriptionInactive } })} />
                        <IconButton icon={Pencil} label="Επεξεργασία"  onClick={() => requireActiveSubscription(() => setEditRow(m))} />
                        <DeleteButton id={m.id} onDeleted={load} guard={() => { if (subscriptionInactive) { setShowSubModal(true); return false; } return true; }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARDS */}
        <div className="md:hidden divide-y divide-border/10">
          {loading && <div className="px-4 py-8 text-center text-sm text-text-secondary flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…</div>}
          {!loading && filtered.length === 0 && <div className="px-4 py-12 flex flex-col items-center gap-2 text-text-secondary"><Users className="h-8 w-8 opacity-30" /><span className="text-sm">Δεν βρέθηκαν μέλη</span></div>}
          {!loading && paginated.map((m) => {
            const totalDebt = (membershipDebts[m.id] ?? 0) + (dropinDebts[m.id] ?? 0);
            const isSelected = selectedIds.includes(m.id);
            return (
              <div key={m.id} className={['px-4 py-3.5 transition-colors', isSelected ? 'bg-primary/5' : 'hover:bg-secondary/5'].join(' ')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div onClick={() => toggleSelect(m.id)} className={['mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center cursor-pointer shrink-0 transition-all', isSelected ? 'bg-primary border-primary' : 'border-border/30'].join(' ')}>
                      {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-text-primary">{m.full_name ?? '—'}</div>
                      <div className="text-xs text-text-secondary mt-0.5">{m.phone ?? '—'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <IconButton icon={Eye}    label="Λεπτομέρειες" onClick={() => navigate(`/members/${m.id}`, { state: { member: m, tenantId, subscriptionInactive } })} />
                    <IconButton icon={Pencil} label="Επεξεργασία"  onClick={() => requireActiveSubscription(() => setEditRow(m))} />
                    <DeleteButton id={m.id} onDeleted={load} guard={() => { if (subscriptionInactive) { setShowSubModal(true); return false; } return true; }} />
                  </div>
                </div>
                {(isColVisible('total_debt') || isColVisible('email') || isColVisible('created_at')) && (
                  <div className="mt-2.5 ml-7 flex flex-wrap gap-2">
                    {isColVisible('total_debt') && (
                      totalDebt !== 0
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-warning/10 border border-warning/20 text-warning text-[11px] font-bold">{formatMoney(totalDebt)}</span>
                        : <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-success/10 border border-success/20 text-success text-[11px] font-bold">0 €</span>
                    )}
                    {isColVisible('email') && m.email && <span className="text-[11px] text-text-secondary">{m.email}</span>}
                    {isColVisible('created_at') && <span className="text-[11px] text-text-secondary">{formatDateDMY(m.created_at)}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/10 bg-secondary/5 text-xs text-text-secondary flex-wrap gap-2">
            <span>
              <span className="font-semibold text-text-primary">{startIdx}–{endIdx}</span> από <span className="font-semibold text-text-primary">{filtered.length}</span>
            </span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span>Ανά σελίδα:</span>
                <select className="bg-secondary-background border border-border/15 rounded-lg px-2 py-1 text-xs text-text-primary outline-none"
                  value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                  <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p-1))} disabled={page === 1}
                  className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 transition-all cursor-pointer disabled:cursor-not-allowed">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="px-2">Σελ. <span className="font-semibold text-text-primary">{page}</span>/{pageCount}</span>
                <button onClick={() => setPage((p) => Math.min(pageCount, p+1))} disabled={page === pageCount}
                  className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 transition-all cursor-pointer disabled:cursor-not-allowed">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && profile?.tenant_id && (
        <CreateMemberModal tenantId={profile.tenant_id} onClose={() => { setShowCreate(false); load(); }} toast={pushToast} />
      )}
      {editRow && (
        <EditMemberModal row={editRow} onClose={() => { setEditRow(null); load(); }} />
      )}
      {showEmailModal && (
        <SendMemberEmailModal isOpen={showEmailModal} onClose={() => setShowEmailModal(false)}
          tenantName={tenantNameFromProfile} tenantId={profile?.tenant_id ?? null}
          memberIds={selectedIds} selectedMembers={selectedMembers.map((m) => ({ id: m.id, full_name: m.full_name, email: m.email }))} />
      )}
      {showPushModal && (
        <SendMemberPushModal isOpen={showPushModal} onClose={() => setShowPushModal(false)}
          tenantName={tenantNameFromProfile} tenantId={profile?.tenant_id ?? null}
          selectedMembers={selectedMembers.map((m) => ({ id: m.id, full_name: m.full_name, email: m.email, user_id: m.id }))} />
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

// ── Table primitives
function Th({ children, className = '' }: any) {
  return <th className={`px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-text-secondary ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: any) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

// ── Delete button
function DeleteButton({ id, onDeleted, guard }: { id: string; onDeleted: () => void; guard?: () => boolean }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (guard && !guard()) return;
    if (!confirm('Διαγραφή αυτού του μέλους; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.')) return;
    setBusy(true);
    await supabase.functions.invoke('member-delete', { body: { id } });
    setBusy(false);
    onDeleted();
  };
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-danger/25 text-danger hover:bg-danger/10 disabled:opacity-40 transition-all cursor-pointer"
      aria-label="Διαγραφή" title="Διαγραφή">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}

async function readEdgeErrorPayload(err: any): Promise<any | null> {
  const res: Response | undefined = err?.context;
  if (!res) return null;
  try { return await res.clone().json(); }
  catch { try { const txt = await res.clone().text(); return txt ? { error: txt } : null; } catch { return null; } }
}

// ── Create modal
function CreateMemberModal({ tenantId, onClose, toast }: { tenantId: string; onClose: () => void; toast: (t: Omit<Toast,'id'>, ms?: number) => void }) {
  const [email, setEmail]               = useState('');
  const [fullName, setFullName]         = useState('');
  const [phone, setPhone]               = useState('');
  const [birthDate, setBirthDate]       = useState<Date | null>(null);
  const [address, setAddress]           = useState('');
  const [afm, setAfm]                   = useState('');
  const [maxDropinDebt, setMaxDropinDebt] = useState('');
  const [password, setPassword]         = useState('');
  const [notes, setNotes]               = useState('');
  const [busy, setBusy]                 = useState(false);
  const navigate                        = useNavigate();

  const submit = async () => {
    if (!email || !password) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('member-create', {
      body: { email, password, full_name: fullName, phone, tenant_id: tenantId,
        birth_date: birthDate ? dateToISODate(birthDate) : null, address: address || null,
        afm: afm || null, max_dropin_debt: maxDropinDebt ? Number(maxDropinDebt) : null, notes: notes || null },
    });
    setBusy(false);
    if (error) {
      const payload = await readEdgeErrorPayload(error); const code = payload?.error;
      if (code === 'PLAN_LIMIT:MAX_MEMBERS_REACHED') {
        toast({ variant:'error', title:'Έφτασες το όριο του πλάνου σου',
          message: payload?.limit != null ? `Έχεις ήδη ${payload.current}/${payload.limit}.` : 'Έχεις φτάσει το όριο.',
          actionLabel:'Αναβάθμιση', onAction: () => navigate('/settings/billing') });
        return;
      }
      toast({ variant:'error', title:'Αποτυχία δημιουργίας μέλους', message: code ?? error.message ?? 'Unknown error' });
      return;
    }
    const code = (data as any)?.error;
    if (code) { toast({ variant:'error', title:'Αποτυχία', message: String(code) }); return; }
    toast({ variant:'success', title:'Το μέλος δημιουργήθηκε', message:'Προστέθηκε επιτυχώς στη λίστα μελών.' });
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Νέο Μέλος">
      <FormRow label="Όνομα *"><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} /></FormRow>
      <FormRow label="Email *"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></FormRow>
      <FormRow label="Τηλέφωνο"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></FormRow>
      <FormRow label="Ημ. γέννησης">
        <DatePicker selected={birthDate} onChange={(date) => setBirthDate(date)} dateFormat="dd/MM/yyyy" locale={el} placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
          className="input" wrapperClassName="w-full" showMonthDropdown showYearDropdown dropdownMode="select" scrollableYearDropdown yearDropdownItemNumber={80} />
      </FormRow>
      <FormRow label="Διεύθυνση"><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></FormRow>
      <FormRow label="ΑΦΜ"><input className="input" value={afm} onChange={(e) => setAfm(e.target.value)} /></FormRow>
      <FormRow label="Μέγιστο χρέος drop-in"><input className="input" type="number" step="0.01" value={maxDropinDebt} onChange={(e) => setMaxDropinDebt(e.target.value)} /></FormRow>
      <FormRow label="Σημειώσεις"><textarea className="input min-h-20 resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} /></FormRow>
      <FormRow label="Password *"><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></FormRow>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Ακύρωση</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>{busy ? 'Δημιουργία...' : 'Δημιουργία'}</button>
      </div>
    </Modal>
  );
}

// ── Edit modal
function EditMemberModal({ row, onClose }: { row: Member; onClose: () => void }) {
  const [fullName, setFullName]           = useState(row.full_name ?? '');
  const [phone, setPhone]                 = useState(row.phone ?? '');
  const [birthDate, setBirthDate]         = useState<Date | null>(parseISODateToLocal(row.birth_date));
  const [address, setAddress]             = useState(row.address ?? '');
  const [afm, setAfm]                     = useState(row.afm ?? '');
  const [maxDropinDebt, setMaxDropinDebt] = useState(row.max_dropin_debt != null ? String(row.max_dropin_debt) : '');
  const [notes, setNotes]                 = useState(row.notes ?? '');
  const [password, setPassword]           = useState('');
  const [busy, setBusy]                   = useState(false);

  const submit = async () => {
    setBusy(true);
    await supabase.functions.invoke('member-update', {
      body: { id: row.id, full_name: fullName, phone, password: password || undefined,
        birth_date: birthDate ? dateToISODate(birthDate) : null, address: address || null,
        afm: afm || null, max_dropin_debt: maxDropinDebt ? Number(maxDropinDebt) : null, notes: notes || null },
    });
    setBusy(false);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Επεξεργασία Μέλους">
      <FormRow label="Όνομα"><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} /></FormRow>
      <FormRow label="Τηλέφωνο"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></FormRow>
      <FormRow label="Ημ. γέννησης">
        <DatePicker selected={birthDate} onChange={(date) => setBirthDate(date)} dateFormat="dd/MM/yyyy" locale={el} placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
          className="input" wrapperClassName="w-full" showMonthDropdown showYearDropdown dropdownMode="select" scrollableYearDropdown yearDropdownItemNumber={80} />
      </FormRow>
      <FormRow label="Διεύθυνση"><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></FormRow>
      <FormRow label="ΑΦΜ"><input className="input" value={afm} onChange={(e) => setAfm(e.target.value)} /></FormRow>
      <FormRow label="Μέγιστο χρέος drop-in"><input className="input" type="number" step="0.01" value={maxDropinDebt} onChange={(e) => setMaxDropinDebt(e.target.value)} /></FormRow>
      <FormRow label="Σημειώσεις"><textarea className="input min-h-20 resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} /></FormRow>
      <FormRow label="Νέο password (προαιρετικό)"><input className="input" type="password" placeholder="Αφήστε κενό για να διατηρήσετε το τρέχον" value={password} onChange={(e) => setPassword(e.target.value)} /></FormRow>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Ακύρωση</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>{busy ? 'Αποθήκευση...' : 'Αποθήκευση'}</button>
      </div>
    </Modal>
  );
}

// ── Shared UI helpers
function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-2xl overflow-hidden"
           style={{ animation: 'toastIn 0.2s ease' }}>
        <div className="h-0.75 w-full bg-linear-to-r from-primary/0 via-primary to-primary/0" />
        <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between">
          <div className="font-black text-text-primary tracking-tight">{title}</div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-border/10 text-text-secondary hover:text-text-primary transition-all cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function FormRow({ label, children }: any) {
  return (
    <label className="block mb-3">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-text-secondary">{label}</div>
      {children}
    </label>
  );
}

function IconButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border/10 text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
      aria-label={label} title={label}>
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}