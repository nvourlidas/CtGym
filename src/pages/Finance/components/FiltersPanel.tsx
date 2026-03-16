import { useState } from 'react';
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale';
import type { DatePreset, FinanceCategoryRow } from '../types';
import { startOfWeekMonday } from '../financeUtils';
import { StyledSelect } from './formWidgets';

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'custom', label: 'Προσαρμοσμένο' },
  { value: 'this_week', label: 'Αυτή η εβδομάδα' },
  { value: 'this_month', label: 'Αυτός ο μήνας' },
  { value: 'month', label: 'Επιλογή μήνα' },
  { value: 'this_year', label: 'Αυτό το έτος' },
];

export default function FiltersPanel({
  fromDate, setFromDate, toDate, setToDate,
  kindFilter, setKindFilter, categoryFilter, setCategoryFilter, categories,
}: {
  fromDate: Date | null; setFromDate: (d: Date | null) => void;
  toDate: Date | null; setToDate: (d: Date | null) => void;
  kindFilter: 'all' | 'income' | 'expense'; setKindFilter: (v: 'all' | 'income' | 'expense') => void;
  categoryFilter: string; setCategoryFilter: (v: string) => void;
  categories: FinanceCategoryRow[];
}) {
  const [datePreset, setDatePreset] = useState<DatePreset>('this_month');
  const [monthPickerDate, setMonthPickerDate] = useState<Date | null>(new Date());

  const applyPreset = (preset: DatePreset) => {
    const n = new Date();
    if (preset === 'this_week') {
      const s = startOfWeekMonday(n); const e = new Date(s); e.setDate(s.getDate() + 6);
      setFromDate(s); setToDate(e);
    } else if (preset === 'this_month') {
      setFromDate(new Date(n.getFullYear(), n.getMonth(), 1));
      setToDate(new Date(n.getFullYear(), n.getMonth() + 1, 0));
      setMonthPickerDate(n);
    } else if (preset === 'this_year') {
      setFromDate(new Date(n.getFullYear(), 0, 1));
      setToDate(new Date(n.getFullYear(), 11, 31));
    } else if (preset === 'month') {
      const b = monthPickerDate ?? n;
      setFromDate(new Date(b.getFullYear(), b.getMonth(), 1));
      setToDate(new Date(b.getFullYear(), b.getMonth() + 1, 0));
    }
  };

  const handlePreset = (p: DatePreset) => { setDatePreset(p); if (p !== 'custom') applyPreset(p); };

  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background p-4 space-y-4 shadow-sm">
      <div className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Περίοδος</div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(({ value, label }) => (
            <button key={value} type="button" onClick={() => handlePreset(value)}
              className={['h-7 px-3.5 rounded-full border text-xs font-semibold transition-all cursor-pointer',
                datePreset === value ? 'bg-primary text-white border-primary shadow-sm shadow-primary/30' : 'border-border/15 text-text-secondary hover:text-text-primary hover:bg-secondary/30',
              ].join(' ')}
            >{label}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Από</div>
          <DatePicker selected={fromDate} onChange={(d) => { setDatePreset('custom'); setFromDate(d); }}
            dateFormat="dd/MM/yyyy" locale={el} placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ" disabled={datePreset !== 'custom'}
            className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all disabled:opacity-40"
            wrapperClassName="w-full" showMonthDropdown showYearDropdown dropdownMode="select" scrollableYearDropdown yearDropdownItemNumber={80}
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Έως</div>
          <DatePicker selected={toDate} onChange={(d) => { setDatePreset('custom'); setToDate(d); }}
            dateFormat="dd/MM/yyyy" locale={el} placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ" disabled={datePreset !== 'custom'}
            className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all disabled:opacity-40"
            wrapperClassName="w-full" showMonthDropdown showYearDropdown dropdownMode="select" scrollableYearDropdown yearDropdownItemNumber={80}
          />
        </div>
        {datePreset === 'month' && (
          <div className="space-y-1.5 md:col-span-2">
            <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Επιλογή μήνα</div>
            <DatePicker selected={monthPickerDate} onChange={(d) => {
              setMonthPickerDate(d);
              if (!d) return;
              setFromDate(new Date(d.getFullYear(), d.getMonth(), 1));
              setToDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
            }}
              dateFormat="MM/yyyy" locale={el} placeholderText="ΜΜ/ΕΕΕΕ" showMonthYearPicker
              className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all"
              wrapperClassName="w-full"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Τύπος</div>
          <StyledSelect value={kindFilter} onChange={(e: any) => setKindFilter(e.target.value)}>
            <option value="all">Όλα</option>
            <option value="income">Έσοδα</option>
            <option value="expense">Έξοδα</option>
          </StyledSelect>
        </div>
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Κατηγορία</div>
          <StyledSelect value={categoryFilter} onChange={(e: any) => setCategoryFilter(e.target.value)}>
            <option value="all">Όλες</option>
            {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name} ({cat.kind === 'income' ? 'Έσοδο' : 'Έξοδο'})</option>)}
          </StyledSelect>
        </div>
      </div>
    </div>
  );
}
