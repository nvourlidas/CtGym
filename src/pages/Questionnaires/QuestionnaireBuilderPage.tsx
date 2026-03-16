import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Loader2, Save, ClipboardList, AlertTriangle, CheckCircle2 } from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';
import type { QStatus, QuestionRow } from './builder/types';
import { uid, typeNeedsOptions, STATUS_META } from './builder/builderUtils';
import MetaCard from './builder/components/MetaCard';
import QuestionsPanel from './builder/components/QuestionsPanel';

export default function QuestionnaireBuilderPage() {
  const { profile, subscription } = useAuth();
  const tenantId = profile?.tenant_id ?? null;
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const [search] = useSearchParams();

  const isNew = params.id === 'new' || !params.id;
  const questionnaireId = isNew ? null : params.id!;
  const viewMode = search.get('mode') === 'view';

  const subscriptionInactive = !subscription?.is_active;
  const [showSubModal, setShowSubModal] = useState(false);
  function requireActive(action: () => void) { if (subscriptionInactive) { setShowSubModal(true); return; } action(); }

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<QStatus>('draft');
  const [questions, setQuestions] = useState<QuestionRow[]>([]);

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
      setQuestions(((qsData as any[]) ?? []).map((r) => ({ id: r.id, type: r.type ?? 'text', label: r.label ?? '', required: !!r.required, options: Array.isArray(r.options) ? (r.options as any[]).map(String) : [] })));
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
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/questionnaires')} title="Πίσω" aria-label="Πίσω"
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

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
          <button onClick={() => setError(null)} className="ml-auto h-5 w-5 rounded-lg flex items-center justify-center opacity-60 hover:opacity-100 cursor-pointer"><span className="text-xs">✕</span></button>
        </div>
      )}

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">
        <MetaCard
          loading={loading} title={title} setTitle={setTitle}
          description={description} setDescription={setDescription}
          status={status} setStatus={setStatus}
          canEdit={canEdit} questionsCount={questions.length}
          validationError={validationError} statusMeta={statusMeta}
        />
        <QuestionsPanel
          loading={loading} questions={questions} canEdit={canEdit}
          onAdd={addQuestion} onUpdate={updateQuestion}
          onRemove={removeQuestion} onMove={moveQuestion}
        />
      </div>

      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </div>
  );
}
