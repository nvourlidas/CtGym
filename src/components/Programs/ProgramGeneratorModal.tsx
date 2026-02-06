// src/components/ProgramGeneratorModal.tsx
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale/el';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';

type GymClass = { id: string; title: string };

// ✅ same idea as your member modal: store Date objects, send/compute ISO dates when needed
// function dateToISODate(d: Date) {
//   const y = d.getFullYear();
//   const m = String(d.getMonth() + 1).padStart(2, '0');
//   const day = String(d.getDate()).padStart(2, '0');
//   return `${y}-${m}-${day}`; // local date (no timezone shift)
// }

export default function ProgramGeneratorModal({
  open,
  onClose,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  onGenerated: () => void;
}) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const [classes, setClasses] = useState<GymClass[]>([]);
  const [classId, setClassId] = useState('');
  const [classSearch, setClassSearch] = useState('');
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [dayOfWeek, setDayOfWeek] = useState<'0' | '1' | '2' | '3' | '4' | '5' | '6'>('1'); // Δευτέρα
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('19:00');

  // ✅ use same DatePicker style as CreateMemberModal
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);

  const [capacity, setCapacity] = useState<number | ''>('');
  const [cancelBeforeHours, setCancelBeforeHours] = useState<number | ''>(''); // NEW
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId || !open) return;
    const loadClasses = async () => {
      const { data } = await supabase
        .from('classes')
        .select('id,title')
        .eq('tenant_id', tenantId)
        .order('title');
      setClasses(data ?? []);
    };
    loadClasses();
  }, [tenantId, open]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!classDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target as Node)) {
        setClassDropdownOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [classDropdownOpen]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!classId) {
      alert('Παρακαλώ επιλέξτε ένα μάθημα.');
      return;
    }
    if(!fromDate || !toDate || !startTime || !endTime){
      alert('Παρακαλώ συμπληρώστε τις ημερομηνίες και ώρες.');
      return;
    }
    
    if (!tenantId || !classId || !fromDate || !toDate || !startTime || !endTime) return;

    const cancelVal = cancelBeforeHours === '' ? null : Number(cancelBeforeHours);
    if (cancelVal != null && (isNaN(cancelVal) || cancelVal < 0)) {
      alert('Το πεδίο "Ακύρωση μέχρι (ώρες πριν)" πρέπει να είναι >= 0.');
      return;
    }

    setSaving(true);
    try {
      const sessionsToInsert: any[] = [];

      // Work with local dates (midnight), like typical date picker logic
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(toDate);
      end.setHours(0, 0, 0, 0);

      const targetDow = Number(dayOfWeek); // 0=Κυρ
      const capVal = capacity === '' ? null : Number(capacity);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === targetDow) {
          const s = new Date(d);
          const e2 = new Date(d);

          const [sh, sm] = startTime.split(':').map(Number);
          const [eh, em] = endTime.split(':').map(Number);

          s.setHours(sh, sm, 0, 0);
          e2.setHours(eh, em, 0, 0);

          sessionsToInsert.push({
            tenant_id: tenantId,
            class_id: classId,
            starts_at: s.toISOString(),
            ends_at: e2.toISOString(),
            capacity: capVal,
            cancel_before_hours: cancelVal, // NEW
          });
        }
      }

      if (sessionsToInsert.length === 0) {
        setSaving(false);
        return;
      }

      const { error } = await supabase.from('class_sessions').insert(sessionsToInsert);
      if (error) throw error;

      onGenerated();
      onClose();
    } catch (err) {
      console.error('Failed to generate program', err);
    } finally {
      setSaving(false);
    }
  };

  const filteredClasses = classes.filter((c) =>
    c.title.toLowerCase().includes(classSearch.toLowerCase())
  );
  const selectedClass = classes.find((c) => c.id === classId);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-secondary-background p-6 shadow-2xl text-text-primary">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Δημιουργία προγράμματος (επαναλαμβανόμενες συνεδρίες)
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-md border border-white/10 text-sm hover:bg-white/5"
          >
            ✕
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* Custom searchable dropdown for class */}
          <div ref={dropdownRef} className="relative">
            <label className="block text-sm font-medium mb-1">Μάθημα</label>
            <button
              type="button"
              className="input flex items-center justify-between"
              onClick={() => setClassDropdownOpen((v) => !v)}
            >
              <span>{selectedClass ? selectedClass.title : 'Επιλέξτε μάθημα…'}</span>
              <span className="ml-2 text-xs opacity-70">{classDropdownOpen ? '▲' : '▼'}</span>
            </button>

            {classDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full rounded-md border border-white/15 bg-secondary-background shadow-lg">
                <div className="p-2 border-b border-white/10">
                  <input
                    autoFocus
                    className="input h-9! text-sm!"
                    placeholder="Αναζήτηση μαθήματος..."
                    value={classSearch}
                    onChange={(e) => setClassSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {filteredClasses.length === 0 && (
                    <div className="px-3 py-2 text-xs text-text-secondary">Δεν βρέθηκαν μαθήματα</div>
                  )}
                  {filteredClasses.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`w-full px-3 py-2 text-left text-sm hover:bg:white/5 ${
                        c.id === classId ? 'bg-white/10' : ''
                      }`}
                      onClick={() => {
                        setClassId(c.id);
                        setClassDropdownOpen(false);
                      }}
                    >
                      {c.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Ημέρα εβδομάδας</label>
              <select
                className="input"
                value={dayOfWeek}
                onChange={(e) =>
                  setDayOfWeek(e.target.value as '0' | '1' | '2' | '3' | '4' | '5' | '6')
                }
              >
                <option value="1">Δευτέρα</option>
                <option value="2">Τρίτη</option>
                <option value="3">Τετάρτη</option>
                <option value="4">Πέμπτη</option>
                <option value="5">Παρασκευή</option>
                <option value="6">Σάββατο</option>
                <option value="0">Κυριακή</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Ώρα έναρξης</label>
              <input
                type="time"
                className="input"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Ώρα λήξης</label>
              <input
                type="time"
                className="input"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* ✅ DatePickers (same behavior as your other modal) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Από ημερομηνία</label>
              <DatePicker
                selected={fromDate}
                onChange={(date) => setFromDate(date)}
                dateFormat="dd/MM/yyyy"
                locale={el}
                placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
                className="input"
                wrapperClassName="w-full"
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                scrollableYearDropdown
                yearDropdownItemNumber={80}
                maxDate={toDate ?? undefined}
              />
              {/* hidden value (optional) if you ever want to see what gets stored */}
              {/* <div className="mt-1 text-[11px] opacity-60">{fromDate ? dateToISODate(fromDate) : ''}</div> */}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Έως ημερομηνία</label>
              <DatePicker
                selected={toDate}
                onChange={(date) => setToDate(date)}
                dateFormat="dd/MM/yyyy"
                locale={el}
                placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
                className="input"
                wrapperClassName="w-full"
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                scrollableYearDropdown
                yearDropdownItemNumber={80}
                minDate={fromDate ?? undefined}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Διαθέσιμες θέσεις (προαιρετικό)
            </label>
            <input
              type="number"
              min={0}
              className="input"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Ακύρωση μέχρι (ώρες πριν, προαιρετικό)
            </label>
            <input
              type="number"
              min={0}
              className="input"
              value={cancelBeforeHours}
              onChange={(e) =>
                setCancelBeforeHours(e.target.value === '' ? '' : Number(e.target.value))
              }
            />
          </div>

          <p className="text-xs text-text-secondary">
            Θα δημιουργηθεί μία συνεδρία για κάθε επιλεγμένη ημέρα της εβδομάδας, ανάμεσα στις δύο
            ημερομηνίες.
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Άκυρο
            </button>
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
              {saving ? 'Δημιουργία…' : 'Δημιουργία προγράμματος'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
