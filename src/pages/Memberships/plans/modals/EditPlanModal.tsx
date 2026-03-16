import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../auth';
import type { Category, Plan, PlanKind, Toast } from '../types';
import { readEdgeErrorPayload } from '../planUtils';
import ModalShell from '../components/ModalShell';
import PrimaryBtn from '../components/PrimaryBtn';
import PlanFormFields from '../components/PlanFormFields';

export default function EditPlanModal({ row, categories, onClose, toast }: {
  row: Plan; categories: Category[];
  toast: (t: Omit<Toast, 'id'>, ms?: number) => void;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const [name, setName] = useState(row.name);
  const [price, setPrice] = useState<number>(row.price ?? 0);
  const [planKind, setPlanKind] = useState<PlanKind>(row.plan_kind);
  const [durationDays, setDurationDays] = useState<number>(row.duration_days ?? 0);
  const [sessionCredits, setSessionCredits] = useState<number>(row.session_credits ?? 0);
  const [description, setDescription] = useState(row.description ?? '');
  const [categoryIds, setCategoryIds] = useState<string[]>((row.categories ?? []).map((c) => c.id));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name) return;
    if ((durationDays || 0) <= 0 && (sessionCredits || 0) <= 0) { alert('Παρέχετε ημέρες διάρκειας ή/και αριθμό συνεδριών.'); return; }
    setBusy(true);
    const res = await supabase.functions.invoke('plan-update', { body: { id: row.id, tenant_id: profile?.tenant_id, name, price, plan_kind: planKind, duration_days: durationDays || null, session_credits: sessionCredits || null, description, category_ids: categoryIds } });
    setBusy(false);
    if (res.error) {
      const payload = await readEdgeErrorPayload(res.error);
      toast({ variant: 'error', title: 'Αποτυχία αποθήκευσης', message: payload?.error ?? res.error.message ?? 'Unknown error' }); return;
    }
    const code = (res.data as any)?.error;
    if (code) { toast({ variant: 'error', title: 'Αποτυχία αποθήκευσης', message: String(code) }); return; }
    toast({ variant: 'success', title: 'Αποθηκεύτηκε', message: 'Οι αλλαγές αποθηκεύτηκαν.' });
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
