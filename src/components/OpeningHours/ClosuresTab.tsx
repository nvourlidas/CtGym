import { useMemo, useState } from "react";
import AppDatePicker from "../ui/AppDatePicker";
import SendPushModal from "./SendPushModal";
import { Bell } from "lucide-react";
import { supabase } from "../../lib/supabase";

type ClosureSingle = {
  type: "closure";
  id: string;
  date: string; // YYYY-MM-DD
  title: string; // reason (optional but we store as string)
};

type ClosureRange = {
  type: "closure_range";
  id: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  title: string;
};

type ClosureItem = ClosureSingle | ClosureRange;

type Props = {
  tenantId: string | null;
  tenant_name: string | null;
  exceptions: any[];
  setExceptions: (v: any[] | ((prev: any[]) => any[])) => void;
  canEdit: boolean;
};

function uid() {
  // @ts-ignore
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? // @ts-ignore
    crypto.randomUUID()
    : `c_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function isClosureItem(x: any): x is ClosureItem {
  return x?.type === "closure" || x?.type === "closure_range";
}

function isoToKey(iso: string) {
  // YYYY-MM-DD -> number for sort
  // e.g. 2026-02-03 => 20260203
  if (!iso || iso.length < 10) return 0;
  const y = iso.slice(0, 4);
  const m = iso.slice(5, 7);
  const d = iso.slice(8, 10);
  const n = parseInt(`${y}${m}${d}`, 10);
  return Number.isFinite(n) ? n : 0;
}

function fmtRangeLabel(item: ClosureItem) {
  if (item.type === "closure") return item.date;
  return `${item.from} → ${item.to}`;
}

export default function ClosuresTab({ tenantId, tenant_name, exceptions, setExceptions, canEdit }: Props) {
  const closures = useMemo(() => {
    const list = (Array.isArray(exceptions) ? exceptions : [])
      .filter(isClosureItem)
      .map((x) => x as ClosureItem);

    list.sort((a, b) => {
      const ka = a.type === "closure" ? isoToKey(a.date) : isoToKey(a.from);
      const kb = b.type === "closure" ? isoToKey(b.date) : isoToKey(b.from);
      return ka - kb;
    });

    return list;
  }, [exceptions]);

  const [mode, setMode] = useState<"single" | "range">("single");

  const [form, setForm] = useState<{
    title: string;
    date: string;
    from: string;
    to: string;
  }>({
    title: "",
    date: "",
    from: "",
    to: "",
  });

  const [formError, setFormError] = useState<string | null>(null);

  const [pushOpen, setPushOpen] = useState(false);
  const [pushContext, setPushContext] = useState<{
    id: string;
    label: string;
    kind: "closure" | "closure_range";
    date?: string;
    from?: string;
    to?: string;
  } | null>(null);


  function addClosure() {
    setFormError(null);

    const title = form.title.trim();

    if (mode === "single") {
      if (!form.date) {
        setFormError("Επίλεξε ημερομηνία.");
        return;
      }

      const item: ClosureSingle = {
        type: "closure",
        id: uid(),
        date: form.date,
        title,
      };

      setExceptions((prev: any[]) => {
        const next = Array.isArray(prev) ? [...prev] : [];
        next.push(item);
        return next;
      });

      setForm({ title: "", date: "", from: "", to: "" });
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

    const item: ClosureRange = {
      type: "closure_range",
      id: uid(),
      from: form.from,
      to: form.to,
      title,
    };

    setExceptions((prev: any[]) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      next.push(item);
      return next;
    });

    setForm({ title: "", date: "", from: "", to: "" });
  }

  function removeClosure(id: string) {
    setExceptions((prev: any[]) =>
      (Array.isArray(prev) ? prev : []).filter((x) => !(isClosureItem(x) && x.id === id))
    );
  }

  function updateClosure(updated: ClosureItem) {
    setExceptions((prev: any[]) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      const idx = next.findIndex((x) => isClosureItem(x) && x.id === updated.id);
      if (idx >= 0) next[idx] = updated;
      return next;
    });
  }

  const overlapHint = useMemo(() => {
    if (mode === "single") {
      if (!form.date) return null;
      const k = isoToKey(form.date);

      const overlap = closures.find((c) => {
        if (c.type === "closure") return isoToKey(c.date) === k;
        return k >= isoToKey(c.from) && k <= isoToKey(c.to);
      });

      return overlap ? `Προσοχή: υπάρχει ήδη έκτακτο κλείσιμο που καλύπτει αυτή την ημερομηνία (${overlap.title || "χωρίς λόγο"}).` : null;
    }

    if (!form.from || !form.to) return null;
    const a = isoToKey(form.from);
    const b = isoToKey(form.to);
    if (a > b) return null;

    const overlap = closures.find((c) => {
      if (c.type === "closure") {
        const k = isoToKey(c.date);
        return k >= a && k <= b;
      }
      const ca = isoToKey(c.from);
      const cb = isoToKey(c.to);
      return !(b < ca || a > cb);
    });

    return overlap ? `Προσοχή: το εύρος τέμνει υπάρχον έκτακτο κλείσιμο (${overlap.title || "χωρίς λόγο"}).` : null;
  }, [mode, form.date, form.from, form.to, closures]);

  return (
    <div className="space-y-3">
      {/* Add form */}
      <div className="rounded-xl border border-border/10 bg-secondary-background p-4">
        <div className="text-sm font-semibold text-text-primary">Έκτακτα κλειστό</div>
        <div className="text-sm text-text-secondary mt-1">
          Δήλωσε κλεισίματα συγκεκριμένων ημερομηνιών (μία ημέρα ή εύρος).
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
            <label className="text-xs text-text-secondary block mb-1">Λόγος (προαιρετικό)</label>
            <input
              value={form.title}
              disabled={!canEdit}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="input"
              placeholder="π.χ. Ανακαίνιση, Συντήρηση, Διακοπές"
            />
          </div>

          {mode === "single" ? (
            <div className="md:col-span-6">
              <label className="text-xs text-text-secondary block mb-1">Ημερομηνία</label>
              <AppDatePicker
                valueIso={form.date}
                onChangeIso={(iso) => setForm((p) => ({ ...p, date: iso }))}
                disabled={!canEdit}
              />
            </div>
          ) : (
            <div className="md:col-span-6">
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
        </div>

        {overlapHint && <div className="mt-3 text-xs text-warning">{overlapHint}</div>}

        {formError && (
          <div className="mt-3 text-sm border border-danger/30 bg-danger/10 text-danger rounded-lg p-3">
            {formError}
          </div>
        )}

        <div className="mt-4">
          <button
            type="button"
            disabled={!canEdit}
            onClick={addClosure}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white disabled:opacity-50"
          >
            Προσθήκη
          </button>
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border border-border/10 bg-secondary-background p-4">
        <div className="text-sm font-semibold text-text-primary mb-3">Λίστα έκτακτων κλεισιμάτων</div>

        {closures.length === 0 ? (
          <div className="text-sm text-text-secondary">Δεν έχεις προσθέσει έκτακτα κλεισίματα ακόμα.</div>
        ) : (
          <div className="space-y-3">
            {closures.map((c) => (
              <div key={c.id} className="rounded-lg border border-white/10 bg-bulk-bg/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-text-secondary">{fmtRangeLabel(c)}</div>
                    <div className="text-sm font-semibold text-text-primary">
                      {c.title || "Χωρίς λόγο"}
                    </div>
                    <div className="text-xs px-2 py-1 rounded border border-white/10 bg-warning/20 text-text-primary">
                      {c.type === "closure" ? "Μία ημέρα" : "Εύρος"}
                    </div>
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => {
                        setPushContext({
                          id: c.id,
                          kind: c.type,
                          label: `${c.title} (${fmtRangeLabel(c)})`,
                          ...(c.type === "closure" ? { date: c.date } : { from: c.from, to: c.to }),
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
                    onClick={() => removeClosure(c.id)}
                    className="px-3 py-2 rounded-lg text-xs font-medium border border-danger/30 bg-danger/10 text-danger disabled:opacity-50"
                  >
                    Διαγραφή
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-6">
                    <label className="text-xs text-text-secondary block mb-1">Λόγος</label>
                    <input
                      value={c.title ?? ""}
                      disabled={!canEdit}
                      onChange={(e) => updateClosure({ ...c, title: e.target.value } as ClosureItem)}
                      className="input"
                      placeholder="π.χ. Ανακαίνιση"
                    />
                  </div>

                  {c.type === "closure" ? (
                    <div className="md:col-span-6">
                      <label className="text-xs text-text-secondary block mb-1">Ημερομηνία</label>
                      <AppDatePicker
                        valueIso={c.date}
                        disabled={!canEdit}
                        onChangeIso={(iso) => updateClosure({ ...c, date: iso } as ClosureItem)}
                      />
                    </div>
                  ) : (
                    <div className="md:col-span-6">
                      <label className="text-xs text-text-secondary block mb-1">Από / Έως</label>
                      <div className="flex gap-2">
                        <AppDatePicker
                          valueIso={c.from}
                          disabled={!canEdit}
                          onChangeIso={(iso) => {
                            if (iso && c.to && isoToKey(iso) > isoToKey(c.to)) return;

                            updateClosure({ ...c, from: iso } as ClosureItem);
                          }}
                        />
                        <AppDatePicker
                          valueIso={c.to}
                          disabled={!canEdit}
                          onChangeIso={(iso) => {
                            if (iso && c.from && isoToKey(c.from) > isoToKey(iso)) return;

                            updateClosure({ ...c, to: iso } as ClosureItem);
                          }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-text-secondary">
                        (Αν το “Από” είναι μετά το “Έως”, πρώτα άλλαξε το “Έως”.)
                      </div>
                    </div>
                  )}
                </div>
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
        contextLabel={pushContext ? `Κλειστά: ${pushContext.label}` : "Κλειστά"}
        defaultTitle={tenant_name ? tenant_name : 'Cloudtec Gym'}
        defaultMessage={pushContext ? `Το γυμναστήριο θα παραμείνει κλειστό: ${pushContext.label}` : ""}
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
