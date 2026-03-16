import { useEffect, useState, type MouseEvent, type FormEvent, type ChangeEvent } from 'react';
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale/el';
import { supabase } from '../../../../lib/supabase';
import type { ProgramDeleteModalProps, SimpleClassRow, SessionIdRow } from '../types';
import { DAY_OPTIONS, TIME_OPTIONS } from '../programUtils';

export default function ProgramDeleteModal({ open, onClose, tenantId, onDeleted }: ProgramDeleteModalProps) {
  const [fromDate, setFromDate]               = useState<Date | null>(null);
  const [toDate, setToDate]                   = useState<Date | null>(null);
  const [classes, setClasses]                 = useState<SimpleClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [startTime, setStartTime]             = useState('');
  const [selectedDays, setSelectedDays]       = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [pending, setPending]                 = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  useEffect(() => {
    if (!open || !tenantId) return;
    supabase.from('classes').select('id, title').eq('tenant_id', tenantId).order('title', { ascending: true })
      .then(({ data, error }) => {
        if (!error) setClasses((data ?? []) as SimpleClassRow[]);
      });
  }, [open, tenantId]);

  useEffect(() => {
    if (!open) {
      setFromDate(null); setToDate(null); setSelectedClassId('');
      setStartTime(''); setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
      setError(null); setPending(false); setClasses([]);
    }
  }, [open]);

  if (!open) return null;

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !pending) onClose();
  };

  const toggleDay = (day: number) =>
    setSelectedDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);

  const handleTimeSelectChange = (e: ChangeEvent<HTMLSelectElement>) => setStartTime(e.target.value);

  const handleDelete = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenantId)          { setError('Δεν βρέθηκε tenant.'); return; }
    if (!fromDate || !toDate) { setError('Συμπλήρωσε και τις δύο ημερομηνίες.'); return; }
    if (!selectedClassId)   { setError('Επίλεξε τμήμα (class).'); return; }
    if (!startTime)         { setError('Επίλεξε ώρα ή "Όλες οι ώρες".'); return; }
    if (selectedDays.length === 0) { setError('Επίλεξε τουλάχιστον μία ημέρα εβδομάδας.'); return; }

    const isAllHours = startTime === 'ALL';
    let targetHours = 0, targetMinutes = 0;
    if (!isAllHours) {
      const [hhStr, mmStr] = startTime.split(':');
      targetHours = Number(hhStr); targetMinutes = Number(mmStr);
    }

    try {
      setPending(true); setError(null);
      const fromStart = new Date(fromDate); fromStart.setHours(0, 0, 0, 0);
      const toEnd     = new Date(toDate);   toEnd.setHours(23, 59, 59, 999);

      const { data, error: selectError } = await supabase
        .from('class_sessions').select('id, starts_at')
        .eq('tenant_id', tenantId).eq('class_id', selectedClassId)
        .gte('starts_at', fromStart.toISOString()).lte('starts_at', toEnd.toISOString());

      if (selectError) { setError('Κάτι πήγε στραβά κατά την αναζήτηση συνεδριών.'); return; }

      const rows = (data ?? []) as SessionIdRow[];
      const idsToDelete = rows
        .filter((row) => {
          const dt = new Date(row.starts_at);
          const matchesDay  = selectedDays.includes(dt.getDay());
          const matchesTime = isAllHours ? true : dt.getHours() === targetHours && dt.getMinutes() === targetMinutes;
          return matchesDay && matchesTime;
        })
        .map((row) => row.id);

      if (idsToDelete.length === 0) { setError('Δεν βρέθηκαν συνεδρίες με αυτά τα κριτήρια.'); return; }

      const { error: deleteError } = await supabase.from('class_sessions').delete().in('id', idsToDelete);
      if (deleteError) { setError('Κάτι πήγε στραβά κατά τη διαγραφή.'); return; }

      onDeleted(); onClose();
    } finally { setPending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={handleBackdropClick}>
      <div className="w-full max-w-md rounded-xl bg-secondary-background border border-border/10 shadow-xl p-4 md:p-5">
        <h2 className="text-lg font-semibold text-text-primary mb-1">Διαγραφή Προγράμματος</h2>
        <p className="text-xs md:text-sm text-text-secondary mb-4">
          Θα διαγραφούν{' '}
          <span className="font-semibold text-red-400">όλες οι συνεδρίες του επιλεγμένου τμήματος</span>{' '}
          που ξεκινούν στο συγκεκριμένο διάστημα, στις επιλεγμένες ημέρες και (αν οριστεί) στην επιλεγμένη ώρα. Η ενέργεια δεν μπορεί να αναιρεθεί.
        </p>

        <form onSubmit={handleDelete} className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">Τμήμα (Class)</label>
            <select
              className="w-full rounded-md bg-background border border-border/10 px-3 py-2 text-xs md:text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/70"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              <option value="">— Επίλεξε τμήμα —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">Από ημερομηνία</label>
            <DatePicker selected={fromDate} onChange={(d) => setFromDate(d)} dateFormat="dd/MM/yyyy" locale={el} placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
              className="w-full rounded-md bg-background border border-border/10 px-3 py-2 text-xs md:text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/70"
              wrapperClassName="w-full" showMonthDropdown showYearDropdown dropdownMode="select" scrollableYearDropdown yearDropdownItemNumber={80}
              maxDate={toDate ?? undefined}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">Έως ημερομηνία</label>
            <DatePicker selected={toDate} onChange={(d) => setToDate(d)} dateFormat="dd/MM/yyyy" locale={el} placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
              className="w-full rounded-md bg-background border border-border/10 px-3 py-2 text-xs md:text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/70"
              wrapperClassName="w-full" showMonthDropdown showYearDropdown dropdownMode="select" scrollableYearDropdown yearDropdownItemNumber={80}
              minDate={fromDate ?? undefined}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">Ημέρες εβδομάδας</label>
            <div className="flex flex-wrap gap-2">
              {DAY_OPTIONS.map((d) => {
                const active = selectedDays.includes(d.value);
                return (
                  <button key={d.value} type="button" onClick={() => toggleDay(d.value)} title={d.full}
                    className={`px-2 py-1 rounded-full text-[11px] border ${active ? 'bg-primary text-white border-primary' : 'bg-background text-text-secondary border-border/15'}`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
            <span className="text-[11px] text-text-secondary">Ανέστρεψε επιλογή πατώντας ξανά σε μια ημέρα.</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">Ώρα έναρξης συνεδρίας</label>
            <select
              className="w-full rounded-md bg-background border border-border/10 px-3 py-2 text-xs md:text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/70"
              value={startTime}
              onChange={handleTimeSelectChange}
            >
              <option value="">— Επίλεξε ώρα —</option>
              <option value="ALL">Όλες οι ώρες</option>
              {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="text-[11px] text-text-secondary">Διάλεξε συγκεκριμένη ώρα ή «Όλες οι ώρες» για να διαγραφούν όλα τα ωράρια.</span>
          </div>

          {error && <div className="text-xs text-red-400">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={pending}
              className="inline-flex items-center justify-center rounded-md border border-border/15 px-3 py-1.5 text-xs md:text-sm text-text-secondary hover:bg-white/5"
            >
              Άκυρο
            </button>
            <button type="submit" disabled={pending || !fromDate || !toDate || !selectedClassId || !startTime || selectedDays.length === 0}
              className="inline-flex items-center justify-center rounded-md bg-red-500/90 px-3 py-1.5 text-xs md:text-sm font-medium text-white hover:bg-red-600 disabled:opacity-60"
            >
              {pending ? 'Διαγραφή…' : 'Διαγραφή συνεδριών'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
