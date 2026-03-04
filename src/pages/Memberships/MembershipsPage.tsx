import { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import {
  Pencil, Trash2, Loader2, Plus, Search, ChevronLeft, ChevronRight,
  ChevronDown, AlertTriangle, X, Euro, Layers,
  Check, Users, CreditCard,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale/el';

type Member    = { id: string; full_name: string | null; email?: string | null };
type Plan      = { id: string; name: string; plan_kind: 'duration' | 'sessions' | 'hybrid'; duration_days: number | null; session_credits: number | null; price: number | null };
type PlanCategory = { id: string; name: string; color: string | null };
type MembershipRow = {
  id: string; tenant_id: string; user_id: string; plan_id: string | null;
  starts_at: string | null; ends_at: string | null; status: string | null; created_at: string;
  remaining_sessions: number | null; plan_kind: string | null; plan_name: string | null;
  plan_price: number | null; custom_price: number | null; discount_reason?: string | null;
  days_remaining: number | null; debt: number | null;
  plan_categories?: PlanCategory[]; profile?: Member | null;
};

function formatDateDMY(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}
function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, { style:'currency', currency:'EUR', maximumFractionDigits:2 }).format(n);
}
function dateToISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active:    { label:'Ενεργή',      cls:'border-success/40 bg-success/10 text-success' },
  paused:    { label:'Σε παύση',    cls:'border-warning/40 bg-warning/10 text-warning' },
  cancelled: { label:'Ακυρωμένη',  cls:'border-danger/40 bg-danger/10 text-danger' },
  expired:   { label:'Έληξε',       cls:'border-border/30 bg-secondary/20 text-text-secondary' },
};
function getStatus(s?: string | null) { return STATUS_META[(s ?? 'active').toLowerCase()] ?? { label:'Άγνωστη', cls:'border-border/30 bg-secondary/20 text-text-secondary' }; }

// ── Shared UI ─────────────────────────────────────────────────────────────

function ModalShell({ title, icon, onClose, children, footer }: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-2xl overflow-hidden" style={{ animation: 'memberModalIn 0.2s ease' }}>
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
        <div className="p-5 max-h-[78vh] overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-border/10 flex justify-end gap-2">{footer}</div>}
      </div>
      <style>{`@keyframes memberModalIn { from { opacity:0; transform:translateY(16px) scale(0.98); } to { opacity:1; transform:none; } }`}</style>
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

function StyledSelect({ value, onChange, children, disabled }: any) {
  return (
    <div className="relative">
      <select value={value} onChange={onChange} disabled={disabled}
        className="w-full h-9 pl-3.5 pr-9 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary appearance-none outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer disabled:opacity-50"
      >
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
    if (!confirm('Ειστε σίγουρος για τη διαγραφή συνδρομής;')) return;
    setBusy(true);
    const res = await supabase.functions.invoke('membership-delete', { body: { id } });
    setBusy(false);
    if (res.error || (res.data as any)?.error) { alert(res.error?.message ?? (res.data as any)?.error ?? 'Delete failed'); }
    else { onDeleted(); }
  };
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-danger/20 text-danger hover:bg-danger/10 disabled:opacity-40 transition-all cursor-pointer"
      aria-label="Διαγραφή συνδρομής"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}

function CategoryChip({ cat }: { cat: PlanCategory }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border border-border/15 bg-secondary/20">
      {cat.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />}
      {cat.name}
    </span>
  );
}

// Searchable dropdown
function SearchableDropdown({ options, value, onChange, placeholder, disabled }: { options: { id: string; label: string; sublabel?: string }[]; value: string; onChange: (v: string) => void; placeholder: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', h); return () => window.removeEventListener('mousedown', h);
  }, [open]);
  const filtered = options.filter((o) => !search || o.label.toLowerCase().includes(search.toLowerCase()) || (o.sublabel ?? '').toLowerCase().includes(search.toLowerCase()));
  const selected = options.find((o) => o.id === value);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => !disabled && setOpen((v) => !v)} disabled={disabled}
        className="w-full h-9 flex items-center justify-between gap-2 pl-3.5 pr-3 rounded-xl border border-border/15 bg-secondary-background text-sm hover:border-primary/30 disabled:opacity-50 transition-all cursor-pointer"
      >
        <span className={selected ? 'text-text-primary truncate' : 'text-text-secondary truncate'}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={['h-3.5 w-3.5 text-text-secondary transition-transform shrink-0', open?'rotate-180':''].join(' ')} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-border/15 bg-secondary-background shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border/10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary pointer-events-none" />
              <input autoFocus className="w-full h-8 pl-7 pr-3 rounded-lg border border-border/15 bg-secondary/10 text-sm text-text-primary outline-none focus:border-primary/40 transition-all" placeholder="Αναζήτηση…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && <div className="px-3 py-3 text-xs text-text-secondary">Δεν βρέθηκαν αποτελέσματα</div>}
            {filtered.map((o) => (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false); setSearch(''); }}
                className={['w-full flex items-start gap-2 px-3.5 py-2.5 text-sm text-left hover:bg-secondary/20 transition-colors', o.id===value?'bg-primary/8':''].join(' ')}
              >
                {o.id===value && <Check className="h-3 w-3 text-primary mt-0.5 shrink-0" />}
                <div className={o.id===value?'':'pl-5'}>
                  <div className={o.id===value?'text-primary font-semibold':'text-text-primary'}>{o.label}</div>
                  {o.sublabel && <div className="text-[11px] text-text-secondary">{o.sublabel}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────

function CreateMembershipModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [members, setMembers]         = useState<Member[]>([]);
  const [plans, setPlans]             = useState<Plan[]>([]);
  const [userId, setUserId]           = useState('');
  const [planId, setPlanId]           = useState('');
  const [startsAt, setStartsAt]       = useState<Date | null>(new Date());
  const [debt, setDebt]               = useState<number>(0);
  const [customPrice, setCustomPrice] = useState<number | null>(null);
  const [discountReason, setDiscountReason] = useState('');
  const [busy, setBusy]               = useState(false);

  useEffect(() => {
    (async () => {
      const { data: m } = await supabase.from('profiles').select('id,full_name,email').eq('tenant_id',tenantId).eq('role','member').order('full_name');
      setMembers((m as any[]) ?? []);
      const { data: p } = await supabase.from('membership_plans').select('id,name,plan_kind,duration_days,session_credits,price').eq('tenant_id',tenantId).order('created_at',{ascending:false});
      setPlans((p as any[]) ?? []);
    })();
  }, [tenantId]);

  const selectedPlan = useMemo(() => plans.find((p) => p.id === planId) ?? null, [plans, planId]);
  const basePrice    = selectedPlan?.price ?? null;
  const effectivePrice = customPrice != null ? customPrice : basePrice;
  const discount     = basePrice != null && effectivePrice != null ? basePrice - effectivePrice : null;

  const memberOptions = useMemo(() => members.map((m) => ({ id:m.id, label:m.full_name||m.id, sublabel:m.email??undefined })), [members]);
  const planLabel = (p: Plan) => {
    const parts: string[] = [];
    if (p.duration_days) parts.push(`${p.duration_days} μέρες`);
    if (p.session_credits) parts.push(`${p.session_credits} συνεδρίες`);
    if (p.price != null) parts.push(formatMoney(p.price));
    return `${p.name}${parts.length?' · '+parts.join(' • '):''}`;
  };
  const planOptions = useMemo(() => plans.map((p) => ({ id:p.id, label:planLabel(p) })), [plans]);

  const submit = async () => {
    if (!userId || !planId) return;
    setBusy(true);
    const res = await supabase.functions.invoke('membership-create', { body: { tenant_id:tenantId, user_id:userId, plan_id:planId, starts_at:startsAt?dateToISODate(startsAt):null, debt:Number.isFinite(debt)?debt:0, custom_price:customPrice, discount_reason:discountReason||null } });
    setBusy(false);
    if (res.error || (res.data as any)?.error) { alert(res.error?.message ?? (res.data as any)?.error ?? 'Create failed'); return; }
    onClose();
  };

  return (
    <ModalShell title="Νέα Συνδρομή" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Κλείσιμο</button>
        <PrimaryBtn busy={busy} busyLabel="Δημιουργία…" label="Δημιουργία" onClick={submit} />
      </>}
    >
      <FormField label="Μέλος *">
        <SearchableDropdown options={memberOptions} value={userId} onChange={setUserId} placeholder="— επιλογή μέλους —" />
      </FormField>

      <FormField label="Πλάνο *">
        <SearchableDropdown options={planOptions} value={planId} onChange={setPlanId} placeholder="— επιλογή πλάνου —" />
      </FormField>

      {basePrice != null && (
        <FormField label="Τελική τιμή για αυτό το μέλος (€)">
          <div className="relative">
            <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input type="number" min={0} step="0.50" value={customPrice??''} placeholder={basePrice.toString()}
              onChange={(e) => setCustomPrice(e.target.value===''?null:Number(e.target.value))}
              className="w-full h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>
          <div className="text-[11px] text-text-secondary">
            Κανονική: {formatMoney(basePrice)}
            {effectivePrice != null && discount != null && discount !== 0 && (
              <> · Τελική: <span className="text-success">{formatMoney(effectivePrice)}</span> · Έκπτωση: <span className="text-warning">{formatMoney(discount)}</span></>
            )}
          </div>
        </FormField>
      )}

      <FormField label="Λόγος έκπτωσης (προαιρετικό)">
        <input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="π.χ. φίλος, παλιό μέλος, προσφορά…"
          className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary"
        />
      </FormField>

      <FormField label="Έναρξη">
        <DatePicker selected={startsAt} onChange={(d) => setStartsAt(d)} dateFormat="dd/MM/yyyy" locale={el} placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
          className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all"
          wrapperClassName="w-full" showMonthDropdown showYearDropdown dropdownMode="select" scrollableYearDropdown yearDropdownItemNumber={80}
        />
      </FormField>

      <FormField label="Οφειλή (€)">
        <div className="relative">
          <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
          <input type="number" step="0.01" value={debt} onChange={(e) => setDebt(Number(e.target.value))}
            className="w-full h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
          />
        </div>
      </FormField>
    </ModalShell>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────

function EditMembershipModal({ row, onClose }: { row: MembershipRow; onClose: () => void }) {
  const [status, setStatus]           = useState(row.status ?? 'active');
  const [startsAt, setStartsAt]       = useState<Date | null>(row.starts_at ? new Date(row.starts_at) : null);
  const [endsAt, setEndsAt]           = useState<Date | null>(row.ends_at ? new Date(row.ends_at) : null);
  const [remaining, setRemaining]     = useState<number>(row.remaining_sessions ?? 0);
  const [planId, setPlanId]           = useState<string>(row.plan_id ?? '');
  const [debt, setDebt]               = useState<number>(row.debt ?? 0);
  const [customPrice, setCustomPrice] = useState<number | null>(row.custom_price ?? null);
  const [discountReason, setDiscountReason] = useState(row.discount_reason ?? '');
  const [plans, setPlans]             = useState<Plan[]>([]);
  const [busy, setBusy]               = useState(false);

  useEffect(() => {
    supabase.from('membership_plans').select('id,name,plan_kind,duration_days,session_credits,price').eq('tenant_id',row.tenant_id).order('created_at',{ascending:false})
      .then(({ data }) => setPlans((data as any[]) ?? []));
  }, [row.tenant_id]);

  const selectedPlan   = useMemo(() => plans.find((p) => p.id === planId) ?? null, [plans, planId]);
  const basePrice      = selectedPlan?.price != null ? selectedPlan.price : row.plan_price ?? null;
  const effectivePrice = customPrice != null ? customPrice : basePrice;
  const discount       = basePrice != null && effectivePrice != null ? basePrice - effectivePrice : null;

  const planOptions = useMemo(() => plans.map((p) => {
    const parts: string[] = [];
    if (p.duration_days) parts.push(`${p.duration_days}μ`);
    if (p.session_credits) parts.push(`${p.session_credits} υπόλοιπο`);
    return { id:p.id, label:`${p.name}${parts.length?' · '+parts.join(' • '):''}` };
  }), [plans]);

  const submit = async () => {
    setBusy(true);
    const res = await supabase.functions.invoke('membership-update', { body: { id:row.id, status, starts_at:startsAt?dateToISODate(startsAt):null, ends_at:endsAt?dateToISODate(endsAt):null, remaining_sessions:Number.isFinite(remaining)?remaining:null, plan_id:planId||null, debt:Number.isFinite(debt)?debt:null, custom_price:customPrice, discount_reason:discountReason||null } });
    setBusy(false);
    if (res.error || (res.data as any)?.error) { alert(res.error?.message ?? (res.data as any)?.error ?? 'Save failed'); return; }
    onClose();
  };

  return (
    <ModalShell title="Επεξεργασία Συνδρομής" icon={<Pencil className="h-4 w-4 text-primary" />} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Κλείσιμο</button>
        <PrimaryBtn busy={busy} busyLabel="Αποθήκευση…" label="Αποθήκευση" onClick={submit} />
      </>}
    >
      <FormField label="Πλάνο">
        <SearchableDropdown options={[{id:'',label:'(διατηρήστε την τρέχουσα)'}, ...planOptions]} value={planId} onChange={setPlanId} placeholder="— επιλογή πλάνου —" />
      </FormField>

      {basePrice != null && (
        <FormField label="Τελική τιμή για αυτό το μέλος (€)">
          <div className="relative">
            <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input type="number" min={0} step="0.50" value={customPrice??''} placeholder={basePrice.toString()}
              onChange={(e) => setCustomPrice(e.target.value===''?null:Number(e.target.value))}
              className="w-full h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>
          <div className="text-[11px] text-text-secondary">
            Κανονική: {formatMoney(basePrice)}
            {effectivePrice != null && discount != null && discount !== 0 && (
              <> · Τελική: <span className="text-success">{formatMoney(effectivePrice)}</span> · Έκπτωση: <span className="text-warning">{formatMoney(discount)}</span></>
            )}
          </div>
        </FormField>
      )}

      <FormField label="Λόγος έκπτωσης (προαιρετικό)">
        <input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="π.χ. φίλος, παλιό μέλος…"
          className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary"
        />
      </FormField>

      <FormField label="Κατάσταση">
        <StyledSelect value={status} onChange={(e: any) => setStatus(e.target.value)}>
          <option value="active">Ενεργή</option>
          <option value="paused">Σε παύση</option>
          <option value="cancelled">Ακυρωμένη</option>
          <option value="expired">Έληξε</option>
        </StyledSelect>
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Έναρξη">
          <DatePicker selected={startsAt} onChange={(d) => setStartsAt(d)} dateFormat="dd/MM/yyyy" locale={el} placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
            className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all"
            wrapperClassName="w-full" showMonthDropdown showYearDropdown dropdownMode="select" scrollableYearDropdown yearDropdownItemNumber={80} maxDate={endsAt??undefined}
          />
        </FormField>
        <FormField label="Λήξη">
          <DatePicker selected={endsAt} onChange={(d) => setEndsAt(d)} dateFormat="dd/MM/yyyy" locale={el} placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
            className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all"
            wrapperClassName="w-full" showMonthDropdown showYearDropdown dropdownMode="select" scrollableYearDropdown yearDropdownItemNumber={80} minDate={startsAt??undefined}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Υπολ. συνεδρίες">
          <div className="relative">
            <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input type="number" min={0} value={remaining} onChange={(e) => setRemaining(Number(e.target.value))}
              className="w-full h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>
        </FormField>
        <FormField label="Οφειλή (€)">
          <div className="relative">
            <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input type="number" step="0.01" value={debt} onChange={(e) => setDebt(Number(e.target.value))}
              className="w-full h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>
        </FormField>
      </div>
    </ModalShell>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function MembershipsPage() {
  const { profile, subscription } = useAuth();
  const [showSubModal, setShowSubModal] = useState(false);
  const [rows, setRows]             = useState<MembershipRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [q, setQ]                   = useState('');
  const [error, setError]           = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow]       = useState<MembershipRow | null>(null);
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(10);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPlan, setFilterPlan]         = useState('');
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterDebt, setFilterDebt]         = useState<'all'|'with'|'without'>('all');

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

    const { data: members } = await supabase.from('profiles').select('id,full_name').eq('tenant_id', profile.tenant_id).eq('role','member');
    const memberMap = new Map<string, Member>();
    (members as any[] | null)?.forEach((m) => memberMap.set(m.id, { id:m.id, full_name:m.full_name }));

    setRows((data as any[]).map((r) => {
      const plan = r.membership_plans;
      const cats: PlanCategory[] = plan && Array.isArray(plan.membership_plan_categories)
        ? (plan.membership_plan_categories as any[]).map((l: any) => l.class_categories).filter(Boolean).map((c: any) => ({ id:c.id, name:c.name, color:c.color??null }))
        : [];
      return { ...r, profile: memberMap.get(r.user_id) ?? null, plan_categories: cats } as MembershipRow;
    }));
    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id]);

  const categoryOptions = useMemo(() => {
    const map = new Map<string,string>();
    rows.forEach((r) => (r.plan_categories??[]).forEach((cat) => { if (cat.id) map.set(cat.id, cat.name); }));
    return Array.from(map.entries()).map(([id,name]) => ({id,name}));
  }, [rows]);

  const planOptions = useMemo(() => {
    const map = new Map<string,string>();
    rows.forEach((r) => { if (r.plan_id && r.plan_name) map.set(r.plan_id, r.plan_name); });
    return Array.from(map.entries()).map(([id,name]) => ({id,name}));
  }, [rows]);

  const filtered = useMemo(() => {
    let list = [...rows];
    if (q) { const n=q.toLowerCase(); list=list.filter((r) => (r.profile?.full_name??'').toLowerCase().includes(n)||(r.plan_name??'').toLowerCase().includes(n)||(r.plan_categories??[]).some((c)=>(c.name??'').toLowerCase().includes(n))||(r.status??'').toLowerCase().includes(n)); }
    if (filterCategory) list=list.filter((r)=>(r.plan_categories??[]).some((c)=>c.id===filterCategory));
    if (filterPlan) list=list.filter((r)=>r.plan_id===filterPlan);
    if (filterStatus) list=list.filter((r)=>(r.status??'active')===filterStatus);
    if (filterDebt==='with') list=list.filter((r)=>(r.debt??0)>0);
    else if (filterDebt==='without') list=list.filter((r)=>!r.debt||r.debt===0);
    return list;
  }, [rows, q, filterCategory, filterPlan, filterStatus, filterDebt]);

  useEffect(() => { setPage(1); }, [q, pageSize, filterCategory, filterPlan, filterStatus, filterDebt]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => filtered.slice((page-1)*pageSize, page*pageSize), [filtered, page, pageSize]);
  const startIdx  = filtered.length===0?0:(page-1)*pageSize+1;
  const endIdx    = Math.min(filtered.length, page*pageSize);

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
            <p className="text-xs text-text-secondary mt-px">{loading?'…':`${rows.length} συνδρομές`}</p>
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
          { value: filterPlan,     onChange: setFilterPlan,     opts: planOptions,     all: 'Όλα τα πλάνα' },
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
          {([['all','Όλες'],['with','Με οφειλή'],['without','Εξοφλημένες']] as const).map(([v,l]) => (
            <button key={v} onClick={() => setFilterDebt(v)}
              className={['h-7 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer', filterDebt===v?'bg-primary text-white shadow-sm shadow-primary/30':'text-text-secondary hover:text-text-primary hover:bg-secondary/30'].join(' ')}
            >{l}</button>
          ))}
        </div>
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
            <Users className="h-8 w-8 opacity-25" />
            <span className="text-sm">Καμία συνδρομή</span>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border/5">
              {paginated.map((m) => {
                const basePrice      = m.plan_price;
                const effectivePrice = m.custom_price != null ? m.custom_price : basePrice;
                const { label: sLabel, cls: sCls } = getStatus(m.status);
                const hasDebt = m.debt != null && m.debt !== 0;
                return (
                  <div key={m.id} className="p-4 hover:bg-secondary/5 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-text-primary truncate">{m.profile?.full_name ?? m.user_id}</div>
                        <div className="text-xs text-text-secondary mt-0.5">{m.plan_name ?? 'Χωρίς πλάνο'}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-lg border ${sCls}`}>{sLabel}</span>
                        <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => requireActiveSubscription(() => setEditRow(m))} />
                        <DeleteButton id={m.id} onDeleted={load} guard={() => { if (subscriptionInactive) { setShowSubModal(true); return false; } return true; }} />
                      </div>
                    </div>

                    {effectivePrice != null && (
                      <div className="mt-2 text-sm font-bold text-primary">
                        {formatMoney(effectivePrice)}
                        {basePrice != null && m.custom_price != null && m.custom_price !== basePrice && (
                          <span className="ml-2 text-[11px] text-warning font-normal">κανονική: {formatMoney(basePrice)}</span>
                        )}
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap gap-1">
                      {(m.plan_categories??[]).length > 0 ? (m.plan_categories??[]).map((cat) => <CategoryChip key={cat.id} cat={cat} />) : <span className="text-[11px] text-text-secondary opacity-50">Χωρίς κατηγορία</span>}
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-text-secondary">
                      {[['Έναρξη', formatDateDMY(m.starts_at)], ['Λήξη', formatDateDMY(m.ends_at)], ['Μέρες υπολοίπου', m.days_remaining ?? '—'], ['Υπολ. συνεδρίες', m.remaining_sessions ?? '—']].map(([label, val]) => (
                        <div key={String(label)} className="flex flex-col gap-0.5"><span>{label}</span><span className="text-text-primary font-medium">{String(val)}</span></div>
                      ))}
                    </div>

                    <div className="mt-2 text-[11px]">
                      {hasDebt ? <span className="font-bold text-warning">Οφειλή: {formatMoney(m.debt!)}</span> : <span className="text-success font-semibold">Εξοφλημένη</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/10 bg-secondary/5">
                    {['Μέλος', 'Πλάνο / Τιμή', 'Κατηγορία', 'Έναρξη', 'Λήξη', 'Μέρες', 'Συνεδρίες', 'Οφειλή', 'Κατάσταση', ''].map((h, i) => (
                      <th key={i} className={['px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary', i===9?'text-right':'text-left'].join(' ')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((m) => {
                    const basePrice      = m.plan_price;
                    const effectivePrice = m.custom_price != null ? m.custom_price : basePrice;
                    const hasDebt        = m.debt != null && m.debt !== 0;
                    const { label: sLabel, cls: sCls } = getStatus(m.status);
                    return (
                      <tr key={m.id} className="border-t border-border/5 hover:bg-secondary/5 transition-colors">
                        <td className="px-4 py-3 font-semibold text-text-primary">{m.profile?.full_name ?? m.user_id}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-text-primary">{m.plan_name ?? '—'}</div>
                          {effectivePrice != null && (
                            <div className="text-xs mt-0.5">
                              <span className="font-bold text-primary">{formatMoney(effectivePrice)}</span>
                              {basePrice != null && m.custom_price != null && m.custom_price !== basePrice && (
                                <span className="ml-1.5 text-warning opacity-80">κανονική: {formatMoney(basePrice)}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {(m.plan_categories??[]).length > 0 ? (
                            <div className="flex flex-wrap gap-1">{(m.plan_categories??[]).map((cat) => <CategoryChip key={cat.id} cat={cat} />)}</div>
                          ) : <span className="text-xs text-text-secondary opacity-40">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-text-secondary">{formatDateDMY(m.starts_at)}</td>
                        <td className="px-4 py-3 text-xs text-text-secondary">{formatDateDMY(m.ends_at)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-text-primary">{m.days_remaining ?? '—'}</td>
                        <td className="px-4 py-3 text-sm font-medium text-text-primary">{m.remaining_sessions ?? '—'}</td>
                        <td className="px-4 py-3">
                          {hasDebt ? <span className="text-xs font-bold text-warning">{formatMoney(m.debt!)}</span> : <span className="text-xs font-semibold text-success">Εξοφλημένη</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${sCls}`}>{sLabel}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => requireActiveSubscription(() => setEditRow(m))} />
                            <DeleteButton id={m.id} onDeleted={load} guard={() => { if (subscriptionInactive) { setShowSubModal(true); return false; } return true; }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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

      {showCreate && <CreateMembershipModal tenantId={profile?.tenant_id!} onClose={() => { setShowCreate(false); load(); }} />}
      {editRow    && <EditMembershipModal   row={editRow} onClose={() => { setEditRow(null); load(); }} />}
      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </div>
  );
}