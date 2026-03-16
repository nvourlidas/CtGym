import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../../lib/supabase';
import type { Category, PlanKind, Toast } from '../types';
import { readEdgeErrorPayload } from '../planUtils';
import ModalShell from '../components/ModalShell';
import PrimaryBtn from '../components/PrimaryBtn';
import PlanFormFields from '../components/PlanFormFields';

export default function CreatePlanModal({ tenantId, categories, onClose, toast }: {
  tenantId: string; categories: Category[];
  toast: (t: Omit<Toast, 'id'>, ms?: number) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [planKind, setPlanKind] = useState<PlanKind>('duration');
  const [durationDays, setDurationDays] = useState<number>(0);
  const [sessionCredits, setSessionCredits] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async () => {
    if (!name) return;
    if ((durationDays || 0) <= 0 && (sessionCredits || 0) <= 0) {
      toast({ variant: 'error', title: 'Λείπουν οφέλη πλάνου', message: 'Δώσε ημέρες διάρκειας ή/και αριθμό συνεδριών.' }); return;
    }
    setBusy(true);
    const res = await supabase.functions.invoke('plan-create', { body: { tenant_id: tenantId, name, price, plan_kind: planKind, duration_days: durationDays || null, session_credits: sessionCredits || null, description, category_ids: categoryIds } });
    setBusy(false);
    if (res.error) {
      const payload = await readEdgeErrorPayload(res.error);
      const code = payload?.error;
      if (code === 'PLAN_LIMIT:MAX_MEMBERSHIP_PLANS_REACHED') {
        toast({ variant: 'error', title: 'Έφτασες το όριο του πλάνου σου', message: payload?.limit != null ? `Έχεις ήδη ${payload.current}/${payload.limit}.` : 'Έχεις φτάσει το όριο.', actionLabel: 'Αναβάθμιση', onAction: () => navigate('/settings/billing') }); return;
      }
      toast({ variant: 'error', title: 'Αποτυχία δημιουργίας πλάνου', message: code ?? res.error.message ?? 'Unknown error' }); return;
    }
    const code = (res.data as any)?.error;
    if (code) { toast({ variant: 'error', title: 'Αποτυχία δημιουργίας πλάνου', message: String(code) }); return; }
    toast({ variant: 'success', title: 'Το πλάνο δημιουργήθηκε', message: 'Προστέθηκε επιτυχώς.' });
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
