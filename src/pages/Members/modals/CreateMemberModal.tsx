import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale';
import { supabase } from '../../../lib/supabase';
import type { Toast } from '../types';
import { dateToISODate, readEdgeErrorPayload } from '../memberUtils';
import Modal from '../components/Modal';
import FormRow from '../components/FormRow';

type Props = {
  tenantId: string;
  onClose: (result?: { existingUser?: boolean }) => void;
  toast: (t: Omit<Toast, 'id'>, ms?: number) => void;
};

export default function CreateMemberModal({ tenantId, onClose, toast }: Props) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [address, setAddress] = useState('');
  const [afm, setAfm] = useState('');
  const [maxDropinDebt, setMaxDropinDebt] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async () => {
    if (!email || !password) return;
    setBusy(true);

    const { data, error } = await supabase.functions.invoke('member-create', {
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

    if (error) {
      const payload = await readEdgeErrorPayload(error);
      const code = payload?.error;

      if (code === 'PLAN_LIMIT:MAX_MEMBERS_REACHED') {
        toast({
          variant: 'error',
          title: 'Έφτασες το όριο του πλάνου σου',
          message: payload?.limit != null ? `Έχεις ήδη ${payload.current}/${payload.limit}.` : 'Έχεις φτάσει το όριο.',
          actionLabel: 'Αναβάθμιση',
          onAction: () => navigate('/settings/billing'),
        });
        return;
      }

      toast({ variant: 'error', title: 'Αποτυχία δημιουργίας μέλους', message: code ?? error.message ?? 'Unknown error' });
      return;
    }

    const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    const code = (parsedData as any)?.error;
    if (code) {
      toast({ variant: 'error', title: 'Αποτυχία', message: String(code) });
      return;
    }

    if ((parsedData as any)?.reused_existing_auth_user === true) {
      onClose({ existingUser: true });
      return;
    }

    toast({ variant: 'success', title: 'Το μέλος δημιουργήθηκε', message: 'Προστέθηκε επιτυχώς στη λίστα μελών.' });
    onClose();
  };

  return (
    <Modal onClose={() => onClose()} title="Νέο Μέλος">
      <FormRow label="Όνομα *">
        <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </FormRow>
      <FormRow label="Email *">
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormRow>
      <FormRow label="Τηλέφωνο">
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
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
          showMonthDropdown showYearDropdown dropdownMode="select"
          scrollableYearDropdown yearDropdownItemNumber={80}
        />
      </FormRow>
      <FormRow label="Διεύθυνση">
        <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
      </FormRow>
      <FormRow label="ΑΦΜ">
        <input className="input" value={afm} onChange={(e) => setAfm(e.target.value)} />
      </FormRow>
      <FormRow label="Μέγιστο χρέος drop-in">
        <input className="input" type="number" step="0.01" value={maxDropinDebt} onChange={(e) => setMaxDropinDebt(e.target.value)} />
      </FormRow>
      <FormRow label="Σημειώσεις">
        <textarea className="input min-h-20 resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormRow>
      <FormRow label="Password *">
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </FormRow>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={() => onClose()}>Ακύρωση</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Δημιουργία...' : 'Δημιουργία'}
        </button>
      </div>
    </Modal>
  );
}
