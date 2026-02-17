import { useMemo, useState } from "react";
import AppDatePicker from "../ui/AppDatePicker";
import SendPushModal from "./SendPushModal";
import { Bell } from "lucide-react";
import { supabase } from "../../lib/supabase";

type Slot = { start: string; end: string };

type HolidaySingle = {
  type: "holiday";
  id: string;
  title: string;
  date: string; // YYYY-MM-DD (year matters)
  closed: boolean;
  slots: Slot[];
};

type HolidayRange = {
  type: "holiday_range";
  id: string;
  title: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  closed: boolean;
  slots: Slot[];
};

type HolidayItem = HolidaySingle | HolidayRange;

type Props = {
  tenant_name: string | null;
  tenantId: string | null;
  exceptions: any[];
  setExceptions: (v: any[] | ((prev: any[]) => any[])) => void;
  canEdit: boolean;
};




const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

function uid() {
  // @ts-ignore
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? // @ts-ignore
    crypto.randomUUID()
    : `h_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function isHolidayItem(x: any): x is HolidayItem {
  return x?.type === "holiday" || x?.type === "holiday_range";
}

function isoToKey(iso: string) {
  // YYYY-MM-DD -> number for sort (e.g. 2026-02-03 => 20260203)
  if (!iso || iso.length < 10) return 0;
  const y = iso.slice(0, 4);
  const m = iso.slice(5, 7);
  const d = iso.slice(8, 10);
  const n = parseInt(`${y}${m}${d}`, 10);
  return Number.isFinite(n) ? n : 0;
}

function timeToMinutes(t: string) {
  const [hh, mm] = t.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
  return hh * 60 + mm;
}

function validateSlots(slots: Slot[]): string[] {
  const errors: string[] = [];

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s.start || !s.end) {
      errors.push(`Το ωράριο #${i + 1} δεν έχει ώρα έναρξης/λήξης.`);
      continue;
    }
    const a = timeToMinutes(s.start);
    const b = timeToMinutes(s.end);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      errors.push(`Το ωράριο #${i + 1} έχει μη έγκυρη ώρα.`);
      continue;
    }
    if (a >= b) errors.push(`Στο ωράριο #${i + 1} η έναρξη πρέπει να είναι πριν τη λήξη.`);
  }

  const normalized = slots
    .filter((s) => s.start && s.end)
    .map((s) => ({ ...s, a: timeToMinutes(s.start), b: timeToMinutes(s.end) }))
    .filter((s) => Number.isFinite(s.a) && Number.isFinite(s.b))
    .sort((x, y) => x.a - y.a);

  for (let i = 1; i < normalized.length; i++) {
    const prev = normalized[i - 1];
    const cur = normalized[i];
    if (cur.a < prev.b) {
      errors.push(`Υπάρχει επικάλυψη ωραρίων (${prev.start}-${prev.end}) και (${cur.start}-${cur.end}).`);
    }
  }

  return errors;
}

function formatHolidayLabel(h: HolidayItem) {
  if (h.type === "holiday") return h.date;
  return `${h.from} → ${h.to}`;
}

export default function HolidaysTab({ tenantId, tenant_name, exceptions, setExceptions, canEdit }: Props) {
  const holidays = useMemo(() => {
    const list = (Array.isArray(exceptions) ? exceptions : [])
      .filter(isHolidayItem)
      .map((x) => x as HolidayItem);

    list.sort((a, b) => {
      const ka = a.type === "holiday" ? isoToKey(a.date) : isoToKey(a.from);
      const kb = b.type === "holiday" ? isoToKey(b.date) : isoToKey(b.from);
      return ka - kb || a.title.localeCompare(b.title);
    });

    return list;
  }, [exceptions]);

  const [mode, setMode] = useState<"single" | "range">("single");

  const [form, setForm] = useState<{
    title: string;
    date: string;
    from: string;
    to: string;
    closed: boolean;
    slots: Slot[];
  }>({
    title: "",
    date: "",
    from: "",
    to: "",
    closed: true,
    slots: [],
  });

  const [pushOpen, setPushOpen] = useState(false);
  const [pushContext, setPushContext] = useState<{
    id: string;
    label: string;
    kind: "holiday" | "holiday_range";
    date?: string;
    from?: string;
    to?: string;
  } | null>(null);


  const [formError, setFormError] = useState<string | null>(null);

  function setHolidayInExceptions(updated: HolidayItem) {
    setExceptions((prev: any[]) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      const idx = next.findIndex((x) => isHolidayItem(x) && x.id === updated.id);
      if (idx >= 0) next[idx] = updated;
      return next;
    });
  }

  function removeHoliday(id: string) {
    setExceptions((prev: any[]) =>
      (Array.isArray(prev) ? prev : []).filter((x) => !(isHolidayItem(x) && x.id === id))
    );
  }

  function addHoliday() {
    setFormError(null);

    const title = form.title.trim();
    if (!title) {
      setFormError("Γράψε μια ονομασία (π.χ. Χριστούγεννα).");
      return;
    }

    const slots = form.closed
      ? []
      : form.slots.length
        ? form.slots
        : [{ start: "10:00", end: "14:00" }];

    if (!form.closed) {
      const slotErrs = validateSlots(slots);
      if (slotErrs.length) {
        setFormError(slotErrs[0]);
        return;
      }
    }

    if (mode === "single") {
      if (!form.date) {
        setFormError("Επίλεξε ημερομηνία.");
        return;
      }

      const item: HolidaySingle = {
        type: "holiday",
        id: uid(),
        title,
        date: form.date,
        closed: form.closed,
        slots,
      };

      setExceptions((prev: any[]) => {
        const next = Array.isArray(prev) ? [...prev] : [];
        next.push(item);
        return next;
      });

      setForm({ title: "", date: "", from: "", to: "", closed: true, slots: [] });
      setMode("single");
      return;
    }

    // range
    if (!form.from || !form.to) {
      setFormError("Επίλεξε 'Από' και 'Έως'.");
      return;
    }

    if (isoToKey(form.from) > isoToKey(form.to)) {
      setFormError("Το 'Από' πρέπει να είναι πριν (ή ίδια) από το 'Έως'.");
      return;
    }

    const item: HolidayRange = {
      type: "holiday_range",
      id: uid(),
      title,
      from: form.from,
      to: form.to,
      closed: form.closed,
      slots,
    };

    setExceptions((prev: any[]) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      next.push(item);
      return next;
    });

    setForm({ title: "", date: "", from: "", to: "", closed: true, slots: [] });
    setMode("single");
  }

  const hint = useMemo(() => {
    if (mode === "single") {
      if (!form.date) return null;
      const k = isoToKey(form.date);

      const overlap = holidays.find((h) => {
        if (h.type === "holiday") return isoToKey(h.date) === k;
        return k >= isoToKey(h.from) && k <= isoToKey(h.to);
      });

      return overlap
        ? `Προσοχή: υπάρχει ήδη αργία/εύρος που καλύπτει αυτή την ημερομηνία (${overlap.title}).`
        : null;
    }

    if (!form.from || !form.to) return null;
    const a = isoToKey(form.from);
    const b = isoToKey(form.to);
    if (a > b) return null;

    const overlap = holidays.find((h) => {
      if (h.type === "holiday") {
        const k = isoToKey(h.date);
        return k >= a && k <= b;
      }
      const ha = isoToKey(h.from);
      const hb = isoToKey(h.to);
      return !(b < ha || a > hb);
    });

    return overlap ? `Προσοχή: το εύρος τέμνει υπάρχουσα αργία/εύρος (${overlap.title}).` : null;
  }, [mode, form.date, form.from, form.to, holidays]);

  return (
    <div className="space-y-3">
      {/* Add form */}
      <div className="rounded-xl border border-border/10 bg-secondary-background p-4">
        <div className="text-sm font-semibold text-text-primary">Αργίες</div>
        <div className="text-sm text-text-secondary mt-1">
          Πρόσθεσε αργίες για συγκεκριμένη χρονιά (το έτος ΔΕΝ αγνοείται).
        </div>

        {/* Mode */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setMode("single")}
            className={[
              "px-3 py-2 rounded-lg text-sm font-medium border",
              mode === "single"
                ? "bg-success/25 border-white/20 text-text-primary"
                : "bg-transparent border-white/10 text-text-secondary hover:bg-black/10",
              !canEdit ? "opacity-60" : "",
            ].join(" ")}
          >
            Μία ημέρα
          </button>

          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setMode("range")}
            className={[
              "px-3 py-2 rounded-lg text-sm font-medium border",
              mode === "range"
                ? "bg-success/25 border-white/20 text-text-primary"
                : "bg-transparent border-white/10 text-text-secondary hover:bg-black/10",
              !canEdit ? "opacity-60" : "",
            ].join(" ")}
          >
            Εύρος ημερομηνιών
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-6">
            <label className="text-xs text-text-secondary block mb-1">Ονομασία</label>
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              disabled={!canEdit}
              className="input"
              placeholder="π.χ. Χριστούγεννα"
            />
          </div>

          {mode === "single" ? (
            <div className="md:col-span-4">
              <label className="text-xs text-text-secondary block mb-1">Ημερομηνία</label>
              <AppDatePicker
                valueIso={form.date}
                onChangeIso={(iso) => setForm((p) => ({ ...p, date: iso }))}
                disabled={!canEdit}
              />
            </div>
          ) : (
            <div className="md:col-span-4">
              <label className="text-xs text-text-secondary block mb-1">Από / Έως</label>
              <div className="flex gap-2">
                <AppDatePicker
                  valueIso={form.from}
                  onChangeIso={(iso) =>
                    setForm((p) => {
                      if (iso && p.to && isoToKey(iso) > isoToKey(p.to)) return p;
                      return { ...p, from: iso };
                    })
                  }
                  disabled={!canEdit}
                />

                <AppDatePicker
                  valueIso={form.to}
                  onChangeIso={(iso) =>
                    setForm((p) => {
                      if (iso && p.from && isoToKey(p.from) > isoToKey(iso)) return p;
                      return { ...p, to: iso };
                    })
                  }
                  disabled={!canEdit}
                />
              </div>
            </div>
          )}

          <div className="md:col-span-2 flex items-end">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={form.closed}
                disabled={!canEdit}
                onChange={(e) =>
                  setForm((p) => ({ ...p, closed: e.target.checked, slots: e.target.checked ? [] : p.slots }))
                }
              />
              Κλειστό
            </label>
          </div>
        </div>

        {!form.closed && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/10 p-3">
            <div className="text-xs text-text-secondary mb-2">Ειδικό ωράριο (μόνο πλήρεις ώρες)</div>

            {(form.slots.length ? form.slots : [{ start: "10:00", end: "14:00" }]).map((s, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2 mb-2 last:mb-0">
                <div className="text-xs text-text-secondary w-10">#{idx + 1}</div>

                <select
                  value={s.start}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((p) => {
                      const base = p.slots.length ? p.slots : [{ start: "10:00", end: "14:00" }];
                      const slots = base.map((x, i) => (i === idx ? { ...x, start: v } : x));
                      return { ...p, slots };
                    });
                  }}
                  className="px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-sm text-text-primary disabled:opacity-60"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>

                <span className="text-text-secondary text-sm">→</span>

                <select
                  value={s.end}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((p) => {
                      const base = p.slots.length ? p.slots : [{ start: "10:00", end: "14:00" }];
                      const slots = base.map((x, i) => (i === idx ? { ...x, end: v } : x));
                      return { ...p, slots };
                    });
                  }}
                  className="px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-sm text-text-primary disabled:opacity-60"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => {
                    setForm((p) => {
                      const base = p.slots.length ? p.slots : [{ start: "10:00", end: "14:00" }];
                      const slots = base.filter((_, i) => i !== idx);
                      return { ...p, slots };
                    });
                  }}
                  className="ml-auto px-3 py-2 rounded-lg text-xs font-medium border border-danger/30 bg-danger/10 text-danger disabled:opacity-50"
                >
                  Αφαίρεση
                </button>
              </div>
            ))}

            <button
              type="button"
              disabled={!canEdit}
              onClick={() =>
                setForm((p) => {
                  const base = p.slots.length ? p.slots : [{ start: "10:00", end: "14:00" }];
                  return { ...p, slots: [...base, { start: "10:00", end: "14:00" }] };
                })
              }
              className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-black/20 text-text-primary disabled:opacity-50"
            >
              + Προσθήκη ωραρίου
            </button>
          </div>
        )}

        {hint && <div className="mt-3 text-xs text-warning">{hint}</div>}

        {formError && (
          <div className="mt-3 text-sm border border-danger/30 bg-danger/10 text-danger rounded-lg p-3">
            {formError}
          </div>
        )}

        <div className="mt-4">
          <button
            type="button"
            disabled={!canEdit}
            onClick={addHoliday}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white disabled:opacity-50"
          >
            Προσθήκη αργίας
          </button>
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border border-border/10 bg-secondary-background p-4">
        <div className="text-sm font-semibold text-text-primary mb-3">Λίστα αργιών</div>

        {holidays.length === 0 ? (
          <div className="text-sm text-text-secondary">Δεν έχεις προσθέσει αργίες ακόμα.</div>
        ) : (
          <div className="space-y-3">
            {holidays.map((h) => (
              <div key={h.id} className="rounded-lg border border-border/10 bg-bulk-bg/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold text-text-primary">{h.title}</div>
                    <div className="text-xs text-text-secondary">{formatHolidayLabel(h)}</div>
                    <div className="text-xs px-2 py-1 rounded border border-white/10 bg-danger/20 text-text-primary">
                      {h.closed ? "Κλειστό" : "Ειδικό ωράριο"}
                    </div>
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => {
                        setPushContext({
                          id: h.id,
                          kind: h.type,
                          label: `${h.title} (${formatHolidayLabel(h)})`,
                          ...(h.type === "holiday" ? { date: h.date } : { from: h.from, to: h.to }),
                        });
                        setPushOpen(true);
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-medium border border-white/10 bg-accent/20 text-text-primary hover:bg-accent/30 disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      <Bell size={14} />
                      Push
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => removeHoliday(h.id)}
                    className="px-3 py-2 rounded-lg text-xs font-medium border border-danger/30 bg-danger/10 text-danger disabled:opacity-50"
                  >
                    Διαγραφή
                  </button>
                </div>

                {/* Inline edit */}
                <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-6">
                    <label className="text-xs text-text-secondary block mb-1">Ονομασία</label>
                    <input
                      value={h.title}
                      disabled={!canEdit}
                      onChange={(e) => setHolidayInExceptions({ ...h, title: e.target.value } as HolidayItem)}
                      className="input"
                    />
                  </div>

                  {h.type === "holiday" ? (
                    <div className="md:col-span-4">
                      <label className="text-xs text-text-secondary block mb-1">Ημερομηνία</label>
                      <AppDatePicker
                        valueIso={h.date}
                        disabled={!canEdit}
                        onChangeIso={(iso) => setHolidayInExceptions({ ...h, date: iso } as HolidayItem)}
                      />
                    </div>
                  ) : (
                    <div className="md:col-span-4">
                      <label className="text-xs text-text-secondary block mb-1">Από / Έως</label>
                      <div className="flex gap-2">
                        <AppDatePicker
                          valueIso={h.from}
                          disabled={!canEdit}
                          onChangeIso={(iso) => {
                            if (iso && h.to && isoToKey(iso) > isoToKey(h.to)) return;

                            setHolidayInExceptions({ ...h, from: iso } as HolidayItem);
                          }}
                        />
                        <AppDatePicker
                          valueIso={h.to}
                          disabled={!canEdit}
                          onChangeIso={(iso) => {
                            if (iso && h.from && isoToKey(h.from) > isoToKey(iso)) return;

                            setHolidayInExceptions({ ...h, to: iso } as HolidayItem);
                          }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-text-secondary">
                        (Αν το “Από” είναι μετά το “Έως”, πρώτα άλλαξε το “Έως”.)
                      </div>
                    </div>
                  )}

                  <div className="md:col-span-2 flex items-end">
                    <label className="flex items-center gap-2 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={h.closed}
                        disabled={!canEdit}
                        onChange={(e) =>
                          setHolidayInExceptions({
                            ...h,
                            closed: e.target.checked,
                            slots: e.target.checked
                              ? []
                              : h.slots?.length
                                ? h.slots
                                : [{ start: "10:00", end: "14:00" }],
                          })
                        }
                      />
                      Κλειστό
                    </label>
                  </div>
                </div>

                {!h.closed && (
                  <div className="mt-3 rounded-lg border border-white/10 bg-black/10 p-3">
                    <div className="text-xs text-text-secondary mb-2">Ειδικό ωράριο (μόνο πλήρεις ώρες)</div>

                    {(h.slots?.length ? h.slots : [{ start: "10:00", end: "14:00" }]).map((s, idx) => (
                      <div key={idx} className="flex flex-wrap items-center gap-2 mb-2 last:mb-0">
                        <div className="text-xs text-text-secondary w-10">#{idx + 1}</div>

                        <select
                          value={s.start}
                          disabled={!canEdit}
                          onChange={(e) => {
                            const base = h.slots?.length ? h.slots : [{ start: "10:00", end: "14:00" }];
                            const slots = base.map((x, i) => (i === idx ? { ...x, start: e.target.value } : x));
                            setHolidayInExceptions({ ...h, slots } as HolidayItem);
                          }}
                          className="px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-sm text-text-primary disabled:opacity-60"
                        >
                          {HOURS.map((hr) => (
                            <option key={hr} value={hr}>
                              {hr}
                            </option>
                          ))}
                        </select>

                        <span className="text-text-secondary text-sm">→</span>

                        <select
                          value={s.end}
                          disabled={!canEdit}
                          onChange={(e) => {
                            const base = h.slots?.length ? h.slots : [{ start: "10:00", end: "14:00" }];
                            const slots = base.map((x, i) => (i === idx ? { ...x, end: e.target.value } : x));
                            setHolidayInExceptions({ ...h, slots } as HolidayItem);
                          }}
                          className="px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-sm text-text-primary disabled:opacity-60"
                        >
                          {HOURS.map((hr) => (
                            <option key={hr} value={hr}>
                              {hr}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => {
                            const base = h.slots?.length ? h.slots : [{ start: "10:00", end: "14:00" }];
                            const slots = base.filter((_, i) => i !== idx);
                            setHolidayInExceptions({ ...h, slots } as HolidayItem);
                          }}
                          className="ml-auto px-3 py-2 rounded-lg text-xs font-medium border border-danger/30 bg-danger/10 text-danger disabled:opacity-50"
                        >
                          Αφαίρεση
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => {
                        const base = h.slots?.length ? h.slots : [{ start: "10:00", end: "14:00" }];
                        setHolidayInExceptions({ ...h, slots: [...base, { start: "10:00", end: "14:00" }] } as HolidayItem);
                      }}
                      className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-black/20 text-text-primary disabled:opacity-50"
                    >
                      + Προσθήκη ωραρίου
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {!canEdit && <div className="text-xs text-text-secondary">Δεν έχεις δικαιώματα για επεξεργασία.</div>}

      <SendPushModal
        open={pushOpen}
        onClose={() => {
          setPushOpen(false);
          setPushContext(null);
        }}
        canEdit={canEdit}
        contextLabel={pushContext ? `Αργία: ${pushContext.label}` : "Αργία"}
        defaultTitle={tenant_name ? tenant_name : 'Cloudtec Gym'}
        defaultMessage=""
        onSend={async ({ title, message }) => {
          if (!tenantId) throw new Error("Missing tenantId");

          const { error } = await supabase.functions.invoke("send-push", {
            body: {
              tenant_id: tenantId,
              send_to_all: true,
              title,
              body: message,
              type: "closure", 
              data: {
                kind: pushContext?.kind ?? "closure",
                id: pushContext?.id,
                date: pushContext?.date,
                from: pushContext?.from,
                to: pushContext?.to,
                label: pushContext?.label ?? null,
              },
            },
          });

          if (error) throw error;
        }}
      />

    </div>
  );
}
