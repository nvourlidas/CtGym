import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import type { LucideIcon } from 'lucide-react';
import {
  Pencil, Trash2, Plus, Loader2, Search, ChevronLeft, ChevronRight,
  ChevronDown, AlertTriangle, X, Euro, CalendarDays,
  Layers, Check, CreditCard,
} from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';
import { useNavigate } from 'react-router-dom';

type PlanKind = 'duration' | 'sessions' | 'hybrid';
type Category = { id: string; name: string; color: string | null };
type Plan = {
  id: string; tenant_id: string; name: string; description: string | null;
  price: number | null; plan_kind: PlanKind; duration_days: number | null;
  session_credits: number | null; created_at: string; categories: Category[];
};
type Toast = {
  id: string; title: string; message?: string; variant?: 'error' | 'success' | 'info';
  actionLabel?: string; onAction?: () => void;
};

async function readEdgeErrorPayload(err: any): Promise<any | null> {
  const res: Response | undefined = err?.context;
  if (!res) return null;
  try { return await res.clone().json(); }
  catch { try { const t = await res.clone().text(); return t ? { error: t } : null; } catch { return null; } }
}

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);
}
function formatDateDMY(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}

const PLAN_KIND_LABEL: Record<PlanKind, string> = { duration: 'Διάρκεια', sessions: 'Συνεδρίες', hybrid: 'Υβριδικό' };
const PLAN_KIND_COLOR: Record<PlanKind, string> = {
  duration:  'border-sky-500/40 bg-sky-500/10 text-sky-400',
  sessions:  'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  hybrid:    'border-purple-500/40 bg-purple-500/10 text-purple-400',
};

// ── Shared UI ─────────────────────────────────────────────────────────────

function ToastHost({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  return (
    <div className="fixed right-4 top-4 z-100 flex w-88 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => {
        const isErr = t.variant === 'error';
        const isOk  = t.variant === 'success';
        return (
          <div key={t.id} className="rounded-2xl border border-border/15 bg-secondary-background/95 backdrop-blur shadow-2xl overflow-hidden" style={{ animation: 'toastIn 0.25s ease' }}>
            <div className={['h-0.75', isErr ? 'bg-danger' : isOk ? 'bg-success' : 'bg-primary'].join(' ')} />
            <div className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className={['text-sm font-bold', isErr ? 'text-danger' : isOk ? 'text-success' : 'text-text-primary'].join(' ')}>{t.title}</div>
                {t.message && <div className="mt-0.5 text-xs text-text-secondary">{t.message}</div>}
                {t.actionLabel && t.onAction && (
                  <button onClick={t.onAction} className="mt-2 h-7 px-3 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-all cursor-pointer">{t.actionLabel}</button>
                )}
              </div>
              <button onClick={() => dismiss(t.id)} className="p-1 rounded-lg border border-border/10 hover:bg-secondary/30 text-text-secondary cursor-pointer shrink-0"><X className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        );
      })}
      <style>{`@keyframes toastIn { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:none; } }`}</style>
    </div>
  );
}

function ModalShell({ title, icon, onClose, children, footer }: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-2xl overflow-hidden" style={{ animation: 'planModalIn 0.2s ease' }}>
        <div className="h-0.75 bg-linear-to-r from-primary/0 via-primary to-primary/0" />
        <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
              {icon ?? <CreditCard className="h-4 w-4 text-primary" />}
            </div>
            <h2 className="font-black text-text-primary tracking-tight">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl border border-border/10 hover:bg-secondary/30 text-text-secondary hover:text-text-primary transition-all cursor-pointer"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 max-h-[75vh] overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-border/10 flex justify-end gap-2">{footer}</div>}
      </div>
      <style>{`@keyframes planModalIn { from { opacity:0; transform:translateY(16px) scale(0.98); } to { opacity:1; transform:none; } }`}</style>
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

function StyledInput({ value, onChange, type = 'text', placeholder, min, step, className = '' }: any) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} min={min} step={step}
      className={`w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary ${className}`}
    />
  );
}

function StyledSelect({ value, onChange, children, className = '' }: any) {
  return (
    <div className={`relative ${className}`}>
      <select value={value} onChange={onChange} className="w-full h-9 pl-3.5 pr-9 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary appearance-none outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer">
        {children}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
    </div>
  );
}

function PrimaryBtn({ busy, busyLabel, label, onClick, disabled }: any) {
  return (
    <button onClick={onClick} disabled={busy || disabled} className="group relative inline-flex items-center gap-2 h-9 px-5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px disabled:opacity-50 disabled:translate-y-0 transition-all cursor-pointer overflow-hidden">
      <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
      {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /><span className="relative z-10">{busyLabel}</span></> : <span className="relative z-10">{label}</span>}
    </button>
  );
}

function IconButton({ icon: Icon, label, onClick, disabled }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-border/15 text-text-secondary hover:text-text-primary hover:bg-secondary/30 disabled:opacity-30 transition-all cursor-pointer"
      aria-label={label} title={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function DeleteButton({ id, onDeleted, guard }: { id: string; onDeleted: () => void; guard: () => boolean }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (guard && !guard()) return;
    if (!confirm('Διαγραφή αυτού του πλάνου; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.')) return;
    setBusy(true);
    const res = await supabase.functions.invoke('plan-delete', { body: { id } });
    setBusy(false);
    if (res.error || (res.data as any)?.error) { alert(res.error?.message ?? (res.data as any)?.error ?? 'Delete failed'); }
    else { onDeleted(); }
  };
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-danger/20 text-danger hover:bg-danger/10 disabled:opacity-40 transition-all cursor-pointer"
      aria-label="Διαγραφή πλάνου"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}

function CategoryChip({ cat }: { cat: Category }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border border-border/15 bg-secondary/20">
      {cat.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />}
      {cat.name}
    </span>
  );
}

// ── Plan form shared fields ───────────────────────────────────────────────

function PlanFormFields({ name, setName, price, setPrice, planKind, setPlanKind, durationDays, setDurationDays, sessionCredits, setSessionCredits, description, setDescription, categoryIds, setCategoryIds, categories }: any) {
  const toggleCat = (id: string) => setCategoryIds((prev: string[]) => prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id]);
  return (
    <>
      <FormField label="Ονομασία *">
        <StyledInput value={name} onChange={(e: any) => setName(e.target.value)} placeholder="π.χ. Μηνιαία Συνδρομή" />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Τιμή (€)">
          <div className="relative">
            <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input type="number" step="0.01" value={price} onChange={(e: any) => setPrice(Number(e.target.value))}
              className="w-full h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>
        </FormField>
        <FormField label="Τύπος Πλάνου">
          <StyledSelect value={planKind} onChange={(e: any) => setPlanKind(e.target.value)}>
            <option value="duration">Διάρκεια (Μέρες)</option>
            <option value="sessions">Αριθμός συνεδριών</option>
            <option value="hybrid">Και τα δύο</option>
          </StyledSelect>
        </FormField>
      </div>

      {(planKind === 'duration' || planKind === 'hybrid') && (
        <FormField label="Διάρκεια (Μέρες)">
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input type="number" min={0} value={durationDays} onChange={(e: any) => setDurationDays(Number(e.target.value))}
              className="w-full h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>
        </FormField>
      )}
      {(planKind === 'sessions' || planKind === 'hybrid') && (
        <FormField label="Αριθμός συνεδριών">
          <div className="relative">
            <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input type="number" min={0} value={sessionCredits} onChange={(e: any) => setSessionCredits(Number(e.target.value))}
              className="w-full h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>
        </FormField>
      )}

      <FormField label="Κατηγορίες">
        {categories.length === 0 ? (
          <p className="text-xs text-text-secondary">Καμία κατηγορία διαθέσιμη.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((c: Category) => {
              const checked = categoryIds.includes(c.id);
              return (
                <button key={c.id} type="button" onClick={() => toggleCat(c.id)}
                  className={['inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition-all cursor-pointer', checked ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/15 text-text-secondary hover:border-primary/25 hover:text-text-primary'].join(' ')}
                >
                  {checked && <Check className="h-3 w-3 shrink-0" />}
                  {c.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />}
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
      </FormField>

      <FormField label="Περιγραφή">
        <textarea value={description} onChange={(e: any) => setDescription(e.target.value)} rows={3}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all resize-none placeholder:text-text-secondary"
          placeholder="Προαιρετική περιγραφή πλάνου…"
        />
      </FormField>
    </>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────

function CreatePlanModal({ tenantId, categories, onClose, toast }: { tenantId: string; categories: Category[]; toast: (t: Omit<Toast,'id'>, ms?: number) => void; onClose: () => void }) {
  const [name, setName]                   = useState('');
  const [price, setPrice]                 = useState<number>(0);
  const [planKind, setPlanKind]           = useState<PlanKind>('duration');
  const [durationDays, setDurationDays]   = useState<number>(0);
  const [sessionCredits, setSessionCredits] = useState<number>(0);
  const [description, setDescription]     = useState('');
  const [categoryIds, setCategoryIds]     = useState<string[]>([]);
  const [busy, setBusy]                   = useState(false);
  const navigate = useNavigate();

  const submit = async () => {
    if (!name) return;
    if ((durationDays || 0) <= 0 && (sessionCredits || 0) <= 0) {
      toast({ variant:'error', title:'Λείπουν οφέλη πλάνου', message:'Δώσε ημέρες διάρκειας ή/και αριθμό συνεδριών.' }); return;
    }
    setBusy(true);
    const res = await supabase.functions.invoke('plan-create', { body: { tenant_id:tenantId, name, price, plan_kind:planKind, duration_days:durationDays||null, session_credits:sessionCredits||null, description, category_ids:categoryIds } });
    setBusy(false);
    if (res.error) {
      const payload = await readEdgeErrorPayload(res.error);
      const code    = payload?.error;
      if (code === 'PLAN_LIMIT:MAX_MEMBERSHIP_PLANS_REACHED') {
        toast({ variant:'error', title:'Έφτασες το όριο του πλάνου σου', message:payload?.limit!=null?`Έχεις ήδη ${payload.current}/${payload.limit}.`:'Έχεις φτάσει το όριο.', actionLabel:'Αναβάθμιση', onAction:()=>navigate('/settings/billing') }); return;
      }
      toast({ variant:'error', title:'Αποτυχία δημιουργίας πλάνου', message:code??res.error.message??'Unknown error' }); return;
    }
    const code = (res.data as any)?.error;
    if (code) { toast({ variant:'error', title:'Αποτυχία δημιουργίας πλάνου', message:String(code) }); return; }
    toast({ variant:'success', title:'Το πλάνο δημιουργήθηκε', message:'Προστέθηκε επιτυχώς.' });
    onClose();
  };

  return (
    <ModalShell title="Νέο Πλάνο Συνδρομής" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Κλείσιμο</button>
        <PrimaryBtn busy={busy} busyLabel="Δημιουργία…" label="Δημιουργία" onClick={submit} />
      </>}
    >
      <PlanFormFields {...{ name, setName, price, setPrice, planKind, setPlanKind, durationDays, setDurationDays, sessionCredits, setSessionCredits, description, setDescription, categoryIds, setCategoryIds, categories }} />
    </ModalShell>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────

function EditPlanModal({ row, categories, onClose, toast }: { row: Plan; categories: Category[]; toast: (t: Omit<Toast,'id'>, ms?: number) => void; onClose: () => void }) {
  const [name, setName]                   = useState(row.name);
  const [price, setPrice]                 = useState<number>(row.price ?? 0);
  const [planKind, setPlanKind]           = useState<PlanKind>(row.plan_kind);
  const [durationDays, setDurationDays]   = useState<number>(row.duration_days ?? 0);
  const [sessionCredits, setSessionCredits] = useState<number>(row.session_credits ?? 0);
  const [description, setDescription]     = useState(row.description ?? '');
  const [categoryIds, setCategoryIds]     = useState<string[]>((row.categories ?? []).map((c) => c.id));
  const [busy, setBusy]                   = useState(false);

  const submit = async () => {
    if (!name) return;
    if ((durationDays || 0) <= 0 && (sessionCredits || 0) <= 0) { alert('Παρέχετε ημέρες διάρκειας ή/και αριθμό συνεδριών.'); return; }
    setBusy(true);
    const res = await supabase.functions.invoke('plan-update', { body: { id:row.id, name, price, plan_kind:planKind, duration_days:durationDays||null, session_credits:sessionCredits||null, description, category_ids:categoryIds } });
    setBusy(false);
    if (res.error) {
      const payload = await readEdgeErrorPayload(res.error);
      toast({ variant:'error', title:'Αποτυχία αποθήκευσης', message:payload?.error??res.error.message??'Unknown error' }); return;
    }
    const code = (res.data as any)?.error;
    if (code) { toast({ variant:'error', title:'Αποτυχία αποθήκευσης', message:String(code) }); return; }
    toast({ variant:'success', title:'Αποθηκεύτηκε', message:'Οι αλλαγές αποθηκεύτηκαν.' });
    onClose();
  };

  return (
    <ModalShell title="Επεξεργασία Πλάνου" icon={<Pencil className="h-4 w-4 text-primary" />} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Κλείσιμο</button>
        <PrimaryBtn busy={busy} busyLabel="Αποθήκευση…" label="Αποθήκευση" onClick={submit} />
      </>}
    >
      <PlanFormFields {...{ name, setName, price, setPrice, planKind, setPlanKind, durationDays, setDurationDays, sessionCredits, setSessionCredits, description, setDescription, categoryIds, setCategoryIds, categories }} />
    </ModalShell>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

function renderBenefits(p: Plan) {
  return [p.duration_days ? `${p.duration_days} μέρες` : null, p.session_credits ? `${p.session_credits} συνεδρίες` : null].filter(Boolean).join(' • ') || '—';
}

export default function Plans() {
  const { profile, subscription } = useAuth();
  const [showSubModal, setShowSubModal] = useState(false);
  const [rows, setRows]             = useState<Plan[]>([]);
  const [loading, setLoading]       = useState(true);
  const [q, setQ]                   = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow]       = useState<Plan | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(10);
  const [toasts, setToasts]         = useState<Toast[]>([]);

  const subscriptionInactive = !subscription?.is_active;
  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) { setShowSubModal(true); return; }
    action();
  }

  const pushToast = (t: Omit<Toast,'id'>, ms = 4500) => {
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
  const paginated = useMemo(() => filtered.slice((page-1)*pageSize, page*pageSize), [filtered, page, pageSize]);
  const startIdx  = filtered.length === 0 ? 0 : (page-1)*pageSize+1;
  const endIdx    = Math.min(filtered.length, page*pageSize);

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

      {/* Table card */}
      <div className="rounded-2xl border border-border/10 bg-secondary-background overflow-hidden shadow-sm">
        {loading && <div className="flex items-center justify-center gap-2 py-10 text-text-secondary text-sm"><Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…</div>}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-14 text-text-secondary">
            <CreditCard className="h-8 w-8 opacity-25" />
            <span className="text-sm">Κανένα πλάνο</span>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border/5">
              {paginated.map((p) => (
                <div key={p.id} className="p-4 hover:bg-secondary/5 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-text-primary truncate">{p.name}</div>
                      {p.price != null && <div className="text-sm font-bold text-primary mt-0.5">{formatMoney(p.price)}</div>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-lg border ${PLAN_KIND_COLOR[p.plan_kind]}`}>{PLAN_KIND_LABEL[p.plan_kind]}</span>
                      <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => requireActiveSubscription(() => setEditRow(p))} />
                      <DeleteButton id={p.id} onDeleted={load} guard={() => { if (subscriptionInactive) { setShowSubModal(true); return false; } return true; }} />
                    </div>
                  </div>
                  {p.description && <p className="mt-2 text-xs text-text-secondary line-clamp-2">{p.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.categories.length > 0 ? p.categories.map((cat) => <CategoryChip key={cat.id} cat={cat} />) : <span className="text-[11px] text-text-secondary opacity-50">Χωρίς κατηγορία</span>}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-text-secondary">
                    <span>Οφέλη: <span className="text-text-primary font-medium">{renderBenefits(p)}</span></span>
                    <span>{formatDateDMY(p.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/10 bg-secondary/5">
                    {['Ονομασία', 'Κατηγορίες', 'Τιμή', 'Τύπος', 'Οφέλη', 'Δημιουργήθηκε', ''].map((h, i) => (
                      <th key={i} className={['px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary', i===6?'text-right':'text-left'].join(' ')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((p) => (
                    <tr key={p.id} className="border-t border-border/5 hover:bg-secondary/5 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-text-primary">{p.name}</div>
                        {p.description && <div className="text-xs text-text-secondary mt-0.5 line-clamp-1 max-w-48">{p.description}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {p.categories.length > 0 ? (
                          <div className="flex flex-wrap gap-1">{p.categories.map((cat) => <CategoryChip key={cat.id} cat={cat} />)}</div>
                        ) : <span className="text-xs text-text-secondary opacity-40">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {p.price != null ? <span className="font-bold text-primary">{formatMoney(p.price)}</span> : <span className="text-xs text-text-secondary opacity-40">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${PLAN_KIND_COLOR[p.plan_kind]}`}>{PLAN_KIND_LABEL[p.plan_kind]}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">{renderBenefits(p)}</td>
                      <td className="px-4 py-3 text-xs text-text-secondary">{formatDateDMY(p.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => requireActiveSubscription(() => setEditRow(p))} />
                          <DeleteButton id={p.id} onDeleted={load} guard={() => { if (subscriptionInactive) { setShowSubModal(true); return false; } return true; }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/10 text-xs text-text-secondary">
              <span><span className="font-bold text-text-primary">{startIdx}–{endIdx}</span> από <span className="font-bold text-text-primary">{filtered.length}</span></span>
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
          </>
        )}
      </div>

      {showCreate && <CreatePlanModal tenantId={profile?.tenant_id!} categories={categories} toast={pushToast} onClose={() => { setShowCreate(false); load(); }} />}
      {editRow    && <EditPlanModal   row={editRow} categories={categories} toast={pushToast} onClose={() => { setEditRow(null); load(); }} />}
      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </div>
  );
}