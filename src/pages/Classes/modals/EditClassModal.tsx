import { useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { GymClass, Category, Coach } from '../types';
import Modal from '../components/Modal';
import ClassFormFields from '../components/ClassFormFields';

type Props = {
  row: GymClass;
  categories: Category[];
  coaches: Coach[];
  onClose: () => void;
};

export default function EditClassModal({ row, categories, coaches, onClose }: Props) {
  const [title, setTitle]                         = useState(row.title ?? '');
  const [description, setDescription]             = useState(row.description ?? '');
  const [categoryId, setCategoryId]               = useState(row.category_id ?? '');
  const [coachId, setCoachId]                     = useState(row.coach_id ?? '');
  const [dropInEnabled, setDropInEnabled]         = useState(row.drop_in_enabled ?? false);
  const [dropInPrice, setDropInPrice]             = useState<number | null>(row.drop_in_price ?? null);
  const [memberDropInPrice, setMemberDropInPrice] = useState<number | null>(row.member_drop_in_price ?? null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const res = await supabase.functions.invoke('class-update', {
      body: {
        id: row.id,
        title: title.trim(),
        description: description.trim() || null,
        category_id: categoryId || null,
        coach_id: coachId || null,
        drop_in_enabled: dropInEnabled,
        drop_in_price: dropInEnabled ? dropInPrice : null,
        member_drop_in_price: dropInEnabled ? memberDropInPrice : null,
      },
    });
    if (res.error) alert(res.error.message ?? 'Function error');
    setBusy(false);
    onClose();
  };

  return (
    <Modal
      title="Επεξεργασία Τμήματος"
      icon={<Pencil className="h-4 w-4 text-primary" />}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Ακύρωση</button>
        <button onClick={submit} disabled={busy} className="group relative inline-flex items-center gap-2 h-9 px-5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px disabled:opacity-50 disabled:translate-y-0 transition-all cursor-pointer overflow-hidden">
          <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          {busy
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /><span className="relative z-10">Αποθήκευση…</span></>
            : <span className="relative z-10">Αποθήκευση</span>}
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
