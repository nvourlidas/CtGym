import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Plus, Search, Trash2, X, ArrowLeft, Save } from 'lucide-react';

type Props = {
  open: boolean;
  templateId: string;
  onClose: () => void;
  onSaved?: () => void;
};

type WgerCategory = { id: number; name: string };
type WgerEquipment = { id: number; name: string };

type Coach = { id: string; full_name: string | null; email?: string | null };

type ExerciseCatalogRow = {
  wger_id: number;
  name: string;
  category_name?: string | null;
  images?: Array<{ url?: string | null; is_main?: boolean | null }> | null;
};

type LocalSet = { key: string; reps: string; weight: string };
type LocalExercise = {
  wger_id: number;
  name: string;
  imageUrl?: string | null;
  sets: LocalSet[];
};

function key() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function pickMainImageUrl(ex: ExerciseCatalogRow): string | null {
  const imgs = ex.images ?? [];
  if (!imgs.length) return null;
  const main = imgs.find((i) => i?.is_main && i?.url);
  return (main?.url ?? imgs[0]?.url ?? null) as string | null;
}

export default function EditWorkoutTemplateModal({ open, templateId, onClose, onSaved }: Props) {
  const [step, setStep] = useState<'category' | 'equipment' | 'exercise'>('category');

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<string>('');

  const [categories, setCategories] = useState<WgerCategory[]>([]);
  const [equipment, setEquipment] = useState<WgerEquipment[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<WgerCategory | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<WgerEquipment | null>(null);

  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ExerciseCatalogRow[]>([]);

  const [items, setItems] = useState<LocalExercise[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // load all initial data + existing template
  useEffect(() => {
    if (!open) return;
    if (!templateId) return;

    setError(null);
    setBusy(false);
    setStep('category');

    setSelectedCategory(null);
    setSelectedEquipment(null);
    setQ('');
    setResults([]);

    (async () => {
      try {
        // 1) load pickers in parallel
        const [catsRes, eqRes, coachesRes] = await Promise.all([
          supabase.from('wger_exercise_categories').select('id,name').order('name', { ascending: true }),
          supabase.from('wger_equipment').select('id,name').order('name', { ascending: true }),
          supabase.from('coaches').select('id, full_name, email').order('full_name', { ascending: true }),
        ]);

        if (catsRes.error) throw catsRes.error;
        if (eqRes.error) throw eqRes.error;
        if (coachesRes.error) throw coachesRes.error;

        setCategories((catsRes.data ?? []) as any);
        setEquipment((eqRes.data ?? []) as any);
        setCoaches((coachesRes.data ?? []) as any);

        // 2) load template header
        const { data: tpl, error: tErr } = await supabase
          .from('workout_templates')
          .select('id,name,notes,coach_id')
          .eq('id', templateId)
          .single();

        if (tErr) throw tErr;

        setName(tpl?.name ?? '');
        setNotes(tpl?.notes ?? '');
        setSelectedCoachId(tpl?.coach_id ?? '');

        // 3) load template exercises + sets
        const { data: exRows, error: exErr } = await supabase
          .from('workout_template_exercises')
          .select('id, exercise_wger_id, sort_order, workout_template_sets(set_no, reps, weight)')
          .eq('template_id', templateId)
          .order('sort_order', { ascending: true });

        if (exErr) throw exErr;

        const wgerIds = (exRows ?? []).map((r: any) => r.exercise_wger_id);
        let namesMap = new Map<number, ExerciseCatalogRow>();

        if (wgerIds.length) {
          // fetch names/images for these exercises
          const { data: catRows, error: catErr } = await supabase
            .from('exercise_catalog')
            .select('wger_id,name,category_name,images')
            .in('wger_id', wgerIds);

          if (catErr) throw catErr;

          (catRows ?? []).forEach((r: any) => namesMap.set(r.wger_id, r));
        }

        const local: LocalExercise[] = (exRows ?? []).map((r: any) => {
          const ex = namesMap.get(r.exercise_wger_id);
          const sets = (r.workout_template_sets ?? [])
            .slice()
            .sort((a: any, b: any) => (a.set_no ?? 0) - (b.set_no ?? 0))
            .map((s: any) => ({
              key: key(),
              reps: s?.reps == null ? '' : String(s.reps),
              weight: s?.weight == null ? '' : String(s.weight),
            }));

          return {
            wger_id: r.exercise_wger_id,
            name: ex?.name ?? `wger ${r.exercise_wger_id}`,
            imageUrl: ex ? pickMainImageUrl(ex) : null,
            sets: sets.length ? sets : [{ key: key(), reps: '', weight: '' }],
          };
        });

        setItems(local);
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? 'Αποτυχία φόρτωσης template.');
      }
    })();
  }, [open, templateId]);

  // search exercises (same as create)
  useEffect(() => {
    if (!open) return;
    if (step !== 'exercise') return;
    if (!selectedCategory) return;

    const t = setTimeout(async () => {
      try {
        setSearching(true);

        const { data, error } = await supabase
          .from('exercise_catalog')
          .select('wger_id,name,category_name,images')
          .ilike('name', `%${q.trim()}%`)
          .eq('category_id', selectedCategory.id)
          .order('name', { ascending: true })
          .limit(60);

        if (error) throw error;

        let filtered = (data ?? []) as ExerciseCatalogRow[];
        if (selectedEquipment) {
          // adapt if you actually have equipment_id on exercise_catalog
          filtered = filtered.filter(() => true);
        }

        setResults(filtered);
      } catch (e) {
        console.error(e);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [open, step, selectedCategory, selectedEquipment, q]);

  const addExercise = (ex: ExerciseCatalogRow) => {
    setItems((prev) => {
      if (prev.some((p) => p.wger_id === ex.wger_id)) return prev;
      return [
        ...prev,
        {
          wger_id: ex.wger_id,
          name: ex.name,
          imageUrl: pickMainImageUrl(ex),
          sets: [{ key: key(), reps: '', weight: '' }],
        },
      ];
    });
  };

  const removeExercise = (wgerId: number) => {
    setItems((prev) => prev.filter((p) => p.wger_id !== wgerId));
  };

  const addSet = (wgerId: number) => {
    setItems((prev) =>
      prev.map((ex) =>
        ex.wger_id === wgerId ? { ...ex, sets: [...ex.sets, { key: key(), reps: '', weight: '' }] } : ex,
      ),
    );
  };

  const removeSet = (wgerId: number, setKey: string) => {
    setItems((prev) =>
      prev.map((ex) => {
        if (ex.wger_id !== wgerId) return ex;
        const next = ex.sets.filter((s) => s.key !== setKey);
        return { ...ex, sets: next.length ? next : [{ key: key(), reps: '', weight: '' }] };
      }),
    );
  };

  const updateSet = (wgerId: number, setKey: string, field: 'reps' | 'weight', value: string) => {
    const clean = value.replace(',', '.');
    setItems((prev) =>
      prev.map((ex) => {
        if (ex.wger_id !== wgerId) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s) => (s.key === setKey ? { ...s, [field]: clean } : s)),
        };
      }),
    );
  };

  const goBack = () => {
    if (step === 'exercise') {
      setStep('equipment');
      setQ('');
      setResults([]);
      return;
    }
    if (step === 'equipment') {
      setStep('category');
      setSelectedEquipment(null);
      return;
    }
  };

  const save = async () => {
    if (!name.trim()) {
      setError('Βάλε όνομα template.');
      return;
    }
    if (items.length === 0) {
      setError('Πρόσθεσε τουλάχιστον 1 άσκηση.');
      return;
    }

    try {
      setBusy(true);
      setError(null);

      const res = await supabase.functions.invoke('workout-template-update', {
        body: {
          id: templateId,
          name: name.trim(),
          notes: notes.trim() || null,
          coach_id: selectedCoachId || null,
          items: items.map((ex) => ({
            wger_id: ex.wger_id,
            sets: ex.sets.map((s) => ({ reps: s.reps, weight: s.weight })),
          })),
        },
      });

      const payload = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      const errMsg = payload?.error ?? res.error?.message ?? '';
      if (res.error || payload?.error) throw new Error(errMsg || 'Απέτυχε η ενημέρωση template.');

      onSaved?.();
      onClose();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? 'Αποτυχία αποθήκευσης. Δοκίμασε ξανά.');
    } finally {
      setBusy(false);
    }
  };

  const titleRight = useMemo(() => {
    if (step === 'category') return 'Επιλογή κατηγορίας';
    if (step === 'equipment') return selectedCategory?.name ?? 'Εξοπλισμός';
    return `${selectedCategory?.name ?? ''}${selectedEquipment ? ` · ${selectedEquipment.name}` : ' · All'}`;
  }, [step, selectedCategory, selectedEquipment]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl rounded-md border border-white/10 bg-secondary-background text-text-primary shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="font-semibold">Επεξεργασία Template</div>
          <button onClick={onClose} className="rounded px-2 py-1 hover:bg-white/5" aria-label="Κλείσιμο">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* LEFT */}
          <div className="p-4 border-b lg:border-b-0 lg:border-r border-white/10">
            <div className="grid gap-3">
              <label className="block">
                <div className="mb-1 text-sm opacity-80">Όνομα template *</div>
                <input
                  className="input w-full"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="π.χ. Push Day"
                />
              </label>

              <label className="block">
                <div className="mb-1 text-sm opacity-80">Coach (προαιρετικό)</div>
                <select className="input w-full" value={selectedCoachId} onChange={(e) => setSelectedCoachId(e.target.value)}>
                  <option value="">— Χωρίς coach —</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {(c.full_name ?? 'Coach') + (c.email ? ` · ${c.email}` : '')}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="mb-1 text-sm opacity-80">Σημειώσεις</div>
                <textarea
                  className="input w-full"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Προαιρετικό…"
                />
              </label>

              <div className="flex items-center justify-between">
                <div className="text-sm opacity-80">
                  Ασκήσεις: <span className="font-semibold">{items.length}</span>
                </div>
                <button
                  type="button"
                  onClick={save}
                  disabled={busy}
                  className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Αποθήκευση
                </button>
              </div>

              {error && <div className="text-sm text-orange-400">{error}</div>}
            </div>

            {/* Builder list (scrollable) */}
            <div className="mt-4 max-h-[60vh] overflow-auto pr-1 space-y-3">
              {items.length === 0 ? (
                <div className="rounded-md border border-white/10 bg-secondary/5 p-4 text-sm text-text-secondary">
                  Πρόσθεσε ασκήσεις από δεξιά για να χτίσεις το template.
                </div>
              ) : (
                items.map((ex) => (
                  <div key={ex.wger_id} className="rounded-md border border-white/10 bg-secondary/5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {ex.imageUrl ? (
                          <img src={ex.imageUrl} className="h-10 w-10 rounded-md border border-white/10 object-cover" alt="" />
                        ) : (
                          <div className="h-10 w-10 rounded-md border border-white/10 bg-secondary/20" />
                        )}

                        <div>
                          <div className="font-semibold text-sm">{ex.name}</div>
                          <div className="text-xs text-text-secondary">wger_id: {ex.wger_id}</div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/60 text-red-400 hover:bg-red-500/10"
                        onClick={() => removeExercise(ex.wger_id)}
                        aria-label="Αφαίρεση άσκησης"
                        title="Αφαίρεση άσκησης"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-[60px_1fr_1fr_36px] gap-2 text-xs text-text-secondary">
                      <div>Set</div>
                      <div>Reps</div>
                      <div>Kg</div>
                      <div />
                    </div>

                    <div className="mt-2 space-y-2">
                      {ex.sets.map((s, idx) => (
                        <div key={s.key} className="grid grid-cols-[60px_1fr_1fr_36px] gap-2 items-center">
                          <div className="text-sm font-semibold">{idx + 1}</div>

                          <input
                            className="input h-9 text-center"
                            value={s.reps}
                            onChange={(e) =>
                              updateSet(ex.wger_id, s.key, 'reps', e.target.value.replace(/[^0-9]/g, ''))
                            }
                            placeholder="0"
                          />

                          <input
                            className="input h-9 text-center"
                            value={s.weight}
                            onChange={(e) =>
                              updateSet(ex.wger_id, s.key, 'weight', e.target.value.replace(/[^0-9.,]/g, ''))
                            }
                            placeholder="0"
                          />

                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 hover:bg-secondary/20"
                            onClick={() => removeSet(ex.wger_id, s.key)}
                            aria-label="Αφαίρεση set"
                            title="Αφαίρεση set"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="mt-3 inline-flex items-center gap-2 text-sm text-accent hover:opacity-90"
                      onClick={() => addSet(ex.wger_id)}
                    >
                      <Plus className="h-4 w-4" />
                      Προσθήκη set
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {step !== 'category' ? (
                  <button
                    type="button"
                    onClick={goBack}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 hover:bg-secondary/20"
                    aria-label="Πίσω"
                    title="Πίσω"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="h-9 w-9" />
                )}

                <div className="font-semibold">{titleRight}</div>
              </div>

              <div className="text-xs text-text-secondary">
                Βήμα: <span className="font-semibold">{step}</span>
              </div>
            </div>

            {step === 'category' && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="rounded-md border border-white/10 bg-secondary/5 px-3 py-3 text-left hover:bg-secondary/10"
                    onClick={() => {
                      setSelectedCategory(c);
                      setSelectedEquipment(null);
                      setStep('equipment');
                      setQ('');
                      setResults([]);
                    }}
                  >
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div className="text-xs text-text-secondary">id: {c.id}</div>
                  </button>
                ))}

                {categories.length === 0 && (
                  <div className="col-span-full rounded-md border border-white/10 bg-secondary/5 p-4 text-sm text-text-secondary">
                    Δεν βρέθηκαν κατηγορίες.
                  </div>
                )}
              </div>
            )}

            {step === 'equipment' && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="rounded-md border border-white/10 bg-secondary/5 px-3 py-3 text-left hover:bg-secondary/10"
                  onClick={() => {
                    setSelectedEquipment(null);
                    setStep('exercise');
                    setQ('');
                    setResults([]);
                  }}
                >
                  <div className="text-sm font-semibold">All</div>
                  <div className="text-xs text-text-secondary">Όλος ο εξοπλισμός</div>
                </button>

                {equipment.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="rounded-md border border-white/10 bg-secondary/5 px-3 py-3 text-left hover:bg-secondary/10"
                    onClick={() => {
                      setSelectedEquipment(e);
                      setStep('exercise');
                      setQ('');
                      setResults([]);
                    }}
                  >
                    <div className="text-sm font-semibold">{e.name}</div>
                    <div className="text-xs text-text-secondary">id: {e.id}</div>
                  </button>
                ))}
              </div>
            )}

            {step === 'exercise' && (
              <>
                <div className="mt-4 flex items-center gap-2 rounded-md border border-white/10 bg-secondary-background px-3 h-9">
                  <Search className="h-4 w-4 opacity-70" />
                  <input
                    className="w-full bg-transparent outline-none text-sm placeholder:text-text-secondary"
                    placeholder="Αναζήτηση ασκήσεων…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="mt-3">
                  {searching ? (
                    <div className="flex items-center gap-2 text-sm text-text-secondary py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Αναζήτηση…
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
                      {results.map((r) => (
                        <button
                          key={r.wger_id}
                          type="button"
                          className="w-full rounded-md border border-white/10 bg-secondary/5 px-3 py-3 text-left hover:bg-secondary/10 flex items-center justify-between gap-3"
                          onClick={() => addExercise(r)}
                        >
                          <div>
                            <div className="text-sm font-semibold">{r.name}</div>
                            <div className="text-xs text-text-secondary">
                              {r.category_name ?? selectedCategory?.name ?? '—'} · wger_id: {r.wger_id}
                            </div>
                          </div>
                          <Plus className="h-4 w-4 opacity-70" />
                        </button>
                      ))}

                      {results.length === 0 && (
                        <div className="rounded-md border border-white/10 bg-secondary/5 p-4 text-sm text-text-secondary">
                          {q.trim() ? 'Δεν βρέθηκαν αποτελέσματα.' : 'Ξεκίνα να γράφεις για αναζήτηση.'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Κλείσιμο
          </button>

          <div className="text-xs text-text-secondary">Tip: κάνε edit και μετά ξανά ανάθεση.</div>
        </div>
      </div>
    </div>
  );
}
