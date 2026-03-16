import { useState } from 'react';
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale';
import { supabase } from '../../../lib/supabase';
import type { Member } from '../types';
import { dateToISODate, parseISODateToLocal } from '../memberUtils';
import Modal from '../components/Modal';
import FormRow from '../components/FormRow';

type Props = {
  row: Member;
  onClose: () => void;
};

export default function EditMemberModal({ row, onClose }: Props) {
  const [fullName, setFullName]       = useState(row.full_name ?? '');
  const [phone, setPhone]             = useState(row.phone ?? '');
  const [birthDate, setBirthDate]     = useState<Date | null>(parseISODateToLocal(row.birth_date));
  const [address, setAddress]         = useState(row.address ?? '');
  const [afm, setAfm]                 = useState(row.afm ?? '');
  const [maxDropinDebt, setMaxDropinDebt] = useState(row.max_dropin_debt != null ? String(row.max_dropin_debt) : '');
  const [notes, setNotes]             = useState(row.notes ?? '');
  const [password, setPassword]       = useState('');
  const [busy, setBusy]               = useState(false);

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.functions.invoke('member-update', {
      body: {
        id: row.id,
        user_id: row.user_id,
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
    if (!error) onClose();
  };

  return (
    <Modal onClose={onClose} title="Επεξεργασία Μέλους">
      <FormRow label="Όνομα">
        <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </FormRow>
      <FormRow label="Τηλέφωνο">
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </FormRow>
      <FormRow label="Ημ. γέννησης">
        <DatePicker
          selected={birthDate} onChange={(date) => setBirthDate(date)}
          dateFormat="dd/MM/yyyy" locale={el} placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
          className="input" wrapperClassName="w-full"
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
      <FormRow label="Νέο password (προαιρετικό)">
        <input className="input" type="password" placeholder="Αφήστε κενό για να διατηρήσετε το τρέχον" value={password} onChange={(e) => setPassword(e.target.value)} />
      </FormRow>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Ακύρωση</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Αποθήκευση...' : 'Αποθήκευση'}
        </button>
      </div>
    </Modal>
  );
}
