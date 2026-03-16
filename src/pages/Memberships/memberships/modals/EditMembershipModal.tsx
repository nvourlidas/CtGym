import { useEffect, useMemo, useState } from 'react';
import { Pencil, Euro, Layers } from 'lucide-react';
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale/el';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../auth';
import type { MembershipRow, Plan } from '../types';
import { formatMoney, dateToISODate } from '../membershipUtils';
import ModalShell from '../components/ModalShell';
import FormField from '../components/FormField';
import StyledSelect from '../components/StyledSelect';
import PrimaryBtn from '../components/PrimaryBtn';
import SearchableDropdown from '../components/SearchableDropdown';

export default function EditMembershipModal({ row, onClose }: {
  row: MembershipRow; onClose: () => void;
}) {
  const { profile } = useAuth();
  const [status, setStatus] = useState(row.status ?? 'active');
  const [startsAt, setStartsAt] = useState<Date | null>(row.starts_at ? new Date(row.starts_at) : null);
  const [endsAt, setEndsAt] = useState<Date | null>(row.ends_at ? new Date(row.ends_at) : null);
  const [remaining, setRemaining] = useState<number>(row.remaining_sessions ?? 0);
  const [planId, setPlanId] = useState<string>(row.plan_id ?? '');
  const [debt, setDebt] = useState<number>(row.debt ?? 0);
  const [customPrice, setCustomPrice] = useState<number | null>(row.custom_price ?? null);
  const [discountReason, setDiscountReason] = useState(row.discount_reason ?? '');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('membership_plans').select('id,name,plan_kind,duration_days,session_credits,price').eq('tenant_id', row.tenant_id).order('created_at', { ascending: false })
      .then(({ data }) => setPlans((data as any[]) ?? []));
  }, [row.tenant_id]);

  const selectedPlan = useMemo(() => plans.find((p) => p.id === planId) ?? null, [plans, planId]);
  const basePrice = selectedPlan?.price != null ? selectedPlan.price : row.plan_price ?? null;
  const effectivePrice = customPrice != null ? customPrice : basePrice;
  const discount = basePrice != null && effectivePrice != null ? basePrice - effectivePrice : null;

  const planOptions = useMemo(() => plans.map((p) => {
    const parts: string[] = [];
    if (p.duration_days) parts.push(`${p.duration_days}μ`);
    if (p.session_credits) parts.push(`${p.session_credits} υπόλοιπο`);
    return { id: p.id, label: `${p.name}${parts.length ? ' · ' + parts.join(' • ') : ''}` };
  }), [plans]);

  const submit = async () => {
    setBusy(true);
    const res = await supabase.functions.invoke('membership-update', { body: { id: row.id, tenant_id: profile?.tenant_id, status, starts_at: startsAt ? dateToISODate(startsAt) : null, ends_at: endsAt ? dateToISODate(endsAt) : null, remaining_sessions: Number.isFinite(remaining) ? remaining : null, plan_id: planId || null, debt: Number.isFinite(debt) ? debt : null, custom_price: customPrice, discount_reason: discountReason || null } });
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
        <SearchableDropdown options={[{ id: '', label: '(διατηρήστε την τρέχουσα)' }, ...planOptions]} value={planId} onChange={setPlanId} placeholder="— επιλογή πλάνου —" />
      </FormField>

      {basePrice != null && (
        <FormField label="Τελική τιμή για αυτό το μέλος (€)">
          <div className="relative">
            <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input type="number" min={0} step="0.50" value={customPrice ?? ''} placeholder={basePrice.toString()}
              onChange={(e) => setCustomPrice(e.target.value === '' ? null : Number(e.target.value))}
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
            wrapperClassName="w-full" showMonthDropdown showYearDropdown dropdownMode="select" scrollableYearDropdown yearDropdownItemNumber={80} maxDate={endsAt ?? undefined}
          />
        </FormField>
        <FormField label="Λήξη">
          <DatePicker selected={endsAt} onChange={(d) => setEndsAt(d)} dateFormat="dd/MM/yyyy" locale={el} placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
            className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all"
            wrapperClassName="w-full" showMonthDropdown showYearDropdown dropdownMode="select" scrollableYearDropdown yearDropdownItemNumber={80} minDate={startsAt ?? undefined}
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
