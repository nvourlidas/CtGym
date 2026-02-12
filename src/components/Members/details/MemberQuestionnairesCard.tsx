import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';

type QuestionnaireRow = {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: 'draft' | 'published' | 'archived' | string;
  created_at: string;
  updated_at: string;
};

type ResponseRow = {
  id: string;
  questionnaire_id: string;
  submitted_at: string | null;
  status: string | null;
  created_at: string | null;
};

type ResponseItemRow = {
  question_id: string;
  answer_json: any;
};


function fmtDateTimeEL(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('el-GR', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function MemberQuestionnairesCard({
  tenantId,
  memberId,
}: {
  tenantId: string;
  memberId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [qs, setQs] = useState<QuestionnaireRow[]>([]);
  const [respMap, setRespMap] = useState<Map<string, ResponseRow>>(new Map());

  const [qMap, setQMap] = useState<Map<string, { label: string; type: string; order_index: number }>>(new Map());


  const [open, setOpen] = useState(false);
  const [activeQ, setActiveQ] = useState<QuestionnaireRow | null>(null);
  const [activeResp, setActiveResp] = useState<ResponseRow | null>(null);
  const [items, setItems] = useState<ResponseItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsErr, setItemsErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !memberId) return;

    setLoading(true);
    setErr(null);

    try {
      // 1) published questionnaires
      const { data: qData, error: qErr } = await supabase
        .from('questionnaires')
        .select('id, tenant_id, title, description, status, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (qErr) throw new Error(qErr.message);

      const qList = ((qData as any[]) ?? []) as QuestionnaireRow[];
      setQs(qList);

      if (qList.length === 0) {
        setRespMap(new Map());
        return;
      }

      // 2) responses for this member
      const qIds = qList.map((q) => q.id);

      const { data: rData, error: rErr } = await supabase
        .from('questionnaire_responses')
        .select('id, questionnaire_id, submitted_at, status, created_at')
        .eq('tenant_id', tenantId)
        .eq('user_id', memberId)
        .in('questionnaire_id', qIds)
        .order('created_at', { ascending: false }); // newest first

      if (rErr) {
        console.error('responses error', rErr);
        setErr(`Δεν μπορώ να διαβάσω απαντήσεις μέλους (RLS): ${rErr.message}`);
        setRespMap(new Map());
        return;
      }


      const map = new Map<string, ResponseRow>();

      ((rData as any[]) ?? []).forEach((r) => {
        if (!r?.questionnaire_id) return;

        const key = r.questionnaire_id as string;
        const existing = map.get(key);

        // keep the "best" row:
        // 1) prefer one that is submitted (status or submitted_at)
        // 2) otherwise keep the newest (we already ordered desc)
        const rIsSubmitted = !!r.submitted_at || r.status === 'submitted';
        const eIsSubmitted = !!existing?.submitted_at || existing?.status === 'submitted';

        if (!existing) {
          map.set(key, r as ResponseRow);
          return;
        }

        if (rIsSubmitted && !eIsSubmitted) {
          map.set(key, r as ResponseRow);
          return;
        }

        // otherwise keep existing (newest-first order means existing is already newest)
      });

      setRespMap(map);

    } catch (e: any) {
      setErr(e?.message ?? 'Σφάλμα φόρτωσης ερωτηματολογίων');
      setQs([]);
      setRespMap(new Map());
    } finally {
      setLoading(false);
    }
  }, [tenantId, memberId]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    return qs.map((q) => {
      const r = respMap.get(q.id) ?? null;
      return {
        q,
        completed: !!r?.submitted_at || r?.status === 'submitted',
        submitted_at: r?.submitted_at ?? null,
        response_id: r?.id ?? null,
      };
    });
  }, [qs, respMap]);

  const openAnswers = async (q: QuestionnaireRow, r: ResponseRow) => {
    setActiveQ(q);
    setActiveResp(r);
    setItems([]);
    setItemsErr(null);
    setOpen(true);

    setItemsLoading(true);
    try {
      // A) fetch questions (for labels + order)
      const { data: qRows, error: qqErr } = await supabase
        .from('questionnaire_questions')
        .select('id, label, type, order_index')
        .eq('tenant_id', tenantId)
        .eq('questionnaire_id', q.id)
        .order('order_index', { ascending: true });

      if (qqErr) throw new Error(qqErr.message);

      const map = new Map<string, { label: string; type: string; order_index: number }>();
      ((qRows as any[]) ?? []).forEach((row) => {
        map.set(row.id, {
          label: row.label ?? '—',
          type: row.type ?? '—',
          order_index: row.order_index ?? 0,
        });
      });
      setQMap(map);

      // B) fetch response items
      const { data, error } = await supabase
        .from('questionnaire_response_items')
        .select('question_id, answer_json')
        .eq('tenant_id', tenantId)
        .eq('response_id', r.id);

      if (error) throw new Error(error.message);

      const list = ((data as any[]) ?? []) as ResponseItemRow[];

      // sort by question order_index from map
      list.sort((a, b) => {
        const ao = map.get(a.question_id)?.order_index ?? 0;
        const bo = map.get(b.question_id)?.order_index ?? 0;
        return ao - bo;
      });

      setItems(list);
    } catch (e: any) {
      setItemsErr(e?.message ?? 'Σφάλμα φόρτωσης απαντήσεων');
      setItems([]);
      setQMap(new Map());
    } finally {
      setItemsLoading(false);
    }
  };


  const badgeClass = (completed: boolean) =>
    completed
      ? 'border-success/30 bg-success/10 text-success'
      : 'border-warning/30 bg-warning/10 text-warning';

  const formatAnswer = (val: any) => {
    if (val == null) return '—';
    if (Array.isArray(val)) return val.length ? val.join(', ') : '—';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  return (
    <div className="rounded-xl border border-border/10 bg-secondary-background text-text-primary shadow xl:col-span-1 md:col-span-2">
      <div className="border-b border-border/10 px-6 py-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Ερωτηματολόγια</h2>
          <div className="text-xs text-text-secondary mt-0.5">
            Πρόοδος του μέλους στα δημοσιευμένα ερωτηματολόγια.
          </div>
        </div>

        <button
          type="button"
          onClick={load}
          className="px-3 py-1.5 rounded-md text-xs border border-border/10 hover:bg-white/5"
        >
          Ανανέωση
        </button>
      </div>

      <div className="p-6 space-y-3">
        {err && (
          <div className="text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">
            {err}
          </div>
        )}

        {loading ? (
          <div className="rounded-md border border-white/10 bg-black/10 p-4 text-sm opacity-70">
            Φόρτωση…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-white/10 bg-black/10 p-4 text-sm opacity-70">
            Δεν υπάρχουν δημοσιευμένα ερωτηματολόγια.
          </div>
        ) : (
          <div className="rounded-md border border-border/10 overflow-hidden">
            <div className="divide-y divide-border/10">
              {rows.map(({ q, completed, submitted_at }) => {
                const r = respMap.get(q.id) ?? null;

                return (
                  <div key={q.id} className="p-3 hover:bg-secondary/10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{q.title}</div>
                        {!!q.description && (
                          <div className="text-xs text-text-secondary mt-0.5 line-clamp-2">
                            {q.description}
                          </div>
                        )}
                        <div className="mt-1 text-[11px] text-text-secondary">
                          {completed ? `Υποβλήθηκε: ${fmtDateTimeEL(submitted_at)}` : 'Δεν έχει υποβληθεί ακόμα'}
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-2">
                        <span
                          className={[
                            'text-xs px-2 py-1 rounded border capitalize',
                            badgeClass(completed),
                          ].join(' ')}
                        >
                          {completed ? 'Ολοκληρώθηκε' : 'Σε εκκρεμότητα'}
                        </span>

                        {completed && r?.id ? (
                          <button
                            type="button"
                            className="px-3 py-1.5 rounded-md text-xs border border-border/10 hover:bg-white/5"
                            onClick={() => openAnswers(q, r)}
                          >
                            Προβολή απαντήσεων
                          </button>
                        ) : (
                          <span className="text-[11px] text-text-secondary">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-md border border-border/10 bg-secondary-background text-text-primary shadow-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-semibold truncate">{activeQ?.title ?? 'Απαντήσεις'}</div>
                <div className="text-xs text-text-secondary mt-0.5">
                  Υποβλήθηκε: {fmtDateTimeEL(activeResp?.submitted_at ?? null)}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded px-2 py-1 hover:bg-white/5"
              >
                ✕
              </button>
            </div>

            <div className="p-4 max-h-[70vh] overflow-auto">
              {itemsErr && (
                <div className="mb-3 text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">
                  {itemsErr}
                </div>
              )}

              {itemsLoading ? (
                <div className="rounded-md border border-white/10 bg-black/10 p-4 text-sm opacity-70">
                  Φόρτωση απαντήσεων…
                </div>
              ) : items.length === 0 ? (
                <div className="rounded-md border border-white/10 bg-black/10 p-4 text-sm opacity-70">
                  Δεν βρέθηκαν απαντήσεις.
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((it) => {
                    const qq = qMap.get(it.question_id);
                    return (
                      <div key={it.question_id} className="rounded-md border border-border/10 p-3">
                        <div className="text-sm font-semibold">{qq?.label ?? 'Ερώτηση'}</div>
                        <div className="mt-1 text-xs text-text-secondary">
                          Τύπος: {qq?.type ?? '—'}
                        </div>
                        <div className="mt-2 text-sm">{formatAnswer(it.answer_json)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-border/10 flex justify-end gap-2">
              <button
                className="btn-secondary"
                onClick={() => setOpen(false)}
                type="button"
              >
                Κλείσιμο
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
