import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { ClipboardList, RefreshCw, Loader2, CheckCircle2, Clock, Eye, X, AlertTriangle, FileQuestion } from 'lucide-react';

type QuestionnaireRow = {
  id: string; tenant_id: string; title: string;
  description: string | null;
  status: 'draft' | 'published' | 'archived' | string;
  created_at: string; updated_at: string;
};

type ResponseRow = {
  id: string; questionnaire_id: string;
  submitted_at: string | null; status: string | null; created_at: string | null;
};

type ResponseItemRow = { question_id: string; answer_json: any };

function fmtDateTimeEL(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('el-GR', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function MemberQuestionnairesCard({
  tenantId, memberId,
}: {
  tenantId: string;
  memberId: string;
}) {
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState<string | null>(null);
  const [qs, setQs]             = useState<QuestionnaireRow[]>([]);
  const [respMap, setRespMap]   = useState<Map<string, ResponseRow>>(new Map());

  const [qMap, setQMap]         = useState<Map<string, { label: string; type: string; order_index: number }>>(new Map());
  const [open, setOpen]         = useState(false);
  const [activeQ, setActiveQ]   = useState<QuestionnaireRow | null>(null);
  const [activeResp, setActiveResp] = useState<ResponseRow | null>(null);
  const [items, setItems]       = useState<ResponseItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsErr, setItemsErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !memberId) return;
    setLoading(true); setErr(null);
    try {
      const { data: qData, error: qErr } = await supabase
        .from('questionnaires')
        .select('id,tenant_id,title,description,status,created_at,updated_at')
        .eq('tenant_id', tenantId).eq('status', 'published')
        .order('created_at', { ascending: false });
      if (qErr) throw new Error(qErr.message);

      const qList = ((qData as any[]) ?? []) as QuestionnaireRow[];
      setQs(qList);
      if (!qList.length) { setRespMap(new Map()); return; }

      const { data: rData, error: rErr } = await supabase
        .from('questionnaire_responses')
        .select('id,questionnaire_id,submitted_at,status,created_at')
        .eq('tenant_id', tenantId).eq('user_id', memberId)
        .in('questionnaire_id', qList.map((q) => q.id))
        .order('created_at', { ascending: false });

      if (rErr) {
        setErr(`Δεν μπορώ να διαβάσω απαντήσεις μέλους (RLS): ${rErr.message}`);
        setRespMap(new Map()); return;
      }

      const map = new Map<string, ResponseRow>();
      ((rData as any[]) ?? []).forEach((r) => {
        if (!r?.questionnaire_id) return;
        const key = r.questionnaire_id as string;
        const existing = map.get(key);
        const rIsSubmitted = !!r.submitted_at || r.status === 'submitted';
        const eIsSubmitted = !!existing?.submitted_at || existing?.status === 'submitted';
        if (!existing) { map.set(key, r as ResponseRow); return; }
        if (rIsSubmitted && !eIsSubmitted) { map.set(key, r as ResponseRow); }
      });
      setRespMap(map);
    } catch (e: any) {
      setErr(e?.message ?? 'Σφάλμα φόρτωσης ερωτηματολογίων');
      setQs([]); setRespMap(new Map());
    } finally {
      setLoading(false);
    }
  }, [tenantId, memberId]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() =>
    qs.map((q) => {
      const r = respMap.get(q.id) ?? null;
      return {
        q, completed: !!r?.submitted_at || r?.status === 'submitted',
        submitted_at: r?.submitted_at ?? null, response_id: r?.id ?? null,
      };
    }), [qs, respMap]);

  const openAnswers = async (q: QuestionnaireRow, r: ResponseRow) => {
    setActiveQ(q); setActiveResp(r); setItems([]); setItemsErr(null); setOpen(true);
    setItemsLoading(true);
    try {
      const { data: qRows, error: qqErr } = await supabase
        .from('questionnaire_questions')
        .select('id,label,type,order_index')
        .eq('tenant_id', tenantId).eq('questionnaire_id', q.id)
        .order('order_index', { ascending: true });
      if (qqErr) throw new Error(qqErr.message);

      const map = new Map<string, { label: string; type: string; order_index: number }>();
      ((qRows as any[]) ?? []).forEach((row) =>
        map.set(row.id, { label: row.label ?? '—', type: row.type ?? '—', order_index: row.order_index ?? 0 }));
      setQMap(map);

      const { data, error } = await supabase
        .from('questionnaire_response_items')
        .select('question_id,answer_json')
        .eq('tenant_id', tenantId).eq('response_id', r.id);
      if (error) throw new Error(error.message);

      const list = ((data as any[]) ?? []) as ResponseItemRow[];
      list.sort((a, b) => (map.get(a.question_id)?.order_index ?? 0) - (map.get(b.question_id)?.order_index ?? 0));
      setItems(list);
    } catch (e: any) {
      setItemsErr(e?.message ?? 'Σφάλμα φόρτωσης απαντήσεων');
      setItems([]); setQMap(new Map());
    } finally {
      setItemsLoading(false);
    }
  };

  const formatAnswer = (val: any) => {
    if (val == null) return '—';
    if (Array.isArray(val)) return val.length ? val.join(', ') : '—';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  // Counts for the header summary
  const completedCount = rows.filter((r) => r.completed).length;

  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-sm xl:col-span-1 md:col-span-2 overflow-hidden">

      {/* ── Header ── */}
      <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <ClipboardList className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-black text-text-primary tracking-tight">Ερωτηματολόγια</h2>
            <p className="text-[11px] text-text-secondary mt-px">
              {loading ? '…' : `${completedCount} / ${rows.length} ολοκληρωμένα`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="h-8 w-8 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 disabled:opacity-40 transition-all cursor-pointer"
          title="Ανανέωση"
        >
          <RefreshCw className={['h-3.5 w-3.5', loading ? 'animate-spin' : ''].join(' ')} />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="p-5 space-y-3">
        {err && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
            {err}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-text-secondary text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Φόρτωση…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-text-secondary">
            <FileQuestion className="h-8 w-8 opacity-30" />
            <span className="text-sm">Δεν υπάρχουν δημοσιευμένα ερωτηματολόγια.</span>
          </div>
        ) : (
          <div className="rounded-xl border border-border/10 overflow-hidden divide-y divide-border/10">
            {rows.map(({ q, completed, submitted_at }) => {
              const r = respMap.get(q.id) ?? null;
              return (
                <div key={q.id} className="px-4 py-3.5 hover:bg-secondary/5 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {completed
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                          : <Clock        className="h-3.5 w-3.5 text-warning shrink-0" />
                        }
                        <span className="text-sm font-semibold text-text-primary truncate">{q.title}</span>
                      </div>

                      {q.description && (
                        <p className="text-xs text-text-secondary mt-1 line-clamp-2 leading-relaxed pl-5">
                          {q.description}
                        </p>
                      )}

                      <div className="mt-1.5 pl-5 text-[10.5px] text-text-secondary">
                        {completed
                          ? `Υποβλήθηκε: ${fmtDateTimeEL(submitted_at)}`
                          : 'Δεν έχει υποβληθεί ακόμα'}
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-2">
                      <span className={[
                        'inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-lg border font-semibold',
                        completed
                          ? 'border-success/25 bg-success/10 text-success'
                          : 'border-warning/25 bg-warning/10 text-warning',
                      ].join(' ')}>
                        {completed ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {completed ? 'Ολοκληρώθηκε' : 'Εκκρεμεί'}
                      </span>

                      {completed && r?.id ? (
                        <button
                          type="button"
                          onClick={() => openAnswers(q, r)}
                          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border/15 text-[11px] font-medium text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
                        >
                          <Eye className="h-3 w-3" />
                          Απαντήσεις
                        </button>
                      ) : (
                        <span className="text-[11px] text-text-secondary opacity-40">—</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Answers modal ── */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-2xl rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-2xl overflow-hidden"
            style={{ animation: 'modalIn 0.2s ease' }}
          >
            {/* Modal top bar */}
            <div className="h-0.75 w-full bg-linear-to-r from-primary/0 via-primary to-primary/0" />

            {/* Modal header */}
            <div className="px-5 py-4 border-b border-border/10 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary shrink-0" />
                  <h3 className="font-black text-text-primary truncate tracking-tight">{activeQ?.title ?? 'Απαντήσεις'}</h3>
                </div>
                <p className="text-xs text-text-secondary mt-1 ml-6">
                  Υποβλήθηκε: {fmtDateTimeEL(activeResp?.submitted_at ?? null)}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-xl border border-border/10 hover:bg-secondary/30 text-text-secondary hover:text-text-primary transition-all cursor-pointer shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-5 max-h-[65vh] overflow-auto space-y-3">
              {itemsErr && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
                  {itemsErr}
                </div>
              )}

              {itemsLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-text-secondary text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Φόρτωση απαντήσεων…
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-text-secondary">
                  <FileQuestion className="h-7 w-7 opacity-30" />
                  <span className="text-sm">Δεν βρέθηκαν απαντήσεις.</span>
                </div>
              ) : (
                items.map((it, idx) => {
                  const qq = qMap.get(it.question_id);
                  return (
                    <div key={it.question_id} className="rounded-xl border border-border/10 bg-secondary/5 overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-border/10 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-md bg-primary/15 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-sm font-semibold text-text-primary truncate">{qq?.label ?? 'Ερώτηση'}</span>
                        </div>
                        {qq?.type && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-border/15 bg-secondary/30 text-text-secondary font-medium shrink-0">
                            {qq.type}
                          </span>
                        )}
                      </div>
                      <div className="px-4 py-3 text-sm text-text-primary leading-relaxed">
                        {formatAnswer(it.answer_json)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal footer */}
            <div className="px-5 py-3.5 border-t border-border/10 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-8 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
              >
                Κλείσιμο
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
}