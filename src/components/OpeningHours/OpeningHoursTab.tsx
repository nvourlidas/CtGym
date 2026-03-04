import type React from "react";
import type { WeekSchedule, DayKey } from "../../pages/Settings/OpeningHoursPage";
import { Plus, Trash2, ChevronDown, Clock } from "lucide-react";

const DAY_ORDER: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABEL: Record<DayKey, string> = {
  mon: "Δευτέρα", tue: "Τρίτη", wed: "Τετάρτη", thu: "Πέμπτη",
  fri: "Παρασκευή", sat: "Σάββατο", sun: "Κυριακή",
};
const DAY_SHORT: Record<DayKey, string> = {
  mon: "ΔΕΥ", tue: "ΤΡΙ", wed: "ΤΕΤ", thu: "ΠΕΜ",
  fri: "ΠΑΡ", sat: "ΣΑΒ", sun: "ΚΥΡ",
};
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "00")}:00`);

type Props = { week: WeekSchedule; setWeek: React.Dispatch<React.SetStateAction<WeekSchedule>>; canEdit: boolean };

function TimeSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <div className="relative">
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="h-8 pl-3 pr-8 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary appearance-none outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all disabled:opacity-50 cursor-pointer no-scrollbar"
      >
        {HOURS.map((h) => <option key={h} value={h} className="bg-secondary-background">{h}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary pointer-events-none" />
    </div>
  );
}

export default function OpeningHoursTab({ week, setWeek, canEdit }: Props) {
  function updateDay(day: DayKey, patch: Partial<WeekSchedule[DayKey]>) {
    setWeek((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  }
  function updateSlot(day: DayKey, idx: number, patch: Partial<{ start: string; end: string }>) {
    setWeek((prev) => {
      const slots = prev[day].slots.map((s, i) => (i === idx ? { ...s, ...patch } : s));
      return { ...prev, [day]: { ...prev[day], slots } };
    });
  }
  function addSlot(day: DayKey) {
    setWeek((prev) => ({ ...prev, [day]: { ...prev[day], open: true, slots: [...prev[day].slots, { start: "09:00", end: "21:00" }] } }));
  }
  function removeSlot(day: DayKey, idx: number) {
    setWeek((prev) => {
      const slots = prev[day].slots.filter((_, i) => i !== idx);
      return { ...prev, [day]: { ...prev[day], slots } };
    });
  }

  return (
    <div className="space-y-2.5">
      {DAY_ORDER.map((day) => {
        const d = week[day];
        const isOpen = !!d.open;

        return (
          <div key={day} className={["rounded-xl border transition-all", isOpen ? "border-border/15 bg-secondary/5" : "border-border/8 bg-secondary/3 opacity-70"].join(" ")}>
            {/* Day header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                {/* Day pill */}
                <div className={["w-10 h-8 rounded-lg flex items-center justify-center text-[10px] font-black tracking-wider shrink-0 border", isOpen ? "bg-primary/15 border-primary/25 text-primary" : "bg-secondary/10 border-border/10 text-text-secondary"].join(" ")}>
                  {DAY_SHORT[day]}
                </div>
                <span className="text-sm font-bold text-text-primary">{DAY_LABEL[day]}</span>
                {!isOpen && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-lg border border-border/15 bg-secondary/10 text-text-secondary">Κλειστό</span>}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isOpen && (
                  <button type="button" disabled={!canEdit} onClick={() => addSlot(day)}
                    className="inline-flex items-center gap-1 h-7 px-3 rounded-xl border border-border/15 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />Ωράριο
                  </button>
                )}
                {/* Toggle */}
                <button type="button" disabled={!canEdit} onClick={() => updateDay(day, { open: !isOpen, slots: !isOpen ? (d.slots.length ? d.slots : [{ start: "09:00", end: "21:00" }]) : [] })}
                  className={["relative w-10 h-5.5 rounded-full border transition-all cursor-pointer disabled:opacity-50", isOpen ? "bg-primary border-primary/60" : "bg-secondary/20 border-border/20"].join(" ")}
                >
                  <span className={["absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all", isOpen ? "left-5" : "left-0.5"].join(" ")} />
                </button>
              </div>
            </div>

            {/* Slots */}
            {isOpen && d.slots.length > 0 && (
              <div className="px-4 pb-3 space-y-2 border-t border-border/8 pt-3">
                {d.slots.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-2 flex-wrap">
                    <Clock className="h-3.5 w-3.5 text-text-secondary shrink-0" />
                    <TimeSelect value={s.start} onChange={(v) => updateSlot(day, idx, { start: v })} disabled={!canEdit} />
                    <span className="text-text-secondary text-xs">→</span>
                    <TimeSelect value={s.end} onChange={(v) => updateSlot(day, idx, { end: v })} disabled={!canEdit} />
                    <button type="button" disabled={!canEdit} onClick={() => removeSlot(day, idx)}
                      className="ml-auto h-7 w-7 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all disabled:opacity-40 cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}