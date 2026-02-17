import type React from "react";
import type { WeekSchedule, DayKey } from "../../pages/Settings/OpeningHoursPage";

const DAY_ORDER: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DAY_LABEL: Record<DayKey, string> = {
  mon: "Δευτέρα",
  tue: "Τρίτη",
  wed: "Τετάρτη",
  thu: "Πέμπτη",
  fri: "Παρασκευή",
  sat: "Σάββατο",
  sun: "Κυριακή",
};

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

type Props = {
  week: WeekSchedule;
  setWeek: React.Dispatch<React.SetStateAction<WeekSchedule>>;
  canEdit: boolean;
};

export default function OpeningHoursTab({ week, setWeek, canEdit }: Props) {
  function updateDay(day: DayKey, patch: Partial<WeekSchedule[DayKey]>) {
    setWeek((prev) => ({
      ...prev,
      [day]: { ...prev[day], ...patch },
    }));
  }

  function updateSlot(day: DayKey, idx: number, patch: Partial<{ start: string; end: string }>) {
    setWeek((prev) => {
      const slots = prev[day].slots.map((s, i) => (i === idx ? { ...s, ...patch } : s));
      return { ...prev, [day]: { ...prev[day], slots } };
    });
  }

  function addSlot(day: DayKey) {
    setWeek((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        open: true,
        slots: [...prev[day].slots, { start: "09:00", end: "21:00" }],
      },
    }));
  }

  function removeSlot(day: DayKey, idx: number) {
    setWeek((prev) => {
      const slots = prev[day].slots.filter((_, i) => i !== idx);
      return { ...prev, [day]: { ...prev[day], slots } };
    });
  }

  return (
    <div className="space-y-3">
      {DAY_ORDER.map((day) => {
        const d = week[day];

        return (
          <div key={day} className="rounded-xl border border-border/10 bg-secondary-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="text-sm font-semibold text-text-primary">{DAY_LABEL[day]}</div>

                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={!!d.open}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const open = e.target.checked;
                      updateDay(day, {
                        open,
                        slots: open ? (d.slots.length ? d.slots : [{ start: "09:00", end: "21:00" }]) : [],
                      });
                    }}
                  />
                  Ανοιχτό
                </label>
              </div>

              <button
                type="button"
                disabled={!canEdit}
                onClick={() => addSlot(day)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-success/20 text-text-primary disabled:opacity-50"
              >
                + Προσθήκη ωραρίου
              </button>
            </div>

            {!d.open ? (
              <div className="mt-3 text-sm text-text-secondary">Κλειστό</div>
            ) : (
              <div className="mt-3 space-y-2">
                {d.slots.map((s, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2">
                    <div className="text-xs text-text-secondary w-10">#{idx + 1}</div>

                    <select
                      value={s.start}
                      disabled={!canEdit}
                      onChange={(e) => updateSlot(day, idx, { start: e.target.value })}
                      className="px-3 py-2 rounded-lg bg-bulk-bg/20 border border-white/10 text-sm text-text-primary disabled:opacity-60 no-scrollbar"
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={h} className="bg-bulk-bg"> 
                          {h}
                        </option>
                      ))}
                    </select>

                    <span className="text-text-secondary text-sm">→</span>

                    <select
                      value={s.end}
                      disabled={!canEdit}
                      onChange={(e) => updateSlot(day, idx, { end: e.target.value })}
                      className="px-3 py-2 rounded-lg bg-bulk-bg/20 border border-white/10 text-sm text-text-primary disabled:opacity-60 no-scrollbar"
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={h} className="bg-bulk-bg">
                          {h}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => removeSlot(day, idx)}
                      className="ml-auto px-3 py-2 rounded-lg text-xs font-medium border border-danger/30 bg-danger/10 text-danger disabled:opacity-50"
                    >
                      Αφαίρεση
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
