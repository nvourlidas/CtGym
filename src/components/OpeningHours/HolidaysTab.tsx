import { useMemo, useState } from "react";
import AppDatePicker from "../ui/AppDatePicker";
import SendPushModal from "./SendPushModal";
import { Bell, Plus, Trash2, AlertTriangle, CalendarDays, ChevronDown } from "lucide-react";
import { supabase } from "../../lib/supabase";

type Slot = { start: string; end: string };
type HolidaySingle = { type:"holiday"; id:string; title:string; date:string; closed:boolean; slots:Slot[] };
type HolidayRange  = { type:"holiday_range"; id:string; title:string; from:string; to:string; closed:boolean; slots:Slot[] };
type HolidayItem   = HolidaySingle | HolidayRange;

type Props = { tenant_name:string|null; tenantId:string|null; exceptions:any[]; setExceptions:(v:any[]|((prev:any[])=>any[]))=>void; canEdit:boolean };

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2,"0")}:00`);

function uid() {
  // @ts-ignore
  return typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():`h_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
function isHolidayItem(x: any): x is HolidayItem { return x?.type==="holiday"||x?.type==="holiday_range"; }
function isoToKey(iso: string) { if(!iso||iso.length<10) return 0; const n=parseInt(iso.slice(0,4)+iso.slice(5,7)+iso.slice(8,10),10); return Number.isFinite(n)?n:0; }
function timeToMinutes(t: string) { const [hh,mm]=t.split(":").map((x)=>parseInt(x,10)); if(Number.isNaN(hh)||Number.isNaN(mm)) return NaN; return hh*60+mm; }
function validateSlots(slots: Slot[]) {
  const errors: string[] = [];
  for (let i=0;i<slots.length;i++) {
    const s=slots[i]; if(!s.start||!s.end){errors.push(`Ωράριο #${i+1}: λείπει ώρα.`);continue;}
    const a=timeToMinutes(s.start),b=timeToMinutes(s.end);
    if(!Number.isFinite(a)||!Number.isFinite(b)){errors.push(`Ωράριο #${i+1}: μη έγκυρη ώρα.`);continue;}
    if(a>=b) errors.push(`Ωράριο #${i+1}: η έναρξη πρέπει να είναι πριν τη λήξη.`);
  }
  const norm=slots.filter((s)=>s.start&&s.end).map((s)=>({...s,a:timeToMinutes(s.start),b:timeToMinutes(s.end)})).filter((s)=>Number.isFinite(s.a)&&Number.isFinite(s.b)).sort((x,y)=>x.a-y.a);
  for(let i=1;i<norm.length;i++){if(norm[i].a<norm[i-1].b) errors.push(`Επικάλυψη ωραρίων (${norm[i-1].start}-${norm[i-1].end}) και (${norm[i].start}-${norm[i].end}).`);}
  return errors;
}
function formatHolidayLabel(h: HolidayItem) { return h.type==="holiday"?h.date:`${h.from} → ${h.to}`; }

function ModeBtn({ active, onClick, disabled, children }: any) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={["h-8 px-4 rounded-xl border text-sm font-semibold transition-all cursor-pointer disabled:opacity-50", active?"bg-primary text-white border-primary shadow-sm shadow-primary/30":"border-border/15 text-text-secondary hover:text-text-primary hover:bg-secondary/30"].join(" ")}
    >{children}</button>
  );
}

function TimeSelect({ value, onChange, disabled }: { value:string; onChange:(v:string)=>void; disabled:boolean }) {
  return (
    <div className="relative">
      <select value={value} disabled={disabled} onChange={(e)=>onChange(e.target.value)}
        className="h-8 pl-3 pr-8 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary appearance-none outline-none focus:border-primary/40 transition-all disabled:opacity-50 cursor-pointer"
      >
        {HOURS.map((h)=><option key={h} value={h} className="bg-secondary-background">{h}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary pointer-events-none" />
    </div>
  );
}

export default function HolidaysTab({ tenantId, tenant_name, exceptions, setExceptions, canEdit }: Props) {
  const holidays = useMemo(() => {
    const list=(Array.isArray(exceptions)?exceptions:[]).filter(isHolidayItem).map((x)=>x as HolidayItem);
    list.sort((a,b)=>{ const ka=a.type==="holiday"?isoToKey(a.date):isoToKey(a.from); const kb=b.type==="holiday"?isoToKey(b.date):isoToKey(b.from); return ka-kb||a.title.localeCompare(b.title); });
    return list;
  }, [exceptions]);

  const [mode, setMode]         = useState<"single"|"range">("single");
  const [form, setForm]         = useState({ title:"", date:"", from:"", to:"", closed:true, slots:[] as Slot[] });
  const [formError, setFormError] = useState<string|null>(null);
  const [pushOpen, setPushOpen] = useState(false);
  const [pushContext, setPushContext] = useState<{ id:string; label:string; kind:"holiday"|"holiday_range"; date?:string; from?:string; to?:string }|null>(null);

  function setHolidayInExceptions(updated: HolidayItem) {
    setExceptions((prev:any[])=>{ const next=[...(Array.isArray(prev)?prev:[])]; const idx=next.findIndex((x)=>isHolidayItem(x)&&x.id===updated.id); if(idx>=0) next[idx]=updated; return next; });
  }
  function removeHoliday(id: string) {
    setExceptions((prev:any[])=>(Array.isArray(prev)?prev:[]).filter((x)=>!(isHolidayItem(x)&&x.id===id)));
  }

  function addHoliday() {
    setFormError(null);
    const title=form.title.trim(); if(!title){setFormError("Γράψε μια ονομασία (π.χ. Χριστούγεννα)."); return;}
    const slots=form.closed?[]:form.slots.length?form.slots:[{start:"10:00",end:"14:00"}];
    if(!form.closed){const errs=validateSlots(slots); if(errs.length){setFormError(errs[0]);return;}}
    if(mode==="single"){
      if(!form.date){setFormError("Επίλεξε ημερομηνία."); return;}
      setExceptions((prev:any[])=>[...(Array.isArray(prev)?prev:[]),{type:"holiday",id:uid(),title,date:form.date,closed:form.closed,slots}as HolidaySingle]);
      setForm({title:"",date:"",from:"",to:"",closed:true,slots:[]}); return;
    }
    if(!form.from||!form.to){setFormError("Επίλεξε 'Από' και 'Έως'."); return;}
    if(isoToKey(form.from)>isoToKey(form.to)){setFormError("Το 'Από' πρέπει να είναι πριν το 'Έως'."); return;}
    setExceptions((prev:any[])=>[...(Array.isArray(prev)?prev:[]),{type:"holiday_range",id:uid(),title,from:form.from,to:form.to,closed:form.closed,slots}as HolidayRange]);
    setForm({title:"",date:"",from:"",to:"",closed:true,slots:[]});
  }

  const hint = useMemo(() => {
    if(mode==="single"){ if(!form.date) return null; const k=isoToKey(form.date); const o=holidays.find((h)=>h.type==="holiday"?isoToKey(h.date)===k:k>=isoToKey(h.from)&&k<=isoToKey(h.to)); return o?`Προσοχή: υπάρχει ήδη αργία που καλύπτει αυτή την ημερομηνία (${o.title}).`:null; }
    if(!form.from||!form.to) return null; const a=isoToKey(form.from); const b=isoToKey(form.to); if(a>b) return null;
    const o=holidays.find((h)=>{ if(h.type==="holiday"){const k=isoToKey(h.date); return k>=a&&k<=b;} const ha=isoToKey(h.from),hb=isoToKey(h.to); return !(b<ha||a>hb); });
    return o?`Προσοχή: το εύρος τέμνει υπάρχουσα αργία (${o.title}).`:null;
  }, [mode, form.date, form.from, form.to, holidays]);

  return (
    <div className="space-y-4">
      {/* ── Add form ── */}
      <div className="rounded-xl border border-border/10 bg-secondary/5 p-4 space-y-4">
        <div>
          <div className="text-sm font-bold text-text-primary">Νέα αργία</div>
          <div className="text-xs text-text-secondary mt-0.5">Πρόσθεσε αργίες για συγκεκριμένη χρονιά (το έτος ΔΕΝ αγνοείται).</div>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl border border-border/15 bg-secondary-background w-fit">
          <ModeBtn active={mode==="single"} onClick={()=>setMode("single")} disabled={!canEdit}>Μία ημέρα</ModeBtn>
          <ModeBtn active={mode==="range"}  onClick={()=>setMode("range")}  disabled={!canEdit}>Εύρος ημερομηνιών</ModeBtn>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5 space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Ονομασία</label>
            <input value={form.title} onChange={(e)=>setForm((p)=>({...p,title:e.target.value}))} disabled={!canEdit} placeholder="π.χ. Χριστούγεννα"
              className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary disabled:opacity-50"
            />
          </div>

          {mode==="single"?(
            <div className="md:col-span-4 space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Ημερομηνία</label>
              <AppDatePicker valueIso={form.date} onChangeIso={(iso)=>setForm((p)=>({...p,date:iso}))} disabled={!canEdit} />
            </div>
          ):(
            <div className="md:col-span-4 space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Από / Έως</label>
              <div className="flex gap-2">
                <AppDatePicker valueIso={form.from} disabled={!canEdit} onChangeIso={(iso)=>setForm((p)=>{ if(iso&&p.to&&isoToKey(iso)>isoToKey(p.to)) return p; return {...p,from:iso}; })} />
                <AppDatePicker valueIso={form.to}   disabled={!canEdit} onChangeIso={(iso)=>setForm((p)=>{ if(iso&&p.from&&isoToKey(p.from)>isoToKey(iso)) return p; return {...p,to:iso}; })} />
              </div>
            </div>
          )}

          <div className="md:col-span-3 flex items-end pb-0.5">
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
              <div className={["relative w-9 h-5 rounded-full border transition-all", form.closed?"bg-primary border-primary/60":"bg-secondary/20 border-border/20"].join(" ")} onClick={()=>!canEdit||setForm((p)=>({...p,closed:!p.closed,slots:!p.closed?[]:p.slots}))}>
                <span className={["absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all", form.closed?"left-4":"left-0.5"].join(" ")} />
              </div>
              Κλειστό
            </label>
          </div>
        </div>

        {/* Special hours for form */}
        {!form.closed && (
          <div className="rounded-xl border border-border/10 bg-secondary-background p-3 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Ειδικό ωράριο</div>
            {(form.slots.length?form.slots:[{start:"10:00",end:"14:00"}]).map((s,idx)=>(
              <div key={idx} className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-text-secondary w-6">#{idx+1}</span>
                <TimeSelect value={s.start} disabled={!canEdit} onChange={(v)=>setForm((p)=>{ const base=p.slots.length?p.slots:[{start:"10:00",end:"14:00"}]; return {...p,slots:base.map((x,i)=>i===idx?{...x,start:v}:x)}; })} />
                <span className="text-text-secondary text-xs">→</span>
                <TimeSelect value={s.end}   disabled={!canEdit} onChange={(v)=>setForm((p)=>{ const base=p.slots.length?p.slots:[{start:"10:00",end:"14:00"}]; return {...p,slots:base.map((x,i)=>i===idx?{...x,end:v}:x)}; })} />
                <button type="button" disabled={!canEdit} onClick={()=>setForm((p)=>{ const base=p.slots.length?p.slots:[{start:"10:00",end:"14:00"}]; return {...p,slots:base.filter((_,i)=>i!==idx)}; })} className="ml-auto h-7 w-7 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all disabled:opacity-40 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
              </div>
            ))}
            <button type="button" disabled={!canEdit} onClick={()=>setForm((p)=>{ const base=p.slots.length?p.slots:[{start:"10:00",end:"14:00"}]; return {...p,slots:[...base,{start:"10:00",end:"14:00"}]}; })} className="inline-flex items-center gap-1 h-7 px-3 rounded-xl border border-border/15 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 disabled:opacity-50 cursor-pointer transition-all"><Plus className="h-3 w-3" />Ωράριο</button>
          </div>
        )}

        {hint && <div className="flex items-center gap-2 text-xs text-warning px-3 py-2 rounded-xl border border-warning/25 bg-warning/8"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{hint}</div>}
        {formError && <div className="flex items-center gap-2 text-xs text-danger px-3 py-2 rounded-xl border border-danger/25 bg-danger/8"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{formError}</div>}

        <button type="button" disabled={!canEdit} onClick={addHoliday}
          className="group relative inline-flex items-center gap-1.5 h-8 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm disabled:opacity-50 transition-all cursor-pointer overflow-hidden"
        >
          <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          <Plus className="h-3.5 w-3.5 relative z-10" /><span className="relative z-10">Προσθήκη αργίας</span>
        </button>
      </div>

      {/* ── List ── */}
      <div className="rounded-xl border border-border/10 bg-secondary-background overflow-hidden">
        <div className="px-4 py-3 border-b border-border/10 flex items-center gap-2">
          <CalendarDays className="h-3.5 w-3.5 text-text-secondary" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Λίστα αργιών</span>
          {holidays.length>0 && <span className="ml-auto text-[11px] text-text-secondary">{holidays.length} εγγραφές</span>}
        </div>

        {holidays.length===0?(
          <div className="flex flex-col items-center gap-2 py-10 text-text-secondary">
            <CalendarDays className="h-7 w-7 opacity-20" />
            <span className="text-sm">Δεν έχεις προσθέσει αργίες ακόμα.</span>
          </div>
        ):(
          <div className="divide-y divide-border/5">
            {holidays.map((h)=>(
              <div key={h.id} className="p-4 space-y-3 hover:bg-secondary/5 transition-colors">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-lg border ${h.closed?"border-danger/35 bg-danger/10 text-danger":"border-success/35 bg-success/10 text-success"}`}>
                      {h.closed?"Κλειστό":"Ειδικό ωράριο"}
                    </span>
                    <span className="text-xs text-text-secondary font-mono">{formatHolidayLabel(h)}</span>
                    <span className="text-sm font-bold text-text-primary">{h.title}</span>
                    {h.type==="holiday_range" && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-lg border border-sky-500/30 bg-sky-500/8 text-sky-400">Εύρος</span>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" disabled={!canEdit} onClick={()=>{ setPushContext({id:h.id,kind:h.type,label:`${h.title} (${formatHolidayLabel(h)})`,...(h.type==="holiday"?{date:h.date}:{from:h.from,to:h.to})}); setPushOpen(true); }} className="inline-flex items-center gap-1.5 h-7 px-3 rounded-xl border border-border/15 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all disabled:opacity-50 cursor-pointer"><Bell className="h-3 w-3" />Ειδοποίηση</button>
                    <button type="button" disabled={!canEdit} onClick={()=>removeHoliday(h.id)} className="h-7 w-7 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all disabled:opacity-40 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>

                {/* Inline edit */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-5 space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Ονομασία</label>
                    <input value={h.title} disabled={!canEdit} onChange={(e)=>setHolidayInExceptions({...h,title:e.target.value}as HolidayItem)} className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all disabled:opacity-50" />
                  </div>
                  {h.type==="holiday"?(
                    <div className="md:col-span-4 space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Ημερομηνία</label>
                      <AppDatePicker valueIso={h.date} disabled={!canEdit} onChangeIso={(iso)=>setHolidayInExceptions({...h,date:iso}as HolidayItem)} />
                    </div>
                  ):(
                    <div className="md:col-span-4 space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Από / Έως</label>
                      <div className="flex gap-2">
                        <AppDatePicker valueIso={h.from} disabled={!canEdit} onChangeIso={(iso)=>{ if(iso&&h.to&&isoToKey(iso)>isoToKey(h.to)) return; setHolidayInExceptions({...h,from:iso}as HolidayItem); }} />
                        <AppDatePicker valueIso={h.to}   disabled={!canEdit} onChangeIso={(iso)=>{ if(iso&&h.from&&isoToKey(h.from)>isoToKey(iso)) return; setHolidayInExceptions({...h,to:iso}as HolidayItem); }} />
                      </div>
                      <div className="text-[10.5px] text-text-secondary opacity-60">(Αν το "Από" είναι μετά το "Έως", πρώτα άλλαξε το "Έως".)</div>
                    </div>
                  )}
                  <div className="md:col-span-3 flex items-end pb-0.5">
                    <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
                      <div className={["relative w-9 h-5 rounded-full border transition-all", h.closed?"bg-primary border-primary/60":"bg-secondary/20 border-border/20"].join(" ")} onClick={()=>!canEdit||setHolidayInExceptions({...h,closed:!h.closed,slots:!h.closed?[]:h.slots?.length?h.slots:[{start:"10:00",end:"14:00"}]})}>
                        <span className={["absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all",h.closed?"left-4":"left-0.5"].join(" ")} />
                      </div>
                      Κλειστό
                    </label>
                  </div>
                </div>

                {/* Special hours for existing */}
                {!h.closed && (
                  <div className="rounded-xl border border-border/10 bg-secondary-background p-3 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Ειδικό ωράριο</div>
                    {(h.slots?.length?h.slots:[{start:"10:00",end:"14:00"}]).map((s,idx)=>(
                      <div key={idx} className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-text-secondary w-6">#{idx+1}</span>
                        <TimeSelect value={s.start} disabled={!canEdit} onChange={(v)=>{ const base=h.slots?.length?h.slots:[{start:"10:00",end:"14:00"}]; setHolidayInExceptions({...h,slots:base.map((x,i)=>i===idx?{...x,start:v}:x)}as HolidayItem); }} />
                        <span className="text-text-secondary text-xs">→</span>
                        <TimeSelect value={s.end}   disabled={!canEdit} onChange={(v)=>{ const base=h.slots?.length?h.slots:[{start:"10:00",end:"14:00"}]; setHolidayInExceptions({...h,slots:base.map((x,i)=>i===idx?{...x,end:v}:x)}as HolidayItem); }} />
                        <button type="button" disabled={!canEdit} onClick={()=>{ const base=h.slots?.length?h.slots:[{start:"10:00",end:"14:00"}]; setHolidayInExceptions({...h,slots:base.filter((_,i)=>i!==idx)}as HolidayItem); }} className="ml-auto h-7 w-7 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all disabled:opacity-40 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    ))}
                    <button type="button" disabled={!canEdit} onClick={()=>{ const base=h.slots?.length?h.slots:[{start:"10:00",end:"14:00"}]; setHolidayInExceptions({...h,slots:[...base,{start:"10:00",end:"14:00"}]}as HolidayItem); }} className="inline-flex items-center gap-1 h-7 px-3 rounded-xl border border-border/15 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 disabled:opacity-50 cursor-pointer transition-all"><Plus className="h-3 w-3" />Ωράριο</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!canEdit && <div className="text-xs text-text-secondary opacity-60">Δεν έχεις δικαιώματα για επεξεργασία.</div>}

      <SendPushModal
        open={pushOpen} onClose={()=>{ setPushOpen(false); setPushContext(null); }} canEdit={canEdit}
        contextLabel={pushContext?`Αργία: ${pushContext.label}`:"Αργία"}
        defaultTitle={tenant_name??'Cloudtec Gym'} defaultMessage=""
        onSend={async({title,message})=>{
          if(!tenantId) throw new Error("Missing tenantId");
          const{error}=await supabase.functions.invoke("send-push",{body:{tenant_id:tenantId,send_to_all:true,title,body:message,type:"closure",data:{kind:pushContext?.kind??"closure",id:pushContext?.id,date:pushContext?.date,from:pushContext?.from,to:pushContext?.to,label:pushContext?.label??null}}});
          if(error) throw error;
        }}
      />
    </div>
  );
}