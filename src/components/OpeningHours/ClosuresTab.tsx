import { useMemo, useState } from "react";
import AppDatePicker from "../ui/AppDatePicker";
import SendPushModal from "./SendPushModal";
import { Bell, Plus, Trash2, AlertTriangle, CalendarX2 } from "lucide-react";
import { supabase } from "../../lib/supabase";

type ClosureSingle = { type: "closure"; id: string; date: string; title: string };
type ClosureRange  = { type: "closure_range"; id: string; from: string; to: string; title: string };
type ClosureItem   = ClosureSingle | ClosureRange;

type Props = {
  tenantId: string | null; tenant_name: string | null;
  exceptions: any[]; setExceptions: (v: any[] | ((prev: any[]) => any[])) => void; canEdit: boolean;
};

function uid() {
  // @ts-ignore
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `c_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
function isClosureItem(x: any): x is ClosureItem { return x?.type === "closure" || x?.type === "closure_range"; }
function isoToKey(iso: string) { if (!iso || iso.length < 10) return 0; const n = parseInt(iso.slice(0,4)+iso.slice(5,7)+iso.slice(8,10),10); return Number.isFinite(n)?n:0; }
function fmtRangeLabel(item: ClosureItem) { return item.type === "closure" ? item.date : `${item.from} → ${item.to}`; }

function ModeBtn({ active, onClick, disabled, children }: any) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={["h-8 px-4 rounded-xl border text-sm font-semibold transition-all cursor-pointer disabled:opacity-50", active ? "bg-primary text-white border-primary shadow-sm shadow-primary/30" : "border-border/15 text-text-secondary hover:text-text-primary hover:bg-secondary/30"].join(" ")}
    >{children}</button>
  );
}

export default function ClosuresTab({ tenantId, tenant_name, exceptions, setExceptions, canEdit }: Props) {
  const closures = useMemo(() => {
    const list = (Array.isArray(exceptions) ? exceptions : []).filter(isClosureItem).map((x) => x as ClosureItem);
    list.sort((a, b) => { const ka = a.type==="closure"?isoToKey(a.date):isoToKey(a.from); const kb = b.type==="closure"?isoToKey(b.date):isoToKey(b.from); return ka-kb; });
    return list;
  }, [exceptions]);

  const [mode, setMode]         = useState<"single"|"range">("single");
  const [form, setForm]         = useState({ title:"", date:"", from:"", to:"" });
  const [formError, setFormError] = useState<string|null>(null);
  const [pushOpen, setPushOpen] = useState(false);
  const [pushContext, setPushContext] = useState<{ id:string; label:string; kind:"closure"|"closure_range"; date?:string; from?:string; to?:string }|null>(null);

  function addClosure() {
    setFormError(null);
    const title = form.title.trim();
    if (mode === "single") {
      if (!form.date) { setFormError("Επίλεξε ημερομηνία."); return; }
      setExceptions((prev: any[]) => [...(Array.isArray(prev)?prev:[]), { type:"closure", id:uid(), date:form.date, title } as ClosureSingle]);
      setForm({ title:"", date:"", from:"", to:"" }); return;
    }
    if (!form.from||!form.to) { setFormError("Επίλεξε 'Από' και 'Έως'."); return; }
    if (isoToKey(form.from)>isoToKey(form.to)) { setFormError("Το 'Από' πρέπει να είναι πριν το 'Έως'."); return; }
    setExceptions((prev: any[]) => [...(Array.isArray(prev)?prev:[]), { type:"closure_range", id:uid(), from:form.from, to:form.to, title } as ClosureRange]);
    setForm({ title:"", date:"", from:"", to:"" });
  }

  function removeClosure(id: string) {
    setExceptions((prev: any[]) => (Array.isArray(prev)?prev:[]).filter((x) => !(isClosureItem(x)&&x.id===id)));
  }
  function updateClosure(updated: ClosureItem) {
    setExceptions((prev: any[]) => { const next=[...(Array.isArray(prev)?prev:[])]; const idx=next.findIndex((x) => isClosureItem(x)&&x.id===updated.id); if(idx>=0) next[idx]=updated; return next; });
  }

  const overlapHint = useMemo(() => {
    if (mode==="single") {
      if (!form.date) return null;
      const k=isoToKey(form.date);
      const overlap=closures.find((c) => c.type==="closure"?isoToKey(c.date)===k:k>=isoToKey(c.from)&&k<=isoToKey(c.to));
      return overlap?`Προσοχή: υπάρχει ήδη κλείσιμο που καλύπτει αυτή την ημερομηνία (${overlap.title||"χωρίς λόγο"}).`:null;
    }
    if (!form.from||!form.to) return null;
    const a=isoToKey(form.from); const b=isoToKey(form.to); if(a>b) return null;
    const overlap=closures.find((c) => { if(c.type==="closure"){ const k=isoToKey(c.date); return k>=a&&k<=b; } const ca=isoToKey(c.from); const cb=isoToKey(c.to); return !(b<ca||a>cb); });
    return overlap?`Προσοχή: το εύρος τέμνει υπάρχον κλείσιμο (${overlap.title||"χωρίς λόγο"}).`:null;
  }, [mode, form.date, form.from, form.to, closures]);

  return (
    <div className="space-y-4">
      {/* ── Add form ── */}
      <div className="rounded-xl border border-border/10 bg-secondary/5 p-4 space-y-4">
        <div>
          <div className="text-sm font-bold text-text-primary">Νέο έκτακτο κλείσιμο</div>
          <div className="text-xs text-text-secondary mt-0.5">Δήλωσε κλεισίματα συγκεκριμένων ημερομηνιών (μία ημέρα ή εύρος).</div>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 p-1 rounded-xl border border-border/15 bg-secondary-background w-fit">
          <ModeBtn active={mode==="single"} onClick={() => setMode("single")} disabled={!canEdit}>Μία ημέρα</ModeBtn>
          <ModeBtn active={mode==="range"}  onClick={() => setMode("range")}  disabled={!canEdit}>Εύρος ημερομηνιών</ModeBtn>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Λόγος (προαιρετικό)</label>
            <input value={form.title} disabled={!canEdit} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="π.χ. Ανακαίνιση, Συντήρηση"
              className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary disabled:opacity-50"
            />
          </div>

          {mode === "single" ? (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Ημερομηνία</label>
              <AppDatePicker valueIso={form.date} onChangeIso={(iso) => setForm((p) => ({ ...p, date: iso }))} disabled={!canEdit} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Από / Έως</label>
              <div className="flex gap-2">
                <AppDatePicker valueIso={form.from} disabled={!canEdit} onChangeIso={(iso) => setForm((p) => { if(iso&&p.to&&isoToKey(iso)>isoToKey(p.to)) return p; return {...p,from:iso}; })} />
                <AppDatePicker valueIso={form.to}   disabled={!canEdit} onChangeIso={(iso) => setForm((p) => { if(iso&&p.from&&isoToKey(p.from)>isoToKey(iso)) return p; return {...p,to:iso}; })} />
              </div>
            </div>
          )}
        </div>

        {overlapHint && (
          <div className="flex items-center gap-2 text-xs text-warning px-3 py-2 rounded-xl border border-warning/25 bg-warning/8">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{overlapHint}
          </div>
        )}
        {formError && (
          <div className="flex items-center gap-2 text-xs text-danger px-3 py-2 rounded-xl border border-danger/25 bg-danger/8">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{formError}
          </div>
        )}

        <button type="button" disabled={!canEdit} onClick={addClosure}
          className="group relative inline-flex items-center gap-1.5 h-8 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm disabled:opacity-50 transition-all cursor-pointer overflow-hidden"
        >
          <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          <Plus className="h-3.5 w-3.5 relative z-10" /><span className="relative z-10">Προσθήκη</span>
        </button>
      </div>

      {/* ── List ── */}
      <div className="rounded-xl border border-border/10 bg-secondary-background overflow-hidden">
        <div className="px-4 py-3 border-b border-border/10 flex items-center gap-2">
          <CalendarX2 className="h-3.5 w-3.5 text-text-secondary" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Λίστα έκτακτων κλεισιμάτων</span>
          {closures.length > 0 && <span className="ml-auto text-[11px] text-text-secondary">{closures.length} εγγραφές</span>}
        </div>

        {closures.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-text-secondary">
            <CalendarX2 className="h-7 w-7 opacity-20" />
            <span className="text-sm">Δεν έχεις προσθέσει έκτακτα κλεισίματα ακόμα.</span>
          </div>
        ) : (
          <div className="divide-y divide-border/5">
            {closures.map((c) => (
              <div key={c.id} className="p-4 space-y-3 hover:bg-secondary/5 transition-colors">
                {/* Row header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-lg border ${c.type==="closure"?"border-warning/35 bg-warning/10 text-warning":"border-sky-500/35 bg-sky-500/10 text-sky-400"}`}>
                      {c.type==="closure"?"Μία ημέρα":"Εύρος"}
                    </span>
                    <span className="text-xs text-text-secondary font-mono">{fmtRangeLabel(c)}</span>
                    <span className="text-sm font-bold text-text-primary">{c.title||"Χωρίς λόγο"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" disabled={!canEdit} onClick={() => { setPushContext({ id:c.id, kind:c.type, label:`${c.title} (${fmtRangeLabel(c)})`, ...(c.type==="closure"?{date:c.date}:{from:c.from,to:c.to}) }); setPushOpen(true); }}
                      className="inline-flex items-center gap-1.5 h-7 px-3 rounded-xl border border-border/15 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <Bell className="h-3 w-3" />Ειδοποίηση
                    </button>
                    <button type="button" disabled={!canEdit} onClick={() => removeClosure(c.id)}
                      className="h-7 w-7 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all disabled:opacity-40 cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Inline edit */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Λόγος</label>
                    <input value={c.title??""} disabled={!canEdit} onChange={(e) => updateClosure({ ...c, title:e.target.value } as ClosureItem)} placeholder="π.χ. Ανακαίνιση"
                      className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all placeholder:text-text-secondary disabled:opacity-50"
                    />
                  </div>

                  {c.type === "closure" ? (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Ημερομηνία</label>
                      <AppDatePicker valueIso={c.date} disabled={!canEdit} onChangeIso={(iso) => updateClosure({ ...c, date:iso } as ClosureItem)} />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Από / Έως</label>
                      <div className="flex gap-2">
                        <AppDatePicker valueIso={c.from} disabled={!canEdit} onChangeIso={(iso) => { if(iso&&c.to&&isoToKey(iso)>isoToKey(c.to)) return; updateClosure({ ...c, from:iso } as ClosureItem); }} />
                        <AppDatePicker valueIso={c.to}   disabled={!canEdit} onChangeIso={(iso) => { if(iso&&c.from&&isoToKey(c.from)>isoToKey(iso)) return; updateClosure({ ...c, to:iso } as ClosureItem); }} />
                      </div>
                      <div className="text-[10.5px] text-text-secondary opacity-60">(Αν το "Από" είναι μετά το "Έως", πρώτα άλλαξε το "Έως".)</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!canEdit && <div className="text-xs text-text-secondary opacity-60">Δεν έχεις δικαιώματα για επεξεργασία.</div>}

      <SendPushModal
        open={pushOpen} onClose={() => { setPushOpen(false); setPushContext(null); }} canEdit={canEdit}
        contextLabel={pushContext?`Κλειστά: ${pushContext.label}`:"Κλειστά"}
        defaultTitle={tenant_name??'Cloudtec Gym'}
        defaultMessage={pushContext?`Το γυμναστήριο θα παραμείνει κλειστό: ${pushContext.label}`:""}
        onSend={async ({ title, message }) => {
          if (!tenantId) throw new Error("Missing tenantId");
          const { error } = await supabase.functions.invoke("send-push", { body: { tenant_id:tenantId, send_to_all:true, title, body:message, type:"closure", data:{ kind:pushContext?.kind??"closure", id:pushContext?.id, date:pushContext?.date, from:pushContext?.from, to:pushContext?.to, label:pushContext?.label??null } } });
          if (error) throw error;
        }}
      />
    </div>
  );
}