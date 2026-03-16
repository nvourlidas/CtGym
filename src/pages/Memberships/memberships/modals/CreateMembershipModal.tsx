import { useEffect, useMemo, useState } from 'react';
import { Euro } from 'lucide-react';
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale/el';
import { supabase } from '../../../../lib/supabase';
import type { Member, Plan } from '../types';
import { formatMoney, dateToISODate } from '../membershipUtils';
import ModalShell from '../components/ModalShell';
import FormField from '../components/FormField';
import PrimaryBtn from '../components/PrimaryBtn';
import SearchableDropdown from '../components/SearchableDropdown';

export default function CreateMembershipModal({ tenantId, onClose }: {
  tenantId: string; onClose: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [userId, setUserId] = useState('');
  const [planId, setPlanId] = useState('');
  const [startsAt, setStartsAt] = useState<Date | null>(new Date());
  const [debt, setDebt] = useState<number>(0);
  const [customPrice, setCustomPrice] = useState<number | null>(null);
  const [discountReason, setDiscountReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: m } = await supabase.from('members').select('id,full_name,email').eq('tenant_id', tenantId).eq('role', 'member').order('full_name');
      setMembers((m as any[]) ?? []);
      const { data: p } = await supabase.from('membership_plans').select('id,name,plan_kind,duration_days,session_credits,price').eq('tenant_id', tenantId).order('created_at', { ascending: false });
      setPlans((p as any[]) ?? []);
    })();
  }, [tenantId]);

  const selectedPlan = useMemo(() => plans.find((p) => p.id === planId) ?? null, [plans, planId]);
  const basePrice = selectedPlan?.price ?? null;
  const effectivePrice = customPrice != null ? customPrice : basePrice;
  const discount = basePrice != null && effectivePrice != null ? basePrice - effectivePrice : null;

  const memberOptions = useMemo(() => members.map((m) => ({ id: m.id, label: m.full_name || m.id, sublabel: m.email ?? undefined })), [members]);
  const planLabel = (p: Plan) => {
    const parts: string[] = [];
    if (p.duration_days) parts.push(`${p.duration_days} μέρες`);
    if (p.session_credits) parts.push(`${p.session_credits} συνεδρίες`);
    if (p.price != null) parts.push(formatMoney(p.price));
    return `${p.name}${parts.length ? ' · ' + parts.join(' • ') : ''}`;
  };
  const planOptions = useMemo(() => plans.map((p) => ({ id: p.id, label: planLabel(p) })), [plans]);

  const submit = async () => {
    if (!userId || !planId) return;
    setBusy(true);
    const res = await supabase.functions.invoke('membership-create', { body: { tenant_id: tenantId, user_id: userId, plan_id: planId, starts_at: startsAt ? dateToISODate(startsAt) : null, debt: Number.isFinite(debt) ? debt : 0, custom_price: customPrice, discount_reason: discountReason || null } });
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
