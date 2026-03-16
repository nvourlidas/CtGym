import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import type { Category, Coach, Toast } from '../types';
import { readEdgeErrorPayload } from '../classUtils';
import Modal from '../components/Modal';
import ClassFormFields from '../components/ClassFormFields';

type Props = {
  tenantId: string;
  categories: Category[];
  coaches: Coach[];
  toast: (t: Omit<Toast, 'id'>, ms?: number) => void;
  onClose: () => void;
};

export default function CreateClassModal({ tenantId, categories, coaches, toast, onClose }: Props) {
  const [title, setTitle]                         = useState('');
  const [description, setDescription]             = useState('');
  const [categoryId, setCategoryId]               = useState('');
  const [coachId, setCoachId]                     = useState('');
  const [dropInEnabled, setDropInEnabled]         = useState(false);
  const [dropInPrice, setDropInPrice]             = useState<number | null>(null);
  const [memberDropInPrice, setMemberDropInPrice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('class-create', {
      body: {
        tenant_id: tenantId,
        title: title.trim(),
        description: description.trim() || null,
        category_id: categoryId || null,
        coach_id: coachId || null,
        drop_in_enabled: dropInEnabled,
        drop_in_price: dropInEnabled ? dropInPrice : null,
        member_drop_in_price: dropInEnabled ? memberDropInPrice : null,
      },
    });
    setBusy(false);

    if (error) {
      const payload = await readEdgeErrorPayload(error);
      const code = payload?.error;
      if (code === 'PLAN_LIMIT:MAX_CLASSES_REACHED') {
        toast({
          variant: 'error', title: 'Έφτασες το όριο του πλάνου σου',
          message: payload?.limit != null ? `Έχεις ήδη ${payload.current}/${payload.limit}.` : undefined,
          actionLabel: 'Αναβάθμιση', onAction: () => navigate('/settings/billing'),
        });
        return;
      }
      toast({ variant: 'error', title: 'Αποτυχία δημιουργίας τμήματος', message: code ?? error.message });
      return;
    }

    const code = (data as any)?.error;
    if (code) { toast({ variant: 'error', title: 'Αποτυχία', message: String(code) }); return; }
    toast({ variant: 'success', title: 'Το τμήμα δημιουργήθηκε', message: 'Προστέθηκε επιτυχώς.' });
    onClose();
  };

  return (
    <Modal
      title="Νέο Τμήμα"
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Ακύρωση</button>
        <button onClick={submit} disabled={busy} className="group relative inline-flex items-center gap-2 h-9 px-5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px disabled:opacity-50 disabled:translate-y-0 transition-all cursor-pointer overflow-hidden">
          <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          {busy
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /><span className="relative z-10">Δημιουργία…</span></>
            : <span className="relative z-10">Δημιουργία</span>}
        </button>
      </>}
    >
      <ClassFormFields
        title={title} setTitle={setTitle}
        description={description} setDescription={setDescription}
        categoryId={categoryId} setCategoryId={setCategoryId}
        coachId={coachId} setCoachId={setCoachId}
        dropInEnabled={dropInEnabled} setDropInEnabled={setDropInEnabled}
        dropInPrice={dropInPrice} setDropInPrice={setDropInPrice}
        memberDropInPrice={memberDropInPrice} setMemberDropInPrice={setMemberDropInPrice}
        categories={categories} coaches={coaches}
      />
    </Modal>
  );
}
