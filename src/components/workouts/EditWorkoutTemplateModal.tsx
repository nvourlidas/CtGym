import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Loader2, Plus, Search, Trash2, X, ArrowLeft, Save,
  Dumbbell, ChevronRight, User, StickyNote,
} from 'lucide-react';

type Props = { open: boolean; templateId: string; onClose: () => void; onSaved?: () => void };
type WgerCategory  = { id: number; name: string };
type WgerEquipment = { id: number; name: string };
type Coach         = { id: string; full_name: string | null; email?: string | null };
type ExerciseCatalogRow = { wger_id: number; name: string; category_name?: string | null; images?: Array<{ url?: string | null; is_main?: boolean | null }> | null };
type LocalSet      = { key: string; reps: string; weight: string };
type LocalExercise = { wger_id: number; name: string; imageUrl?: string | null; sets: LocalSet[] };

function key() { return `${Date.now()}_${Math.random().toString(16).slice(2)}`; }
function pickMainImageUrl(ex: ExerciseCatalogRow): string | null {
  const imgs = ex.images ?? []; if (!imgs.length) return null;
  const main = imgs.find((i) => i?.is_main && i?.url);
  return (main?.url ?? imgs[0]?.url ?? null) as string | null;
}
const STEP_LABELS = { category: 'Κατηγορία', equipment: 'Εξοπλισμός', exercise: 'Άσκηση' };

export default function EditWorkoutTemplateModal({ open, templateId, onClose, onSaved }: Props) {
  const [step, setStep]   = useState<'category'|'equipment'|'exercise'>('category');
  const [name, setName]   = useState('');
  const [notes, setNotes] = useState('');
  const [coaches, setCoaches]         = useState<Coach[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState('');
  const [categories, setCategories]   = useState<WgerCategory[]>([]);
  const [equipment, setEquipment]     = useState<WgerEquipment[]>([]);
  const [selectedCategory, setSelectedCategory]   = useState<WgerCategory|null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<WgerEquipment|null>(null);
  const [q, setQ]             = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ExerciseCatalogRow[]>([]);
  const [items, setItems]     = useState<LocalExercise[]>([]);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string|null>(null);

  useEffect(() => {
    if (!open || !templateId) return;
    setError(null); setBusy(false); setStep('category');
    setSelectedCategory(null); setSelectedEquipment(null); setQ(''); setResults([]);

    (async () => {
      try {
        const [catsRes, eqRes, coachesRes] = await Promise.all([
          supabase.from('wger_exercise_categories').select('id,name').order('name',{ascending:true}),
          supabase.from('wger_equipment').select('id,name').order('name',{ascending:true}),
          supabase.from('coaches').select('id,full_name,email').order('full_name',{ascending:true}),
        ]);
        if (catsRes.error) throw catsRes.error;
        if (eqRes.error) throw eqRes.error;
        if (coachesRes.error) throw coachesRes.error;
        setCategories((catsRes.data ?? []) as any);
        setEquipment((eqRes.data ?? []) as any);
        setCoaches((coachesRes.data ?? []) as any);

        const { data: tpl, error: tErr } = await supabase.from('workout_templates').select('id,name,notes,coach_id').eq('id', templateId).single();
        if (tErr) throw tErr;
        setName(tpl?.name ?? ''); setNotes(tpl?.notes ?? ''); setSelectedCoachId(tpl?.coach_id ?? '');

        const { data: exRows, error: exErr } = await supabase.from('workout_template_exercises')
          .select('id,exercise_wger_id,sort_order,workout_template_sets(set_no,reps,weight)').eq('template_id', templateId).order('sort_order',{ascending:true});
        if (exErr) throw exErr;

        const wgerIds = (exRows ?? []).map((r: any) => r.exercise_wger_id);
        let namesMap = new Map<number, ExerciseCatalogRow>();
        if (wgerIds.length) {
          const { data: catRows, error: catErr } = await supabase.from('exercise_catalog').select('wger_id,name,category_name,images').in('wger_id', wgerIds);
          if (catErr) throw catErr;
          (catRows ?? []).forEach((r: any) => namesMap.set(r.wger_id, r));
        }

        const local: LocalExercise[] = (exRows ?? []).map((r: any) => {
          const ex = namesMap.get(r.exercise_wger_id);
          const sets = (r.workout_template_sets ?? []).slice().sort((a: any, b: any) => (a.set_no ?? 0) - (b.set_no ?? 0)).map((s: any) => ({ key: key(), reps: s?.reps == null ? '' : String(s.reps), weight: s?.weight == null ? '' : String(s.weight) }));
          return { wger_id: r.exercise_wger_id, name: ex?.name ?? `wger ${r.exercise_wger_id}`, imageUrl: ex ? pickMainImageUrl(ex) : null, sets: sets.length ? sets : [{ key: key(), reps:'', weight:'' }] };
        });
        setItems(local);
      } catch (e: any) { console.error(e); setError(e?.message ?? 'Αποτυχία φόρτωσης template.'); }
    })();
  }, [open, templateId]);

  useEffect(() => {
    if (!open || step !== 'exercise' || !selectedCategory) return;
    const t = setTimeout(async () => {
      try {
        setSearching(true);
        const { data, error } = await supabase.from('exercise_catalog').select('wger_id,name,category_name,images').ilike('name',`%${q.trim()}%`).eq('category_id', selectedCategory.id).order('name',{ascending:true}).limit(60);
        if (error) throw error;
        setResults((data ?? []) as ExerciseCatalogRow[]);
      } catch (e) { console.error(e); setResults([]); } finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [open, step, selectedCategory, selectedEquipment, q]);

  const addExercise    = (ex: ExerciseCatalogRow) => setItems((prev) => prev.some((p) => p.wger_id === ex.wger_id) ? prev : [...prev, { wger_id: ex.wger_id, name: ex.name, imageUrl: pickMainImageUrl(ex), sets: [{ key: key(), reps:'', weight:'' }] }]);
  const removeExercise = (wgerId: number) => setItems((prev) => prev.filter((p) => p.wger_id !== wgerId));
  const addSet    = (wgerId: number) => setItems((prev) => prev.map((ex) => ex.wger_id !== wgerId ? ex : { ...ex, sets: [...ex.sets, { key: key(), reps:'', weight:'' }] }));
  const removeSet = (wgerId: number, setKey: string) => setItems((prev) => prev.map((ex) => { if (ex.wger_id !== wgerId) return ex; const next = ex.sets.filter((s) => s.key !== setKey); return { ...ex, sets: next.length ? next : [{ key: key(), reps:'', weight:'' }] }; }));
  const updateSet = (wgerId: number, setKey: string, field: 'reps'|'weight', value: string) => {
    const clean = value.replace(',','.');
    setItems((prev) => prev.map((ex) => ex.wger_id !== wgerId ? ex : { ...ex, sets: ex.sets.map((s) => s.key === setKey ? { ...s, [field]: clean } : s) }));
  };
  const goBack = () => {
    if (step==='exercise') { setStep('equipment'); setQ(''); setResults([]); return; }
    if (step==='equipment') { setStep('category'); setSelectedEquipment(null); }
  };

  const save = async () => {
    if (!name.trim()) { setError('Βάλε όνομα template.'); return; }
    if (items.length === 0) { setError('Πρόσθεσε τουλάχιστον 1 άσκηση.'); return; }
    try {
      setBusy(true); setError(null);
      const res = await supabase.functions.invoke('workout-template-update', { body: { id: templateId, name: name.trim(), notes: notes.trim()||null, coach_id: selectedCoachId||null, items: items.map((ex) => ({ wger_id: ex.wger_id, sets: ex.sets.map((s) => ({ reps: s.reps, weight: s.weight })) })) } });
      const payload = typeof res.data==='string' ? JSON.parse(res.data) : res.data;
      const errMsg = payload?.error ?? res.error?.message ?? '';
      if (res.error || payload?.error) throw new Error(errMsg || 'Απέτυχε η ενημέρωση template.');
      onSaved?.(); onClose();
    } catch (e: any) { console.error(e); setError(e?.message ?? 'Αποτυχία αποθήκευσης. Δοκίμασε ξανά.'); }
    finally { setBusy(false); }
  };

  const titleRight = useMemo(() => {
    if (step==='category') return 'Επιλογή κατηγορίας';
    if (step==='equipment') return selectedCategory?.name ?? 'Εξοπλισμός';
    return `${selectedCategory?.name ?? ''}${selectedEquipment ? ` · ${selectedEquipment.name}` : ' · All'}`;
  }, [step, selectedCategory, selectedEquipment]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl rounded-2xl border border-border/15 bg-secondary-background text-text-primary shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        <div className="h-0.75 bg-linear-to-r from-accent via-primary to-accent/50 shrink-0" />

        {/* Header */}
        <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
              <Dumbbell className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <div className="text-sm font-black text-text-primary">Επεξεργασία Template</div>
              <div className="text-xs text-text-secondary mt-px">{items.length} ασκήσεις</div>
            </div>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-xl border border-border/10 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer" aria-label="Κλείσιμο"><X className="h-3.5 w-3.5" /></button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0">
          {/* LEFT */}
          <div className="flex flex-col border-b lg:border-b-0 lg:border-r border-border/10 overflow-hidden">
            <div className="p-5 space-y-3 shrink-0">
              <FieldLabel label="Όνομα template *" icon={<Dumbbell className="h-3 w-3" />}>
                <StyledInput value={name} onChange={(e: any) => setName(e.target.value)} placeholder="π.χ. Push Day" />
              </FieldLabel>
              <FieldLabel label="Coach (προαιρετικό)" icon={<User className="h-3 w-3" />}>
                <StyledSelect value={selectedCoachId} onChange={(e: any) => setSelectedCoachId(e.target.value)}>
                  <option value="">— Χωρίς coach —</option>
                  {coaches.map((c) => <option key={c.id} value={c.id}>{(c.full_name ?? 'Coach') + (c.email ? ` · ${c.email}` : '')}</option>)}
                </StyledSelect>
              </FieldLabel>
              <FieldLabel label="Σημειώσεις" icon={<StickyNote className="h-3 w-3" />}>
                <StyledTextarea value={notes} onChange={(e: any) => setNotes(e.target.value)} placeholder="Προαιρετικό…" rows={2} />
              </FieldLabel>

              {error && <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-danger/25 bg-danger/8 text-danger text-xs">{error}</div>}

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-text-secondary">Ασκήσεις: <span className="font-bold text-text-primary">{items.length}</span></span>
                <button type="button" onClick={save} disabled={busy}
                  className="group relative inline-flex items-center gap-1.5 h-8 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm disabled:opacity-50 transition-all cursor-pointer overflow-hidden"
                >
                  <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /> : <Save className="h-3.5 w-3.5 relative z-10" />}
                  <span className="relative z-10">Αποθήκευση</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3 min-h-0">
              {items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-text-secondary rounded-xl border border-border/10 bg-secondary/5">
                  <Dumbbell className="h-7 w-7 opacity-20" />
                  <span className="text-sm">Πρόσθεσε ασκήσεις από δεξιά.</span>
                </div>
              ) : items.map((ex) => (
                <ExerciseCard key={ex.wger_id} ex={ex} onRemoveExercise={removeExercise} onAddSet={addSet} onRemoveSet={removeSet} onUpdateSet={updateSet} />
              ))}
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex flex-col overflow-hidden">
            <div className="px-5 pt-5 pb-3 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {step !== 'category' ? (
                    <button type="button" onClick={goBack} className="h-8 w-8 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer" aria-label="Πίσω"><ArrowLeft className="h-3.5 w-3.5" /></button>
                  ) : <div className="h-8 w-8" />}
                  <span className="text-sm font-black text-text-primary">{titleRight}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                  {(['category','equipment','exercise'] as const).map((s, i) => (
                    <span key={s} className={`flex items-center gap-1 ${step===s?'text-primary font-bold':''}`}>
                      {i>0 && <ChevronRight className="h-3 w-3 opacity-40" />}
                      {STEP_LABELS[s]}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5 min-h-0">
              {step === 'category' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {categories.map((c) => (
                    <button key={c.id} type="button" onClick={() => { setSelectedCategory(c); setSelectedEquipment(null); setStep('equipment'); setQ(''); setResults([]); }}
                      className="rounded-xl border border-border/15 bg-secondary/5 px-3 py-3 text-left hover:bg-secondary/15 hover:border-primary/25 transition-all cursor-pointer"
                    >
                      <div className="text-sm font-bold text-text-primary">{c.name}</div>
                    </button>
                  ))}
                  {categories.length === 0 && <div className="col-span-full text-sm text-text-secondary py-4">Δεν βρέθηκαν κατηγορίες.</div>}
                </div>
              )}

              {step === 'equipment' && (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setSelectedEquipment(null); setStep('exercise'); setQ(''); setResults([]); }}
                    className="rounded-xl border border-border/15 bg-secondary/5 px-3 py-3 text-left hover:bg-secondary/15 hover:border-primary/25 transition-all cursor-pointer"
                  >
                    <div className="text-sm font-bold text-text-primary">All</div>
                    <div className="text-xs text-text-secondary">Όλος ο εξοπλισμός</div>
                  </button>
                  {equipment.map((e) => (
                    <button key={e.id} type="button" onClick={() => { setSelectedEquipment(e); setStep('exercise'); setQ(''); setResults([]); }}
                      className="rounded-xl border border-border/15 bg-secondary/5 px-3 py-3 text-left hover:bg-secondary/15 hover:border-primary/25 transition-all cursor-pointer"
                    >
                      <div className="text-sm font-bold text-text-primary">{e.name}</div>
                    </button>
                  ))}
                </div>
              )}

              {step === 'exercise' && (
                <>
                  <div className="flex items-center gap-2 h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background mb-3">
                    <Search className="h-3.5 w-3.5 text-text-secondary shrink-0" />
                    <input className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-secondary" placeholder="Αναζήτηση ασκήσεων…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
                  </div>
                  {searching ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Αναζήτηση…</span></div>
                  ) : (
                    <div className="space-y-1.5">
                      {results.map((r) => (
                        <button key={r.wger_id} type="button" onClick={() => addExercise(r)}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left flex items-center justify-between gap-3 transition-all cursor-pointer ${items.some((i) => i.wger_id === r.wger_id) ? 'border-primary/35 bg-primary/8 opacity-60' : 'border-border/15 bg-secondary/5 hover:bg-secondary/15 hover:border-primary/25'}`}
                        >
                          <div>
                            <div className="text-sm font-bold text-text-primary">{r.name}</div>
                            <div className="text-xs text-text-secondary">{r.category_name ?? selectedCategory?.name ?? '—'}</div>
                          </div>
                          <Plus className="h-4 w-4 shrink-0 text-text-secondary" />
                        </button>
                      ))}
                      {results.length === 0 && (
                        <div className="rounded-xl border border-border/10 bg-secondary/5 p-4 text-sm text-text-secondary text-center">
                          {q.trim() ? 'Δεν βρέθηκαν αποτελέσματα.' : 'Ξεκίνα να γράφεις για αναζήτηση.'}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border/10 flex items-center justify-between shrink-0 bg-secondary-background/50">
          <button onClick={onClose} disabled={busy} className="h-8 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer disabled:opacity-50">Κλείσιμο</button>
          <div className="text-xs text-text-secondary opacity-60">Tip: κάνε edit και μετά ξανά ανάθεση.</div>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary flex items-center gap-1.5">{icon}{label}</label>
      {children}
    </div>
  );
}
function StyledInput(props: any) {
  return <input {...props} className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary" />;
}
function StyledTextarea(props: any) {
  return <textarea {...props} className="w-full px-3.5 py-2.5 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all resize-none placeholder:text-text-secondary" />;
}
function StyledSelect({ children, ...props }: any) {
  return (
    <div className="relative">
      <select {...props} className="w-full h-9 pl-3.5 pr-8 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 appearance-none">
        {children}
      </select>
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary text-xs">▾</span>
    </div>
  );
}

function ExerciseCard({ ex, onRemoveExercise, onAddSet, onRemoveSet, onUpdateSet }: any) {
  return (
    <div className="rounded-xl border border-border/15 bg-secondary/5 p-3.5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {ex.imageUrl
            ? <img src={ex.imageUrl} className="h-10 w-10 rounded-xl border border-border/15 object-cover shrink-0" alt="" />
            : <div className="h-10 w-10 rounded-xl border border-border/15 bg-secondary/20 flex items-center justify-center shrink-0"><Dumbbell className="h-4 w-4 text-text-secondary opacity-40" /></div>
          }
          <div>
            <div className="text-sm font-bold text-text-primary">{ex.name}</div>
            <div className="text-xs text-text-secondary">{ex.sets.length} sets</div>
          </div>
        </div>
        <button type="button" onClick={() => onRemoveExercise(ex.wger_id)} className="h-7 w-7 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all cursor-pointer"><Trash2 className="h-3 w-3" /></button>
      </div>

      <div className="space-y-1.5">
        <div className="grid grid-cols-[40px_1fr_1fr_32px] gap-2 text-[10px] font-bold uppercase tracking-wider text-text-secondary px-0.5">
          <span>Set</span><span>Reps</span><span>Kg</span><span />
        </div>
        {ex.sets.map((s: any, idx: number) => (
          <div key={s.key} className="grid grid-cols-[40px_1fr_1fr_32px] gap-2 items-center">
            <span className="text-xs font-bold text-text-secondary text-center">{idx + 1}</span>
            <input value={s.reps} onChange={(e: any) => onUpdateSet(ex.wger_id, s.key, 'reps', e.target.value.replace(/[^0-9]/g,''))} placeholder="0"
              className="h-8 px-2 text-center rounded-xl border border-border/15 bg-background text-sm outline-none focus:border-primary/40 transition-all"
            />
            <input value={s.weight} onChange={(e: any) => onUpdateSet(ex.wger_id, s.key, 'weight', e.target.value.replace(/[^0-9.,]/g,''))} placeholder="0"
              className="h-8 px-2 text-center rounded-xl border border-border/15 bg-background text-sm outline-none focus:border-primary/40 transition-all"
            />
            <button type="button" onClick={() => onRemoveSet(ex.wger_id, s.key)} className="h-8 w-8 rounded-xl border border-border/10 flex items-center justify-center text-text-secondary hover:text-danger hover:border-danger/20 transition-all cursor-pointer"><X className="h-3 w-3" /></button>
          </div>
        ))}
      </div>

      <button type="button" onClick={() => onAddSet(ex.wger_id)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:opacity-80 transition-all cursor-pointer">
        <Plus className="h-3 w-3" />Προσθήκη set
      </button>
    </div>
  );
}