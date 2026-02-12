// src/pages/QuestionnaireBuilderPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ArrowUp, ArrowDown, Loader2, Save } from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';

type QStatus = 'draft' | 'published' | 'archived';
type QType = 'text' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox' | 'rating' | 'date';

type QuestionRow = {
    id: string; // local id (uuid-like string)
    type: QType;
    label: string;
    required: boolean;
    options: string[]; // only for select/radio/checkbox
};

function uid() {
    // ok for client-only ids
    return crypto?.randomUUID?.() ?? `q_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function typeNeedsOptions(t: QType) {
    return t === 'select' || t === 'radio' || t === 'checkbox';
}

const TYPE_LABEL: Record<QType, string> = {
    text: 'Κείμενο (1 γραμμή)',
    textarea: 'Κείμενο (πολλές γραμμές)',
    number: 'Αριθμός',
    select: 'Dropdown',
    radio: 'Επιλογή (1)',
    checkbox: 'Επιλογές (πολλαπλές)',
    rating: 'Βαθμολογία',
    date: 'Ημερομηνία',
};

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

    function requireActiveSubscription(action: () => void) {
        if (subscriptionInactive) {
            setShowSubModal(true);
            return;
        }
        action();
    }

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // questionnaire fields
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState<QStatus>('draft');

    // questions
    const [questions, setQuestions] = useState<QuestionRow[]>([]);

    // load for edit/view
    useEffect(() => {
        if (!tenantId) return;
        if (isNew) return;

        setLoading(true);
        setError(null);

        (async () => {
            const { data: qData, error: qErr } = await supabase
                .from('questionnaires')
                .select('id, title, description, status')
                .eq('tenant_id', tenantId)
                .eq('id', questionnaireId)
                .maybeSingle();

            if (qErr) {
                setError(qErr.message);
                setLoading(false);
                return;
            }
            if (!qData) {
                setError('Δεν βρέθηκε το ερωτηματολόγιο.');
                setLoading(false);
                return;
            }

            setTitle(qData.title ?? '');
            setDescription(qData.description ?? '');
            setStatus((qData.status as QStatus) ?? 'draft');

            const { data: qsData, error: qsErr } = await supabase
                .from('questionnaire_questions')
                .select('id, type, label, required, options, order_index')
                .eq('tenant_id', tenantId)
                .eq('questionnaire_id', questionnaireId)
                .order('order_index', { ascending: true });

            if (qsErr) {
                setError(qsErr.message);
                setQuestions([]);
                setLoading(false);
                return;
            }

            const mapped: QuestionRow[] = ((qsData as any[]) ?? []).map((r) => ({
                id: r.id,
                type: (r.type as QType) ?? 'text',
                label: r.label ?? '',
                required: !!r.required,
                options: Array.isArray(r.options) ? (r.options as any[]).map(String) : [],
            }));

            setQuestions(mapped);
            setLoading(false);
        })();
    }, [tenantId, isNew, questionnaireId]);

    const canEdit = !viewMode;

    const addQuestion = () => {
        if (!canEdit) return;
        setQuestions((prev) => [
            ...prev,
            { id: uid(), type: 'text', label: '', required: false, options: [] },
        ]);
    };

    const updateQuestion = (id: string, patch: Partial<QuestionRow>) => {
        if (!canEdit) return;
        setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
    };

    const removeQuestion = (id: string) => {
        if (!canEdit) return;
        setQuestions((prev) => prev.filter((q) => q.id !== id));
    };

    const moveQuestion = (id: string, dir: -1 | 1) => {
        if (!canEdit) return;
        setQuestions((prev) => {
            const idx = prev.findIndex((q) => q.id === id);
            if (idx < 0) return prev;
            const nextIdx = idx + dir;
            if (nextIdx < 0 || nextIdx >= prev.length) return prev;
            const copy = [...prev];
            const [item] = copy.splice(idx, 1);
            copy.splice(nextIdx, 0, item);
            return copy;
        });
    };

    const validationError = useMemo(() => {
        if (!title.trim()) return 'Ο τίτλος είναι υποχρεωτικός.';
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            if (!q.label.trim()) return `Η ερώτηση #${i + 1} δεν έχει κείμενο.`;
            if (typeNeedsOptions(q.type)) {
                const opts = (q.options ?? []).map((x) => x.trim()).filter(Boolean);
                if (opts.length < 2) return `Η ερώτηση #${i + 1} χρειάζεται τουλάχιστον 2 επιλογές.`;
            }
        }
        return null;
    }, [title, questions]);

    const save = async () => {
        if (!tenantId) return;
        if (!canEdit) return;

        const vErr = validationError;
        if (vErr) {
            setError(vErr);
            return;
        }

        requireActiveSubscription(async () => {
            setSaving(true);
            setError(null);

            try {
                // 1) upsert questionnaire
                let qid = questionnaireId;

                if (isNew) {
                    const { data, error } = await supabase
                        .from('questionnaires')
                        .insert({
                            tenant_id: tenantId,
                            title: title.trim(),
                            description: description.trim() || null,
                            status,
                        })
                        .select('id')
                        .single();

                    if (error) throw error;
                    qid = data.id as string;

                    // replace route to edit mode
                    navigate(`/questionnaires/${qid}`, { replace: true });
                } else {
                    const { error } = await supabase
                        .from('questionnaires')
                        .update({
                            title: title.trim(),
                            description: description.trim() || null,
                            status,
                        })
                        .eq('tenant_id', tenantId)
                        .eq('id', qid);

                    if (error) throw error;
                }

                if (!qid) throw new Error('Missing questionnaire id');

                // 2) replace questions (delete all then insert fresh)
                const { error: delErr } = await supabase
                    .from('questionnaire_questions')
                    .delete()
                    .eq('tenant_id', tenantId)
                    .eq('questionnaire_id', qid);

                if (delErr) throw delErr;

                const payload = questions.map((q, idx) => ({
                    tenant_id: tenantId,
                    questionnaire_id: qid,
                    type: q.type,
                    label: q.label.trim(),
                    required: !!q.required,
                    options: typeNeedsOptions(q.type)
                        ? (q.options ?? []).map((x) => x.trim()).filter(Boolean)
                        : null,
                    order_index: idx,
                }));

                if (payload.length > 0) {
                    const { error: insErr } = await supabase
                        .from('questionnaire_questions')
                        .insert(payload);

                    if (insErr) throw insErr;
                }

                setSaving(false);
            } catch (e: any) {
                setSaving(false);
                setError(e?.message ?? 'Save failed');
            }
        });
    };


    const publish = async () => {
        if (!tenantId) return;
        if (!canEdit) return;

        // if it's new, we must create + save questions first
        if (isNew) {
            setStatus('published');
            await save();
            return;
        }

        requireActiveSubscription(async () => {
            setSaving(true);
            setError(null);
            try {
                // ensure questions are valid before publish
                const vErr = validationError;
                if (vErr) {
                    setSaving(false);
                    setError(vErr);
                    return;
                }

                const { error } = await supabase
                    .from('questionnaires')
                    .update({ status: 'published' })
                    .eq('tenant_id', tenantId)
                    .eq('id', questionnaireId);

                if (error) throw error;

                setStatus('published');
                setSaving(false);
            } catch (e: any) {
                setSaving(false);
                setError(e?.message ?? 'Publish failed');
            }
        });
    };


    return (
        <div className="p-4 md:p-6">
            {/* Header */}
            <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <button
                        type="button"
                        className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/10 hover:bg-secondary/20"
                        onClick={() => navigate('/questionnaires')}
                        title="Πίσω"
                        aria-label="Πίσω"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>

                    <div>
                        <h1 className="text-lg font-semibold">
                            {isNew ? 'Νέο Ερωτηματολόγιο' : viewMode ? 'Προβολή Ερωτηματολογίου' : 'Επεξεργασία Ερωτηματολογίου'}
                        </h1>
                        <div className="text-xs text-text-secondary mt-0.5">
                            Φτιάξτε ερωτήσεις και μετά θα το στείλετε από το mobile (αργότερα).
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {canEdit && (
                        <button
                            type="button"
                            className="h-9 rounded-md px-3 text-sm bg-secondary/30 hover:bg-secondary/40 border border-border/10 inline-flex items-center gap-2"
                            onClick={addQuestion}
                        >
                            <Plus className="h-4 w-4" />
                            Προσθήκη Ερώτησης
                        </button>
                    )}

                    {canEdit && (
                        <button
                            type="button"
                            className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white inline-flex items-center gap-2 disabled:opacity-60"
                            onClick={save}
                            disabled={saving || loading}
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Αποθήκευση
                        </button>
                    )}

                    {canEdit && (
                        <button
                            type="button"
                            className="h-9 rounded-md px-3 text-sm border border-emerald-500/40 bg-emerald-500/10 text-success hover:bg-emerald-500/15 inline-flex items-center gap-2 disabled:opacity-60"
                            onClick={publish}
                            disabled={saving || loading || status === 'published'}
                            title={status === 'published' ? 'Ήδη δημοσιευμένο' : 'Δημοσίευση'}
                        >
                            Δημοσίευση
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="mb-4 text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">
                    {error}
                </div>
            )}

            {/* Body */}
            <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
                {/* Left: questionnaire fields */}
                <div className="rounded-xl border border-border/10 bg-secondary-background text-text-primary shadow p-4">
                    {loading ? (
                        <div className="text-sm opacity-60">Loading…</div>
                    ) : (
                        <>
                            <FormRow label="Τίτλος *">
                                <input
                                    className="input"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    disabled={!canEdit}
                                    placeholder="π.χ. Ιστορικό Υγείας / PAR-Q"
                                />
                            </FormRow>

                            <FormRow label="Περιγραφή (προαιρετικό)">
                                <textarea
                                    className="inputTextArea"
                                    rows={10}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    disabled={!canEdit}
                                    placeholder="Τι είναι αυτό το ερωτηματολόγιο και γιατί το συμπληρώνουμε."
                                />
                            </FormRow>

                            <FormRow label="Κατάσταση">
                                <select
                                    className="input"
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value as QStatus)}
                                    disabled={!canEdit}
                                >
                                    <option value="draft">Draft</option>
                                    <option value="published">Published</option>
                                    <option value="archived">Archived</option>
                                </select>
                            </FormRow>

                            <div className="mt-2 text-xs">
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 border border-border/10 bg-white/5">
                                    Status: <span className="ml-1 font-semibold">{status}</span>
                                </span>
                            </div>


                            <div className="mt-3 text-xs text-text-secondary">
                                {questions.length} ερώτηση(εις)
                                {validationError && canEdit && (
                                    <div className="mt-2 text-amber-300">
                                        ⚠️ {validationError}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Right: questions editor */}
                <div className="rounded-xl border border-border/10 bg-secondary-background text-text-primary shadow overflow-hidden">
                    <div className="border-b border-border/10 px-4 py-3">
                        <div className="text-sm font-semibold">Ερωτήσεις</div>
                        <div className="text-xs text-text-secondary mt-0.5">
                            Reorder, required, options για επιλογές.
                        </div>
                    </div>

                    {loading ? (
                        <div className="p-4 text-sm opacity-60">Loading…</div>
                    ) : questions.length === 0 ? (
                        <div className="p-4 text-sm opacity-60">
                            Δεν υπάρχουν ερωτήσεις. Πατήστε “Προσθήκη Ερώτησης”.
                        </div>
                    ) : (
                        <div className="divide-y divide-border/10">
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
                        </div>
                    )}
                </div>
            </div>

            <SubscriptionRequiredModal
                open={showSubModal}
                onClose={() => setShowSubModal(false)}
            />
        </div>
    );
}

/* ───────────────────────────────────────────────────────────────────────── */

function QuestionEditor({
    index,
    value,
    canEdit,
    onChange,
    onDelete,
    onMoveUp,
    onMoveDown,
    disableMoveUp,
    disableMoveDown,
}: {
    index: number;
    value: QuestionRow;
    canEdit: boolean;
    onChange: (patch: Partial<QuestionRow>) => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    disableMoveUp: boolean;
    disableMoveDown: boolean;
}) {
    const needsOptions = typeNeedsOptions(value.type);

    const options = (value.options ?? []).length ? value.options : needsOptions ? [''] : [];

    const setOption = (i: number, v: string) => {
        const next = [...options];
        next[i] = v;
        onChange({ options: next });
    };

    const addOption = () => onChange({ options: [...options, ''] });

    const removeOption = (i: number) => {
        const next = options.filter((_, idx) => idx !== i);
        onChange({ options: next });
    };

    return (
        <div className="p-4 hover:bg-secondary/10">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-xs text-text-secondary">Ερώτηση #{index + 1}</div>

                    <div className="mt-2 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3">
                        <div>
                            <div className="text-[11px] text-text-secondary mb-1">Τύπος</div>
                            <select
                                className="input"
                                value={value.type}
                                disabled={!canEdit}
                                onChange={(e) => {
                                    const nextType = e.target.value as QType;
                                    onChange({
                                        type: nextType,
                                        options: typeNeedsOptions(nextType) ? (value.options?.length ? value.options : ['']) : [],
                                    });
                                }}
                            >
                                {(Object.keys(TYPE_LABEL) as QType[]).map((t) => (
                                    <option key={t} value={t}>
                                        {TYPE_LABEL[t]}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <div className="text-[11px] text-text-secondary mb-1">Κείμενο ερώτησης *</div>
                            <input
                                className="input"
                                value={value.label}
                                disabled={!canEdit}
                                onChange={(e) => onChange({ label: e.target.value })}
                                placeholder="π.χ. Έχεις κάποιον τραυματισμό;"
                            />
                            <label className="mt-2 inline-flex items-center gap-2 text-xs text-text-secondary">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4"
                                    checked={value.required}
                                    disabled={!canEdit}
                                    onChange={(e) => onChange({ required: e.target.checked })}
                                />
                                Υποχρεωτική
                            </label>
                        </div>
                    </div>

                    {needsOptions && (
                        <div className="mt-3">
                            <div className="text-[11px] text-text-secondary mb-1">Επιλογές (τουλάχιστον 2)</div>
                            <div className="space-y-2">
                                {options.map((opt, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <input
                                            className="input"
                                            value={opt}
                                            disabled={!canEdit}
                                            onChange={(e) => setOption(i, e.target.value)}
                                            placeholder={`Επιλογή ${i + 1}`}
                                        />
                                        {canEdit && (
                                            <button
                                                type="button"
                                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/10 hover:bg-secondary/20"
                                                onClick={() => removeOption(i)}
                                                title="Αφαίρεση επιλογής"
                                                aria-label="Αφαίρεση επιλογής"
                                                disabled={options.length <= 1}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}

                                {canEdit && (
                                    <button
                                        type="button"
                                        className="h-9 rounded-md px-3 text-xs border border-border/10 hover:bg-secondary/20"
                                        onClick={addOption}
                                    >
                                        + Προσθήκη επιλογής
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="shrink-0 flex items-center gap-1">
                    {canEdit && (
                        <>
                            <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/10 hover:bg-secondary/20 disabled:opacity-40"
                                onClick={onMoveUp}
                                disabled={disableMoveUp}
                                title="Πάνω"
                                aria-label="Πάνω"
                            >
                                <ArrowUp className="h-4 w-4" />
                            </button>

                            <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/10 hover:bg-secondary/20 disabled:opacity-40"
                                onClick={onMoveDown}
                                disabled={disableMoveDown}
                                title="Κάτω"
                                aria-label="Κάτω"
                            >
                                <ArrowDown className="h-4 w-4" />
                            </button>

                            <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/60 text-red-400 hover:bg-red-500/10"
                                onClick={() => {
                                    if (!confirm('Διαγραφή ερώτησης;')) return;
                                    onDelete();
                                }}
                                title="Διαγραφή"
                                aria-label="Διαγραφή"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/* small helpers */
function FormRow({ label, children }: any) {
    return (
        <label className="block mb-3">
            <div className="mb-1 text-sm opacity-80">{label}</div>
            {children}
        </label>
    );
}
