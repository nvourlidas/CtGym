import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, ArrowUp, ArrowDown, Loader2, Save,
  ClipboardList, AlertTriangle, CheckCircle2, StickyNote,
  ChevronDown, GripVertical,
} from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';

type QStatus = 'draft' | 'published' | 'archived';
type QType = 'text' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox' | 'rating' | 'date';

type QuestionRow = {
  id: string;
  type: QType;
  label: string;
  required: boolean;
  options: string[];
};

function uid() {
  return crypto?.randomUUID?.() ?? `q_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
function typeNeedsOptions(t: QType) { return t === 'select' || t === 'radio' || t === 'checkbox'; }

const TYPE_LABEL: Record<QType, string> = {
  text:     'Κείμενο (1 γραμμή)',
  textarea: 'Κείμενο (πολλές γραμμές)',
  number:   'Αριθμός',
  select:   'Dropdown',
  radio:    'Επιλογή (1)',
  checkbox: 'Επιλογές (πολλαπλές)',
  rating:   'Βαθμολογία',
  date:     'Ημερομηνία',
};

const STATUS_META: Record<QStatus, { label: string; cls: string }> = {
  published: { label: 'Δημοσιευμένο', cls: 'border-success/35 bg-success/10 text-success' },
  draft:     { label: 'Πρόχειρο',     cls: 'border-warning/35 bg-warning/10 text-warning'  },
  archived:  { label: 'Αρχειοθέτηση', cls: 'border-border/25 bg-secondary/10 text-text-secondary' },
};

function StyledInput({ value, onChange, disabled, placeholder, className = '' }: any) {
  return (
    <input
      value={value} onChange={onChange} disabled={disabled} placeholder={placeholder}
      className={`w-full h-9 px-3.5 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary disabled:opacity-50 ${className}`}
    />
  );
}
function StyledTextarea({ value, onChange, disabled, placeholder, rows = 3 }: any) {
  return (
    <textarea
      value={value} onChange={onChange} disabled={disabled} placeholder={placeholder} rows={rows}
      className="w-full px-3.5 py-2.5 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all resize-none placeholder:text-text-secondary disabled:opacity-50"
    />
  );
}
function StyledSelect({ value, onChange, disabled, children }: any) {
  return (
    <div className="relative">
      <select value={value} onChange={onChange} disabled={disabled}
        className="w-full h-9 pl-3.5 pr-8 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 appearance-none disabled:opacity-50"
      >{children}</select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary pointer-events-none" />
    </div>
  );
}
function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">{label}</label>
      {children}
    </div>
  );
}

export default function QuestionnaireBuilderPage() {
  const { profile, subscription } = useAuth();
  const tenantId = profile?.tenant_id ?? null;
  const navigate  = useNavigate();
  const params    = useParams<{ id: string }>();
  const [search]  = useSearchParams();

  const isNew            = params.id === 'new' || !params.id;
  const questionnaireId  = isNew ? null : params.id!;
  const viewMode         = search.get('mode') === 'view';

  const subscriptionInactive = !subscription?.is_active;
  const [showSubModal, setShowSubModal] = useState(false);
  function requireActive(action: () => void) { if (subscriptionInactive) { setShowSubModal(true); return; } action(); }

  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus]         = useState<QStatus>('draft');
  const [questions, setQuestions]   = useState<QuestionRow[]>([]);

  useEffect(() => {
    if (!tenantId || isNew) return;
    setLoading(true); setError(null);
    (async () => {
      const { data: qData, error: qErr } = await supabase.from('questionnaires').select('id,title,description,status').eq('tenant_id', tenantId).eq('id', questionnaireId).maybeSingle();
      if (qErr) { setError(qErr.message); setLoading(false); return; }
      if (!qData) { setError('Δεν βρέθηκε το ερωτηματολόγιο.'); setLoading(false); return; }
      setTitle(qData.title ?? ''); setDescription(qData.description ?? ''); setStatus((qData.status as QStatus) ?? 'draft');

      const { data: qsData, error: qsErr } = await supabase.from('questionnaire_questions').select('id,type,label,required,options,order_index').eq('tenant_id', tenantId).eq('questionnaire_id', questionnaireId).order('order_index', { ascending: true });
      if (qsErr) { setError(qsErr.message); setQuestions([]); setLoading(false); return; }
      setQuestions(((qsData as any[]) ?? []).map((r) => ({ id: r.id, type: (r.type as QType) ?? 'text', label: r.label ?? '', required: !!r.required, options: Array.isArray(r.options) ? (r.options as any[]).map(String) : [] })));
      setLoading(false);
    })();
  }, [tenantId, isNew, questionnaireId]);

  const canEdit = !viewMode;

  const addQuestion    = () => { if (!canEdit) return; setQuestions((prev) => [...prev, { id: uid(), type: 'text', label: '', required: false, options: [] }]); };
  const updateQuestion = (id: string, patch: Partial<QuestionRow>) => { if (!canEdit) return; setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, ...patch } : q)); };
  const removeQuestion = (id: string) => { if (!canEdit) return; setQuestions((prev) => prev.filter((q) => q.id !== id)); };
  const moveQuestion   = (id: string, dir: -1 | 1) => {
    if (!canEdit) return;
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id); if (idx < 0) return prev;
      const nextIdx = idx + dir; if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev]; const [item] = copy.splice(idx, 1); copy.splice(nextIdx, 0, item); return copy;
    });
  };

  const validationError = useMemo(() => {
    if (!title.trim()) return 'Ο τίτλος είναι υποχρεωτικός.';
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.label.trim()) return `Η ερώτηση #${i + 1} δεν έχει κείμενο.`;
      if (typeNeedsOptions(q.type)) { const opts = (q.options ?? []).map((x) => x.trim()).filter(Boolean); if (opts.length < 2) return `Η ερώτηση #${i + 1} χρειάζεται τουλάχιστον 2 επιλογές.`; }
    }
    return null;
  }, [title, questions]);

  const save = async () => {
    if (!tenantId || !canEdit) return;
    const vErr = validationError; if (vErr) { setError(vErr); return; }
    requireActive(async () => {
      setSaving(true); setError(null);
      try {
        let qid = questionnaireId;
        if (isNew) {
          const { data, error } = await supabase.from('questionnaires').insert({ tenant_id: tenantId, title: title.trim(), description: description.trim() || null, status }).select('id').single();
          if (error) throw error;
          qid = data.id as string;
          navigate(`/questionnaires/${qid}`, { replace: true });
        } else {
          const { error } = await supabase.from('questionnaires').update({ title: title.trim(), description: description.trim() || null, status }).eq('tenant_id', tenantId).eq('id', qid);
          if (error) throw error;
        }
        if (!qid) throw new Error('Missing questionnaire id');
        const { error: delErr } = await supabase.from('questionnaire_questions').delete().eq('tenant_id', tenantId).eq('questionnaire_id', qid);
        if (delErr) throw delErr;
        const payload = questions.map((q, idx) => ({ tenant_id: tenantId, questionnaire_id: qid, type: q.type, label: q.label.trim(), required: !!q.required, options: typeNeedsOptions(q.type) ? (q.options ?? []).map((x) => x.trim()).filter(Boolean) : null, order_index: idx }));
        if (payload.length > 0) { const { error: insErr } = await supabase.from('questionnaire_questions').insert(payload); if (insErr) throw insErr; }
        setSaving(false);
      } catch (e: any) { setSaving(false); setError(e?.message ?? 'Save failed'); }
    });
  };

  const publish = async () => {
    if (!tenantId || !canEdit) return;
    if (isNew) { setStatus('published'); await save(); return; }
    requireActive(async () => {
      setSaving(true); setError(null);
      try {
        const vErr = validationError; if (vErr) { setSaving(false); setError(vErr); return; }
        const { error } = await supabase.from('questionnaires').update({ status: 'published' }).eq('tenant_id', tenantId).eq('id', questionnaireId);
        if (error) throw error;
        setStatus('published'); setSaving(false);
      } catch (e: any) { setSaving(false); setError(e?.message ?? 'Publish failed'); }
    });
  };

  const statusMeta = STATUS_META[status] ?? STATUS_META.draft;

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/questionnaires')}
            title="Πίσω" aria-label="Πίσω"
            className="h-9 w-9 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
              <ClipboardList className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-black text-text-primary tracking-tight">
                {isNew ? 'Νέο Ερωτηματολόγιο' : viewMode ? 'Προβολή Ερωτηματολογίου' : 'Επεξεργασία Ερωτηματολογίου'}
              </h1>
              <p className="text-xs text-text-secondary mt-px">Φτιάξε ερωτήσεις και μετά δημοσίευσε το ερωτηματολόγιο.</p>
            </div>
          </div>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={addQuestion}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />Προσθήκη Ερώτησης
            </button>
            <button type="button" onClick={save} disabled={saving || loading}
              className="group relative inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer disabled:opacity-50 overflow-hidden"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Αποθήκευση
            </button>
            <button type="button" onClick={publish} disabled={saving || loading || status === 'published'}
              title={status === 'published' ? 'Ήδη δημοσιευμένο' : 'Δημοσίευση'}
              className="group relative inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 disabled:opacity-50 transition-all cursor-pointer overflow-hidden"
            >
              <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
              <CheckCircle2 className="h-3.5 w-3.5 relative z-10" />
              <span className="relative z-10">Δημοσίευση</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
          <button onClick={() => setError(null)} className="ml-auto h-5 w-5 rounded-lg flex items-center justify-center opacity-60 hover:opacity-100 cursor-pointer"><span className="text-xs">✕</span></button>
        </div>
      )}

      {/* ── Body: two-column ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">

        {/* Left: meta card */}
        <div className="rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border/10 flex items-center gap-2">
            <StickyNote className="h-3.5 w-3.5 text-text-secondary" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Στοιχεία</span>
            {/* status badge */}
            <span className={`ml-auto text-[10.5px] font-bold px-2.5 py-0.5 rounded-lg border ${statusMeta.cls}`}>{statusMeta.label}</span>
          </div>
          <div className="p-4 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Φόρτωση…</span></div>
            ) : (
              <>
                <FieldLabel label="Τίτλος *">
                  <StyledInput value={title} onChange={(e: any) => setTitle(e.target.value)} disabled={!canEdit} placeholder="π.χ. Ιστορικό Υγείας / PAR-Q" />
                </FieldLabel>

                <FieldLabel label="Περιγραφή (προαιρετικό)">
                  <StyledTextarea value={description} onChange={(e: any) => setDescription(e.target.value)} disabled={!canEdit} placeholder="Τι είναι αυτό το ερωτηματολόγιο και γιατί το συμπληρώνουμε." rows={5} />
                </FieldLabel>

                <FieldLabel label="Κατάσταση">
                  <StyledSelect value={status} onChange={(e: any) => setStatus(e.target.value as QStatus)} disabled={!canEdit}>
                    <option value="draft">Πρόχειρο</option>
                    <option value="published">Δημοσιευμένο</option>
                    <option value="archived">Αρχειοθέτηση</option>
                  </StyledSelect>
                </FieldLabel>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-text-secondary">Ερωτήσεις: <span className="font-bold text-text-primary">{questions.length}</span></span>
                  {validationError && canEdit && (
                    <div className="flex items-center gap-1.5 text-xs text-warning">
                      <AlertTriangle className="h-3 w-3 shrink-0" />{validationError}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: questions editor */}
        <div className="rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border/10 flex items-center gap-2">
            <ClipboardList className="h-3.5 w-3.5 text-text-secondary" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Ερωτήσεις</span>
            <span className="ml-auto text-[11px] text-text-secondary">{questions.length} εγγραφές</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Φόρτωση…</span></div>
          ) : questions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-text-secondary">
              <ClipboardList className="h-8 w-8 opacity-20" />
              <span className="text-sm">Δεν υπάρχουν ερωτήσεις.</span>
              {canEdit && (
                <button type="button" onClick={addQuestion}
                  className="mt-2 inline-flex items-center gap-1.5 h-8 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />Προσθήκη Ερώτησης
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/5">
              {questions.map((q, idx) => (
                <QuestionEditor
                  key={q.id}
                  index={idx}
                  value={q}
                  canEdit={canEdit}
                  onChange={(patch) => updateQuestion(q.id, patch)}
                  onDelete={() => removeQuestion(q.id)}
                  onMoveUp={() => moveQuestion(q.id, -1)}
                  onMoveDown={() => moveQuestion(q.id, +1)}
                  disableMoveUp={idx === 0}
                  disableMoveDown={idx === questions.length - 1}
                />
              ))}

              {canEdit && (
                <div className="px-4 py-3">
                  <button type="button" onClick={addQuestion}
                    className="inline-flex items-center gap-1.5 h-8 px-4 rounded-xl border border-dashed border-border/25 text-sm font-semibold text-text-secondary hover:text-text-primary hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer w-full justify-center"
                  >
                    <Plus className="h-3.5 w-3.5" />Προσθήκη Ερώτησης
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </div>
  );
}

/* ── Question editor row ── */
function QuestionEditor({ index, value, canEdit, onChange, onDelete, onMoveUp, onMoveDown, disableMoveUp, disableMoveDown }: {
  index: number; value: QuestionRow; canEdit: boolean;
  onChange: (patch: Partial<QuestionRow>) => void;
  onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void;
  disableMoveUp: boolean; disableMoveDown: boolean;
}) {
  const needsOptions = typeNeedsOptions(value.type);
  const options = (value.options ?? []).length ? value.options : needsOptions ? [''] : [];

  const setOption    = (i: number, v: string) => { const next = [...options]; next[i] = v; onChange({ options: next }); };
  const addOption    = () => onChange({ options: [...options, ''] });
  const removeOption = (i: number) => onChange({ options: options.filter((_, idx) => idx !== i) });

  return (
    <div className="p-4 hover:bg-secondary/3 transition-colors">
      <div className="flex items-start gap-3">
        {/* Drag handle / index */}
        <div className="shrink-0 flex flex-col items-center gap-0.5 mt-1">
          <span className="text-[10px] font-black text-text-secondary w-6 text-center">{index + 1}</span>
          <GripVertical className="h-3.5 w-3.5 text-border/40" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Type */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Τύπος</label>
              <div className="relative">
                <select
                  value={value.type} disabled={!canEdit}
                  onChange={(e) => { const nextType = e.target.value as QType; onChange({ type: nextType, options: typeNeedsOptions(nextType) ? (value.options?.length ? value.options : ['']) : [] }); }}
                  className="w-full h-9 pl-3.5 pr-8 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 appearance-none disabled:opacity-50"
                >
                  {(Object.keys(TYPE_LABEL) as QType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary pointer-events-none" />
              </div>
            </div>

            {/* Label */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Κείμενο ερώτησης *</label>
              <input
                value={value.label} disabled={!canEdit} onChange={(e) => onChange({ label: e.target.value })}
                placeholder="π.χ. Έχεις κάποιον τραυματισμό;"
                className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary disabled:opacity-50"
              />
            </div>
          </div>

          {/* Required toggle */}
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <div
              className={`relative w-9 h-5 rounded-full border transition-all ${value.required ? 'bg-primary border-primary/60' : 'bg-secondary/20 border-border/20'} ${!canEdit ? 'opacity-50 pointer-events-none' : ''}`}
              onClick={() => canEdit && onChange({ required: !value.required })}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${value.required ? 'left-4' : 'left-0.5'}`} />
            </div>
            <span className="text-xs text-text-secondary">Υποχρεωτική</span>
          </label>

          {/* Options */}
          {needsOptions && (
            <div className="rounded-xl border border-border/10 bg-secondary/5 p-3 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Επιλογές <span className="text-danger">*</span> (τουλάχιστον 2)</div>
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-5 shrink-0 text-right">{i + 1}.</span>
                  <input
                    value={opt} disabled={!canEdit} onChange={(e) => setOption(i, e.target.value)} placeholder={`Επιλογή ${i + 1}`}
                    className="flex-1 h-8 px-3 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all placeholder:text-text-secondary disabled:opacity-50"
                  />
                  {canEdit && (
                    <button type="button" onClick={() => removeOption(i)} disabled={options.length <= 1}
                      className="h-8 w-8 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all disabled:opacity-30 cursor-pointer"
                    ><Trash2 className="h-3 w-3" /></button>
                  )}
                </div>
              ))}
              {canEdit && (
                <button type="button" onClick={addOption}
                  className="inline-flex items-center gap-1 h-7 px-3 rounded-xl border border-dashed border-border/25 text-xs font-semibold text-text-secondary hover:text-text-primary hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer"
                >
                  <Plus className="h-3 w-3" />Επιλογή
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right actions */}
        {canEdit && (
          <div className="shrink-0 flex flex-col items-center gap-1 mt-0.5">
            <button type="button" onClick={onMoveUp} disabled={disableMoveUp} title="Πάνω" aria-label="Πάνω"
              className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all disabled:opacity-30 cursor-pointer"
            ><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={onMoveDown} disabled={disableMoveDown} title="Κάτω" aria-label="Κάτω"
              className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all disabled:opacity-30 cursor-pointer"
            ><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => { if (!confirm('Διαγραφή ερώτησης;')) return; onDelete(); }} title="Διαγραφή" aria-label="Διαγραφή"
              className="h-7 w-7 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all cursor-pointer"
            ><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>
    </div>
  );
}