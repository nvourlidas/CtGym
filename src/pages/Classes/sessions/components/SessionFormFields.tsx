import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale/el';
import { Users, Clock } from 'lucide-react';
import type { GymClass } from '../types';
import FormField from './FormField';
import ClassDropdown from './ClassDropdown';

type Props = {
  classes: GymClass[];
  classId: string; setClassId: (v: string) => void;
  date: Date | null; setDate: (d: Date | null) => void;
  startTime: string; setStartTime: (v: string) => void;
  endTime: string; setEndTime: (v: string) => void;
  capacity: number; setCapacity: (v: number) => void;
  cancelBeforeHours: string; setCancelBeforeHours: (v: string) => void;
};

export default function SessionFormFields({
  classes, classId, setClassId, date, setDate,
  startTime, setStartTime, endTime, setEndTime,
  capacity, setCapacity, cancelBeforeHours, setCancelBeforeHours,
}: Props) {
  return (
    <>
      <FormField label="Τμήμα *">
        <ClassDropdown classes={classes} value={classId} onChange={setClassId} />
      </FormField>

      <FormField label="Ημερομηνία *">
        <DatePicker
          selected={date}
          onChange={(d) => setDate(d)}
          dateFormat="dd/MM/yyyy"
          locale={el}
          placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
          className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all"
          wrapperClassName="w-full"
          showMonthDropdown showYearDropdown dropdownMode="select" scrollableYearDropdown yearDropdownItemNumber={80}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Ώρα Έναρξης *">
          <input
            type="time"
            className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </FormField>
        <FormField label="Ώρα Λήξης *">
          <input
            type="time"
            className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Χωρητικότητα">
          <div className="relative">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input
              type="number" min={0}
              className="w-full h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all"
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
            />
          </div>
        </FormField>
        <FormField label="Ακύρωση έως (ώρες)">
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input
              type="number" min={0}
              className="w-full h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all"
              value={cancelBeforeHours}
              onChange={(e) => setCancelBeforeHours(e.target.value)}
            />
          </div>
        </FormField>
      </div>
    </>
  );
}
