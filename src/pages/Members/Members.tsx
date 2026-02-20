import { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import SendMemberEmailModal from '../../components/Members/SendMemberEmailModal';
import type { LucideIcon } from 'lucide-react';
import { Eye, Pencil, Trash2, Loader2, Sheet, FileText, Inbox, BellDot } from 'lucide-react';
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


type TenantRow = {
  name: string;
};

type ColumnKey =
  | 'email'
  | 'birth_date'
  | 'address'
  | 'afm'
  | 'total_debt'
  | 'max_dropin_debt'
  | 'created_at'
  | 'notes';

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'email', label: 'Email' },
  { key: 'birth_date', label: 'Ημ. Γέννησης' },
  { key: 'address', label: 'Διεύθυνση' },
  { key: 'afm', label: 'ΑΦΜ' },
  { key: 'total_debt', label: 'Συνολική Οφειλή' },
  { key: 'max_dropin_debt', label: 'Max Drop-in Οφειλή' },
  { key: 'notes', label: 'Σημειώσεις' },
  { key: 'created_at', label: 'Ημ. Δημιουργίας' },
];

// defaults (what you show today)
const DEFAULT_VISIBLE: ColumnKey[] = [
  'total_debt',
  'max_dropin_debt',
  'created_at',
];

function formatDateDMY(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
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


type Toast = {
  id: string;
  title: string;
  message?: string;
  variant?: "error" | "success" | "info";
  actionLabel?: string;
  onAction?: () => void;
};

function ToastHost({
  toasts,
  dismiss,
}: {
  toasts: Toast[];
  dismiss: (id: string) => void;
}) {
  return (
    <div className="fixed right-4 top-4 z-100 flex w-120 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            "rounded-xl border border-border/15 bg-secondary-background/95 backdrop-blur shadow-2xl shadow-black/20",
            "px-3 py-3",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div
                className={[
                  "text-sm font-semibold",
                  t.variant === "error" ? "text-danger" : "",
                  t.variant === "success" ? "text-success" : "",
                ].join(" ")}
              >
                {t.title}
              </div>
              {t.message && (
                <div className="mt-1 text-xs text-text-secondary">{t.message}</div>
              )}
              {t.actionLabel && t.onAction && (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => t.onAction?.()}
                    className="h-8 rounded-md px-3 text-xs bg-primary hover:bg-primary/90 text-white"
                  >
                    {t.actionLabel}
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="rounded-md border border-border/15 px-2 py-1 text-xs hover:bg-secondary/30"
              aria-label="Κλείσιμο"
              title="Κλείσιμο"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}


export default function MembersPage() {
  const { profile, subscription } = useAuth();
  const [showSubModal, setShowSubModal] = useState(false);
  const [tenant, setTenant] = useState<TenantRow | null>(null);
  const [rows, setRows] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Member | null>(null);
  const colsBtnRef = useRef<HTMLButtonElement | null>(null);
  const colsPanelRef = useRef<HTMLDivElement | null>(null);

  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });



  const navigate = useNavigate();
  const tenantId = profile?.tenant_id;

  const COLS_GLOBAL_KEY = 'members_table_visible_cols_v1';
  const COLS_TENANT_KEY = tenantId
    ? `members_table_visible_cols_v1_${tenantId}`
    : null;

  function sanitizeCols(input: unknown): ColumnKey[] {
    if (!Array.isArray(input)) return DEFAULT_VISIBLE;
    const valid = input.filter((k): k is ColumnKey =>
      ALL_COLUMNS.some((c) => c.key === k),
    );
    return valid.length ? valid : DEFAULT_VISIBLE;
  }




  const [showCols, setShowCols] = useState(false);
  const [visibleCols, setVisibleCols] = useState<ColumnKey[]>(() => {
    try {
      const raw = localStorage.getItem(COLS_GLOBAL_KEY);
      if (!raw) return DEFAULT_VISIBLE;
      return sanitizeCols(JSON.parse(raw));
    } catch {
      return DEFAULT_VISIBLE;
    }
  });


  // pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Details modal state
  // const [detailsMember, setDetailsMember] = useState<Member | null>(null);

  // debts per member
  const [membershipDebts, setMembershipDebts] = useState<Record<string, number>>(
    {},
  );
  const [dropinDebts, setDropinDebts] = useState<Record<string, number>>({});

  // email selection + modal
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showEmailModal, setShowEmailModal] = useState(false);

  const selectedMembers = useMemo(
    () => rows.filter((m) => selectedIds.includes(m.id)),
    [rows, selectedIds],
  );

  const [showPushModal, setShowPushModal] = useState(false);


  const formatMoney = (value: number) => `${value.toFixed(2)} €`;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const clearSelection = () => setSelectedIds([]);


  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = (t: Omit<Toast, "id">, ms = 4500) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, ...t }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, ms);
  };

  const dismissToast = (id: string) =>
    setToasts((prev) => prev.filter((x) => x.id !== id));

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);

    // 1) Load members (profiles)
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, full_name, phone, tenant_id, role, created_at, birth_date, address, afm, max_dropin_debt, email, notes',
      )
      .eq('tenant_id', profile.tenant_id)
      .eq('role', 'member')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setRows([]);
      setMembershipDebts({});
      setDropinDebts({});
      setSelectedIds([]);
      setLoading(false);
      return;
    }

    const members = (data as Member[]) ?? [];
    setRows(members);
    setSelectedIds([]); // καθάρισμα επιλογών σε κάθε φόρτωμα

    const memberIds = members.map((m) => m.id);
    if (memberIds.length === 0) {
      setMembershipDebts({});
      setDropinDebts({});
      setLoading(false);
      return;
    }

    // 2) Membership debts: sum(memberships.debt) per user_id
    const { data: membershipsData, error: membErr } = await supabase
      .from('memberships')
      .select('user_id, debt')
      .eq('tenant_id', profile.tenant_id)
      .in('user_id', memberIds);

    const membershipMap: Record<string, number> = {};
    if (!membErr && membershipsData) {
      (membershipsData as any[]).forEach((m) => {
        const uid = m.user_id as string;
        const debtVal = Number(m.debt ?? 0);
        if (!Number.isFinite(debtVal)) return;
        membershipMap[uid] = (membershipMap[uid] ?? 0) + debtVal;
      });
    }

    // 3) Drop-in debts: sum(drop_in_price) where booking_type='drop_in' and drop_in_paid=false
    const { data: bookingsData, error: bookErr } = await supabase
      .from('bookings')
      .select('user_id, drop_in_price, booking_type, drop_in_paid')
      .eq('tenant_id', profile.tenant_id)
      .eq('booking_type', 'drop_in')
      .eq('drop_in_paid', false)
      .in('user_id', memberIds);

    const dropinMap: Record<string, number> = {};
    if (!bookErr && bookingsData) {
      (bookingsData as any[]).forEach((b) => {
        const uid = b.user_id as string;
        const priceVal = Number(b.drop_in_price ?? 0);
        if (!Number.isFinite(priceVal)) return;
        dropinMap[uid] = (dropinMap[uid] ?? 0) + priceVal;
      });
    }

    setMembershipDebts(membershipMap);
    setDropinDebts(dropinMap);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [profile?.tenant_id]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter(
      (r) =>
        (r.full_name ?? '').toLowerCase().includes(needle) ||
        (r.phone ?? '').toLowerCase().includes(needle) ||
        r.id.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  // Reset to first page when filter or page size changes
  useEffect(() => {
    setPage(1);
  }, [q, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const startIdx = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(filtered.length, page * pageSize);

  const pageIds = paginated.map((m) => m.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      if (allPageSelected) {
        // ξε-επιλογή όλων στη σελίδα
        return prev.filter((id) => !pageIds.includes(id));
      }
      // πρόσθεση όσων δεν υπάρχουν ήδη
      return [...prev, ...pageIds.filter((id) => !prev.includes(id))];
    });
  };

  useEffect(() => {
    (async () => {
      if (!profile?.tenant_id) {
        setTenant(null);
        return;
      }

      const { data, error } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', profile.tenant_id)
        .maybeSingle();

      if (error) {
        console.error('Failed to load tenant:', error);
        setTenant(null);
      } else {
        setTenant(data as TenantRow | null);
      }
    })();
  }, [profile?.tenant_id]);


  const isColVisible = (key: ColumnKey) => visibleCols.includes(key);

  const toggleCol = (key: ColumnKey) => {
    setVisibleCols((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const setAllCols = () => setVisibleCols(ALL_COLUMNS.map((c) => c.key));
  const resetCols = () => setVisibleCols(DEFAULT_VISIBLE);

  const desktopColCount =
    3 + // checkbox + name + phone
    visibleCols.length +
    1; // actions


  useEffect(() => {
    if (!showCols) return;

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;

      // if click is inside the button or the dropdown, ignore
      if (colsBtnRef.current?.contains(t)) return;
      if (colsPanelRef.current?.contains(t)) return;

      setShowCols(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showCols]);


  useEffect(() => {
    if (!showCols) return;

    const place = () => {
      const btn = colsBtnRef.current;
      const panel = colsPanelRef.current;
      if (!btn || !panel) return;

      const btnRect = btn.getBoundingClientRect();

      // Make sure panel has a measurable width/height
      const panelWidth = panel.offsetWidth || 288; // fallback ~w-72
      const panelHeight = panel.offsetHeight || 200;

      const margin = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Horizontal: prefer align-left, otherwise align-right, then clamp
      let left = btnRect.left;
      if (left + panelWidth + margin > vw) {
        left = btnRect.right - panelWidth;
      }
      left = Math.max(margin, Math.min(left, vw - panelWidth - margin));

      // Vertical: prefer below; if not enough space, open above
      const belowTop = btnRect.bottom + 8;
      const aboveTop = btnRect.top - 8 - panelHeight;

      let top = belowTop;
      if (belowTop + panelHeight + margin > vh && aboveTop >= margin) {
        top = aboveTop;
      }

      // clamp vertical anyway
      top = Math.max(margin, Math.min(top, vh - panelHeight - margin));

      setDropdownPos({ left, top });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true); // catches inner scroll containers too
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [showCols]);

  useEffect(() => {
    if (!COLS_TENANT_KEY) return;

    try {
      const raw = localStorage.getItem(COLS_TENANT_KEY);
      if (!raw) return; // important: keep whatever we already have (global)
      setVisibleCols(sanitizeCols(JSON.parse(raw)));
    } catch { }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [COLS_TENANT_KEY]);

  useEffect(() => {
    try {
      localStorage.setItem(COLS_GLOBAL_KEY, JSON.stringify(visibleCols));
      if (COLS_TENANT_KEY) {
        localStorage.setItem(COLS_TENANT_KEY, JSON.stringify(visibleCols));
      }
    } catch { }
  }, [visibleCols, COLS_TENANT_KEY]);




  const subscriptionInactive = !subscription?.is_active;

  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) {
      setShowSubModal(true);
      return;
    }
    action();
  }

  const tier = String(
    (subscription as any)?.plan_id ??
    (subscription as any)?.tier ??
    (subscription as any)?.plan_name ??
    (subscription as any)?.name ??
    ""
  ).toLowerCase();

  const isPro = tier.includes("pro");
  const isStarter = tier.includes("starter");
  const isFriend = tier.includes("friend_app");
  const isFree = !(isPro || isStarter);

  // decide where email/push belong:
  const canSendComms = !isFree || isFriend; // ✅ Starter+
  // or if you want Pro-only:
  // const canSendComms = isPro;

  const canExport = isPro || isFriend; // ✅ Excel + PDF only for Pro

  function gateExport(actionName: "Excel" | "PDF", action: () => void) {
    if (!canExport) {
      pushToast({
        variant: "info",
        title: `🔒 Export ${actionName} διαθέσιμο μόνο στο Pro`,
        message: "Αναβάθμισε για εξαγωγή αρχείων (Excel/PDF).",
        actionLabel: "Αναβάθμιση",
        onAction: () => navigate("/settings/billing"),
      });
      return;
    }
    action();
  }


  function gateComms(actionName: "Email" | "Push", action: () => void) {
    if (!canSendComms) {
      pushToast({
        variant: "info",
        title: `🔒 ${actionName} διαθέσιμο από Starter`,
        message: "Αναβάθμισε για αποστολή μηνυμάτων σε μέλη.",
        actionLabel: "Αναβάθμιση",
        onAction: () => navigate("/settings/billing"),
      });
      return;
    }
    action();
  }

  const tenantNameFromProfile = tenant?.name ?? 'Cloudtec Gym';




  const exportRows = useMemo(() => {
    // if user selected members -> export those, else export filtered list
    if (selectedIds.length > 0) {
      return rows.filter((m) => selectedIds.includes(m.id));
    }
    return filtered;
  }, [rows, filtered, selectedIds]);

  function buildExportColumns() {
    // Always include these basics
    const base = [
      { key: 'full_name', label: 'Όνομα' },
      { key: 'phone', label: 'Τηλέφωνο' },
    ] as const;

    // Add your visible columns (from your column selector)
    // NOTE: adjust if you added extra columns like notes etc.
    const map: Record<ColumnKey, { key: string; label: string }> = {
      email: { key: 'email', label: 'Email' },
      birth_date: { key: 'birth_date', label: 'Ημ. Γέννησης' },
      address: { key: 'address', label: 'Διεύθυνση' },
      afm: { key: 'afm', label: 'ΑΦΜ' },
      total_debt: { key: 'total_debt', label: 'Συνολική Οφειλή' },
      max_dropin_debt: { key: 'max_dropin_debt', label: 'Max Drop-in Οφειλή' },
      notes: { key: 'notes', label: 'Σημειώσεις' },
      created_at: { key: 'created_at', label: 'Ημ. Δημιουργίας' },
    };

    const dynamic = visibleCols.map((k) => map[k]).filter(Boolean);
    return [...base, ...dynamic];
  }

  function toExportObject(m: Member) {
    const membershipDebt = membershipDebts[m.id] ?? 0;
    const dropinDebt = dropinDebts[m.id] ?? 0;
    const totalDebt = membershipDebt + dropinDebt;

    return {
      full_name: m.full_name ?? '—',
      phone: m.phone ?? '—',
      email: m.email ?? '—',
      birth_date: formatDateDMY(m.birth_date),
      address: m.address ?? '—',
      afm: m.afm ?? '—',
      total_debt: totalDebt ? formatMoney(totalDebt) : '0',
      max_dropin_debt:
        m.max_dropin_debt != null ? formatMoney(Number(m.max_dropin_debt)) : '—',
      notes: m.notes ?? '-',
      created_at: formatDateDMY(m.created_at),
    };
  }

  function exportExcel() {
    const cols = buildExportColumns();
    const data = exportRows.map((m) => {
      const obj = toExportObject(m);
      // build row with labels (nice for excel headers)
      const out: Record<string, any> = {};
      cols.forEach((c) => (out[c.label] = (obj as any)[c.key]));
      return out;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Members');

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const filename = `members_${new Date().toISOString().slice(0, 10)}.xlsx`;
    saveAs(blob, filename);
  }

  async function exportPdf() {
    const cols = buildExportColumns();
    const doc = new jsPDF({ orientation: 'landscape' });

    // ✅ Embed Greek-capable font
    const regular64 = await loadTtfAsBase64(notoSansUrl);
    doc.addFileToVFS('NotoSans-Regular.ttf', regular64);
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');

    const bold64 = await loadTtfAsBase64(notoSansBoldUrl);
    doc.addFileToVFS('NotoSans-Bold.ttf', bold64);
    doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');

    doc.setFont('NotoSans', 'normal');

    const title = `Μέλη (${exportRows.length})`;
    doc.setFontSize(14);
    doc.text(title, 14, 14);

    const head = [cols.map((c) => c.label)];
    const body = exportRows.map((m) => {
      const obj = toExportObject(m);
      return cols.map((c) => String((obj as any)[c.key] ?? ''));
    });

    autoTable(doc, {
      head,
      body,
      startY: 20,

      // ✅ body defaults
      styles: {
        font: 'NotoSans',
        fontStyle: 'normal',
        fontSize: 9,
        cellPadding: 2,
      },

      // ✅ header uses bold + same font
      headStyles: {
        font: 'NotoSans',
        fontStyle: 'bold',
      },

      // (optional) ensure theme doesn't override
      theme: 'grid',
    });


    doc.save(`members_${new Date().toISOString().slice(0, 10)}.pdf`);
  }


  async function loadTtfAsBase64(url: string): Promise<string> {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }


  return (
    <div className="p-6">
      <div className="flex flex-wrap justify-between">
        <ToastHost toasts={toasts} dismiss={dismissToast} />
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            className="h-9 rounded-md border border-border/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
            placeholder="Αναζήτηση μελών…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white"
            onClick={() => requireActiveSubscription(() => setShowCreate(true))}
          >
            Νέο Μέλος
          </button>

          <button
            className={[
              "h-9 rounded-md px-3 text-sm border border-border/15 inline-flex items-center gap-2",
              canSendComms
                ? "text-text-primary hover:bg-secondary/30 cursor-pointer"
                : "text-text-secondary opacity-60 cursor-not-allowed",
            ].join(" ")}
            onClick={() => gateComms("Email", () => setShowEmailModal(true))}
            disabled={rows.length === 0} // keep disabled if no data
            title={!canSendComms ? "Διαθέσιμο από Starter" : "Αποστολή Email"}
          >
            <Inbox className="h-4 w-4" />
            Αποστολή Email
            {!canSendComms && <span className="text-[11px] opacity-80">🔒</span>}
          </button>

          <button
            className={[
              "h-9 rounded-md px-3 text-sm border border-border/15 inline-flex items-center gap-2",
              canSendComms
                ? "text-text-primary hover:bg-secondary/30 cursor-pointer"
                : "text-text-secondary opacity-60 cursor-not-allowed",
            ].join(" ")}
            onClick={() => gateComms("Push", () => setShowPushModal(true))}
            disabled={rows.length === 0}
            title={!canSendComms ? "Διαθέσιμο από Starter" : "Αποστολή Push"}
          >
            <BellDot className="h-4 w-4" />
            Αποστολή Push
            {!canSendComms && <span className="text-[11px] opacity-80">🔒</span>}
          </button>



          {selectedIds.length > 0 && (
            <div className="text-xs text-text-secondary">
              Επιλεγμένα μέλη:{' '}
              <span className="font-semibold">{selectedIds.length}</span>{' '}
              <button
                type="button"
                className="underline ml-1"
                onClick={clearSelection}
              >
                (καθαρισμός)
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            ref={colsBtnRef}
            type="button"
            className="h-9 rounded-md px-3 text-sm border border-border/15 text-text-primary hover:bg-secondary/30 inline-flex items-center gap-2 cursor-pointer"
            onClick={() => setShowCols((s) => !s)}
          >
            <Eye className="h-4 w-4" />
            Στήλες
          </button>

          {showCols && (
            <div
              ref={colsPanelRef}
              className="
                  fixed z-50 w-72
                  rounded-xl border border-border/15
                  bg-secondary-background/95 backdrop-blur
                  shadow-2xl shadow-black/20
                  p-3
                "
              style={{ left: dropdownPos.left, top: dropdownPos.top }}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-sm font-semibold text-text-primary">Στήλες πίνακα</div>
                <button
                  className="text-xs px-2 py-1 rounded-md border border-border/15 hover:bg-secondary/30 opacity-90"
                  onClick={() => setShowCols(false)}
                  type="button"
                >
                  ✕
                </button>
              </div>

              <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-text-secondary">Επιλογή πεδίων</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-md border border-border/15 hover:bg-secondary/30"
                    onClick={setAllCols}
                  >
                    όλα
                  </button>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-md border border-border/15 hover:bg-secondary/30"
                    onClick={resetCols}
                  >
                    reset
                  </button>
                </div>
              </div>

              <div className="max-h-72 overflow-auto pr-1 space-y-1">
                {ALL_COLUMNS.map((c) => (
                  <label
                    key={c.key}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-secondary/25 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={isColVisible(c.key)}
                      onChange={() => toggleCol(c.key)}
                    />
                    <span className="text-sm text-text-primary">{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className='mb-2 flex gap-2'>
        <button
          className={[
            "h-9 rounded-md px-3 text-sm border border-border/15 inline-flex items-center gap-2",
            canExport
              ? "text-text-primary hover:bg-[#26a347] hover:border-white/15 hover:text-white cursor-pointer"
              : "text-text-secondary opacity-60 cursor-not-allowed",
          ].join(" ")}
          onClick={() => gateExport("Excel", () => exportExcel())}
          disabled={loading || rows.length === 0}
          title={!canExport ? "Διαθέσιμο μόνο στο Pro" : "Export Excel"}
        >
          <Sheet className="h-4 w-4" />
          Εξαγωγή Excel
          {!canExport && <span className="text-[11px] opacity-80">🔒</span>}
        </button>

        <button
          className={[
            "h-9 rounded-md px-3 text-sm border border-border/15 inline-flex items-center gap-2",
            canExport
              ? "text-text-primary hover:bg-[#db2525] hover:border-white/15 hover:text-white cursor-pointer"
              : "text-text-secondary opacity-60 cursor-not-allowed",
          ].join(" ")}
          onClick={() => gateExport("PDF", () => exportPdf())}
          disabled={loading || rows.length === 0}
          title={!canExport ? "Διαθέσιμο μόνο στο Pro" : "Export PDF"}
        >
          <FileText className="h-4 w-4" />
          Εξαγωγή PDF
          {!canExport && <span className="text-[11px] opacity-80">🔒</span>}
        </button>
      </div>

      <div className="rounded-md border border-border/10 overflow-hidden">
        {/* DESKTOP / TABLE VIEW */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-180 text-sm">
              <thead className="bg-secondary-background/60">
                <tr className="text-left">
                  <Th className="w-10">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={allPageSelected}
                      onChange={toggleSelectPage}
                    />
                  </Th>

                  <Th>Όνομα</Th>
                  <Th>Τηλέφωνο</Th>

                  {isColVisible('email') && <Th>Email</Th>}
                  {isColVisible('birth_date') && <Th>Ημ. Γέννησης</Th>}
                  {isColVisible('address') && <Th>Διεύθυνση</Th>}
                  {isColVisible('afm') && <Th>ΑΦΜ</Th>}
                  {isColVisible('total_debt') && <Th>Συνολική Οφειλή</Th>}
                  {isColVisible('max_dropin_debt') && <Th>Max Drop-in Οφειλή</Th>}
                  {isColVisible('notes') && <Th>Σημειώσεις</Th>}
                  {isColVisible('created_at') && <Th>Ημ. Δημιουργίας</Th>}

                  <Th className="text-right pr-3">Ενέργειες</Th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="px-3 py-4 opacity-60" colSpan={desktopColCount}>Loading…</td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 opacity-60" colSpan={desktopColCount}>
                      No members
                    </td>
                  </tr>
                )}
                {!loading &&
                  filtered.length > 0 &&
                  paginated.map((m) => {
                    const membershipDebt = membershipDebts[m.id] ?? 0;
                    const dropinDebt = dropinDebts[m.id] ?? 0;
                    const totalDebt = membershipDebt + dropinDebt;

                    return (
                      <tr
                        key={m.id}
                        className="border-t border-border/5 hover:bg-secondary/10"
                      >
                        <Td>
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={selectedIds.includes(m.id)}
                            onChange={() => toggleSelect(m.id)}
                          />
                        </Td>
                        <Td>{m.full_name ?? '—'}</Td>
                        <Td>{m.phone ?? '—'}</Td>

                        {isColVisible('email') && <Td>{m.email ?? '—'}</Td>}
                        {isColVisible('birth_date') && <Td>{formatDateDMY(m.birth_date)}</Td>}
                        {isColVisible('address') && <Td>{m.address ?? '—'}</Td>}
                        {isColVisible('afm') && <Td>{m.afm ?? '—'}</Td>}

                        {isColVisible('total_debt') && (
                          <Td>
                            {totalDebt !== 0 ? (
                              <span className="text-warning font-semibold">
                                {formatMoney(totalDebt)}
                              </span>
                            ) : (
                              <span className="text-success text-xs uppercase tracking-wide font-semibold">
                                0
                              </span>
                            )}
                          </Td>
                        )}

                        {isColVisible('max_dropin_debt') && (
                          <Td>
                            {m.max_dropin_debt != null ? formatMoney(Number(m.max_dropin_debt)) : '—'}
                          </Td>
                        )}
                        {isColVisible('notes') && (
                          <Td className="max-w-62.5 truncate">
                            {m.notes ?? '—'}
                          </Td>
                        )}

                        {isColVisible('created_at') && <Td>{formatDateDMY(m.created_at)}</Td>}
                        <Td className="text-right space-x-1 pr-3">
                          <IconButton
                            icon={Eye}
                            label="Λεπτομέρειες"
                            onClick={() =>
                              navigate(`/members/${m.id}`, {
                                state: { member: m, tenantId, subscriptionInactive },
                              })
                            }
                          />
                          <IconButton
                            icon={Pencil}
                            label="Επεξεργασία"
                            onClick={() => requireActiveSubscription(() => setEditRow(m))}
                          />
                          <DeleteButton
                            id={m.id}
                            onDeleted={load}
                            guard={() => {
                              if (subscriptionInactive) {
                                setShowSubModal(true);
                                return false;
                              }
                              return true;
                            }}
                          />
                        </Td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* MOBILE / CARD VIEW */}
        <div className="md:hidden">
          {loading && (
            <div className="px-3 py-4 text-sm opacity-60">Loading…</div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="px-3 py-4 text-sm opacity-60">No members</div>
          )}

          {!loading &&
            filtered.length > 0 &&
            paginated.map((m) => {
              const membershipDebt = membershipDebts[m.id] ?? 0;
              const dropinDebt = dropinDebts[m.id] ?? 0;
              const totalDebt = membershipDebt + dropinDebt;

              return (
                <div
                  key={m.id}
                  className="border-t border-border/10 bg-secondary/5 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 accent-primary"
                        checked={selectedIds.includes(m.id)}
                        onChange={() => toggleSelect(m.id)}
                      />
                      <div>
                        <div className="font-medium text-sm">
                          {m.full_name ?? '—'}
                        </div>
                        <div className="text-xs text-text-secondary">
                          {m.phone ?? '—'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <IconButton
                        icon={Eye}
                        label="Λεπτομέρειες"
                        onClick={() =>
                          navigate(`/members/${m.id}`, {
                            state: { member: m, tenantId, subscriptionInactive },
                          })
                        }
                      />
                      <IconButton
                        icon={Pencil}
                        label="Επεξεργασία"
                        onClick={() => requireActiveSubscription(() => setEditRow(m))}
                      />
                      <DeleteButton
                        id={m.id}
                        onDeleted={load}
                        guard={() => {
                          if (subscriptionInactive) {
                            setShowSubModal(true);
                            return false;
                          }
                          return true;
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-2 space-y-1 text-xs">
                    {isColVisible('total_debt') && (
                      <div>
                        <span className="opacity-70">Συνολική Οφειλή: </span>
                        {totalDebt !== 0 ? (
                          <span className="text-accent font-medium">{formatMoney(totalDebt)}</span>
                        ) : (
                          <span className="text-emerald-500 uppercase tracking-wide">0</span>
                        )}
                      </div>
                    )}

                    {isColVisible('max_dropin_debt') && (
                      <div>
                        <span className="opacity-70">Max Drop-in Οφειλή: </span>
                        {m.max_dropin_debt != null ? formatMoney(Number(m.max_dropin_debt)) : '—'}
                      </div>
                    )}

                    {isColVisible('email') && (
                      <div>
                        <span className="opacity-70">Email: </span>
                        {m.email ?? '—'}
                      </div>
                    )}

                    {isColVisible('birth_date') && (
                      <div>
                        <span className="opacity-70">Ημ. Γέννησης: </span>
                        {formatDateDMY(m.birth_date)}
                      </div>
                    )}

                    {isColVisible('address') && (
                      <div>
                        <span className="opacity-70">Διεύθυνση: </span>
                        {m.address ?? '—'}
                      </div>
                    )}

                    {isColVisible('afm') && (
                      <div>
                        <span className="opacity-70">ΑΦΜ: </span>
                        {m.afm ?? '—'}
                      </div>
                    )}

                    {isColVisible('created_at') && (
                      <div className="opacity-70">Δημιουργήθηκε: {formatDateDMY(m.created_at)}</div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Pagination footer */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-3 py-2 text-xs text-text-secondary border-t border-border/10">
            <div>
              Εμφάνιση <span className="font-semibold">{startIdx}</span>
              {filtered.length > 0 && (
                <>
                  –<span className="font-semibold">{endIdx}</span>
                </>
              )}{' '}
              από <span className="font-semibold">{filtered.length}</span>
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

      {showCreate && profile?.tenant_id && (
        <CreateMemberModal
          tenantId={profile.tenant_id}
          onClose={() => {
            setShowCreate(false);
            load();
          }}
          toast={pushToast}
        />
      )}
      {editRow && (
        <EditMemberModal
          row={editRow}
          onClose={() => {
            setEditRow(null);
            load();
          }}
        />
      )}

      {/* Details modal (Details + History + Economic tabs) */}
      {/* {detailsMember && profile?.tenant_id && (
        <MemberDetailsModal
          member={detailsMember}
          tenantId={profile.tenant_id}
          onClose={() => setDetailsMember(null)}
          subscriptionInactive={subscriptionInactive}
          onSubscriptionBlocked={() => setShowSubModal(true)}
        />
      )} */}

      {/* Send Email modal (separate component file) */}
      {showEmailModal && (
        <SendMemberEmailModal
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          tenantName={tenantNameFromProfile}
          tenantId={profile?.tenant_id ?? null}
          memberIds={selectedIds}
          selectedMembers={selectedMembers.map((m) => ({
            id: m.id,
            full_name: m.full_name,
            email: m.email,
          }))}
        />
      )}

      {showPushModal && (
        <SendMemberPushModal
          isOpen={showPushModal}
          onClose={() => setShowPushModal(false)}
          tenantName={tenantNameFromProfile}
          tenantId={profile?.tenant_id ?? null}
          selectedMembers={selectedMembers.map((m) => ({
            id: m.id,
            full_name: m.full_name,
            email: m.email,
            user_id: m.id, // 👈 ΠΡΟΣΟΧΗ: φρόντισε να υπάρχει αυτό στο m
          }))}
        />
      )}

      <SubscriptionRequiredModal
        open={showSubModal}
        onClose={() => setShowSubModal(false)}
      />

    </div>
  );
}

function Th({ children, className = '' }: any) {
  return <th className={`px-3 py-2 font-semibold ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: any) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}

function DeleteButton({
  id,
  onDeleted,
  guard,
}: {
  id: string;
  onDeleted: () => void;
  guard?: () => boolean;
}) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (guard && !guard()) return; // ✅ subscription modal handled by parent
    if (
      !confirm(
        'Διαγραφή αυτού του μέλους; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.',
      )
    )
      return;
    setBusy(true);
    await supabase.functions.invoke('member-delete', { body: { id } });
    setBusy(false);
    onDeleted();
  };

  return (
    <button
      type="button"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/60 text-red-400 hover:bg-red-500/10 disabled:opacity-50 ml-1"
      onClick={onClick}
      disabled={busy}
      aria-label="Διαγραφή μέλους"
      title="Διαγραφή μέλους"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
      <span className="sr-only">Διαγραφή</span>
    </button>
  );
}


async function readEdgeErrorPayload(err: any): Promise<any | null> {
  const res: Response | undefined = err?.context;
  if (!res) return null;

  // Try JSON first
  try {
    return await res.clone().json();
  } catch {
    // Fallback: text
    try {
      const txt = await res.clone().text();
      return txt ? { error: txt } : null;
    } catch {
      return null;
    }
  }
}

/* CREATE */
function CreateMemberModal({
  tenantId,
  onClose,
  toast,
}: {
  tenantId: string;
  onClose: () => void;
  toast: (t: Omit<Toast, "id">, ms?: number) => void;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [address, setAddress] = useState('');
  const [afm, setAfm] = useState('');
  const [maxDropinDebt, setMaxDropinDebt] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const navigate = useNavigate();

  const submit = async () => {
    if (!email || !password) return;

    setBusy(true);

    const { data, error } = await supabase.functions.invoke("member-create", {
      body: {
        email,
        password,
        full_name: fullName,
        phone,
        tenant_id: tenantId,
        birth_date: birthDate ? dateToISODate(birthDate) : null,
        address: address || null,
        afm: afm || null,
        max_dropin_debt: maxDropinDebt ? Number(maxDropinDebt) : null,
        notes: notes || null,
      },
    });

    setBusy(false);

    // ✅ Non-2xx comes here as `error`
    if (error) {
      const payload = await readEdgeErrorPayload(error);
      const code = payload?.error;

      if (code === "PLAN_LIMIT:MAX_MEMBERS_REACHED") {
        const limit = payload?.limit;
        const current = payload?.current;

        toast({
          variant: "error",
          title: "Έφτασες το όριο του πλάνου σου",
          message:
            limit != null && current != null
              ? `Έχεις ήδη ${current}/${limit}.`
              : "Έχεις φτάσει το όριο του πλάνου σου.",
          actionLabel: "Αναβάθμιση",
          onAction: () => navigate("/settings/billing"),
        });
        return; // keep modal open
      }

      // Other subscription errors etc.
      toast({
        variant: "error",
        title: "Αποτυχία δημιουργίας μέλους",
        message: code ?? error.message ?? "Unknown error",
      });
      return;
    }

    // ✅ Success path (2xx)
    const code = (data as any)?.error;
    if (code) {
      toast({ variant: "error", title: "Αποτυχία", message: String(code) });
      return;
    }

    toast({
      variant: "success",
      title: "Το μέλος δημιουργήθηκε",
      message: "Προστέθηκε επιτυχώς στη λίστα μελών.",
    });

    onClose();
  };

  return (
    <Modal onClose={onClose} title="Νέο Μέλος">
      <FormRow label="Όνομα *">
        <input
          className="input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </FormRow>
      <FormRow label="Email *">
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormRow>
      <FormRow label="Τηλέφωνο">
        <input
          className="input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </FormRow>
      <FormRow label="Ημ. γέννησης">
        <DatePicker
          selected={birthDate}
          onChange={(date) => setBirthDate(date)}
          dateFormat="dd/MM/yyyy"
          locale={el}
          placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
          className="input"
          wrapperClassName="w-full"
          showMonthDropdown
          showYearDropdown
          dropdownMode="select"         // dropdown αντί για scroll
          scrollableYearDropdown        // (προαιρετικό) κάνει το year list scrollable
          yearDropdownItemNumber={80}   // πόσα χρόνια να δείχνει στο dropdown
        />
      </FormRow>
      <FormRow label="Διεύθυνση">
        <input
          className="input"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </FormRow>
      <FormRow label="ΑΦΜ">
        <input
          className="input"
          value={afm}
          onChange={(e) => setAfm(e.target.value)}
        />
      </FormRow>
      <FormRow label="Μέγιστο χρέος drop-in">
        <input
          className="input"
          type="number"
          step="0.01"
          value={maxDropinDebt}
          onChange={(e) => setMaxDropinDebt(e.target.value)}
        />
      </FormRow>
      <FormRow label="Σημειώσεις">
        <textarea
          className="input min-h-20 resize-y"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </FormRow>
      <FormRow label="Password *">
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormRow>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Ακύρωση
        </button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Δημιουργία...' : 'Δημιουργία'}
        </button>
      </div>
    </Modal>

  );
}


/* EDIT */
function EditMemberModal({
  row,
  onClose,
}: {
  row: Member;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState(row.full_name ?? '');
  const [phone, setPhone] = useState(row.phone ?? '');
  const [birthDate, setBirthDate] = useState<Date | null>(
    parseISODateToLocal(row.birth_date),
  );
  const [address, setAddress] = useState(row.address ?? '');
  const [afm, setAfm] = useState(row.afm ?? '');
  const [maxDropinDebt, setMaxDropinDebt] = useState(
    row.max_dropin_debt != null ? String(row.max_dropin_debt) : '',
  );
  const [notes, setNotes] = useState(row.notes ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await supabase.functions.invoke('member-update', {
      body: {
        id: row.id,
        full_name: fullName,
        phone,
        password: password || undefined,
        birth_date: birthDate ? dateToISODate(birthDate) : null,
        address: address || null,
        afm: afm || null,
        max_dropin_debt: maxDropinDebt ? Number(maxDropinDebt) : null,
        notes: notes || null,
      },
    });
    setBusy(false);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Επεξεργασία Μέλους">
      <FormRow label="Όνομα">
        <input
          className="input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </FormRow>
      <FormRow label="Τηλέφωνο">
        <input
          className="input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </FormRow>
      <FormRow label="Ημ. γέννησης">
        <DatePicker
          selected={birthDate}
          onChange={(date) => setBirthDate(date)}
          dateFormat="dd/MM/yyyy"
          locale={el}
          placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
          className="input"
          wrapperClassName="w-full"
          // 🔽 extra options για εύκολη επιλογή έτους
          showMonthDropdown
          showYearDropdown
          dropdownMode="select"         // dropdown αντί για scroll
          scrollableYearDropdown        // (προαιρετικό) κάνει το year list scrollable
          yearDropdownItemNumber={80}   // πόσα χρόνια να δείχνει στο dropdown
        />
      </FormRow>

      <FormRow label="Διεύθυνση">
        <input
          className="input"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </FormRow>
      <FormRow label="ΑΦΜ">
        <input
          className="input"
          value={afm}
          onChange={(e) => setAfm(e.target.value)}
        />
      </FormRow>
      <FormRow label="Μέγιστο χρέος drop-in">
        <input
          className="input"
          type="number"
          step="0.01"
          value={maxDropinDebt}
          onChange={(e) => setMaxDropinDebt(e.target.value)}
        />
      </FormRow>
      <FormRow label="Σημειώσεις">
        <textarea
          className="input min-h-20 resize-y"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </FormRow>

      <FormRow label="Νέο password (προαιρετικό)">
        <input
          className="input"
          type="password"
          placeholder="Αφήστε κενό για να διατηρήσετε το τρέχον"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormRow>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Ακύρωση
        </button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Αποθήκευση...' : 'Αποθήκευση'}
        </button>
      </div>
    </Modal>
  );
}

/* small UI helpers */
function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-md border border-border/10 bg-secondary-background text-text-primary shadow-xl">
        <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 hover:bg-border/5"
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

function IconButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/10 hover:bg-secondary/20"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
      <span className="sr-only">{label}</span>
    </button>
  );
}