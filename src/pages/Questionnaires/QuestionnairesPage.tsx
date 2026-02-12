import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import type { LucideIcon } from 'lucide-react';
import {
  Pencil,
  Trash2,
  Loader2,
  Plus,
  CheckCircle2,
  EyeOff,
} from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';
import { useNavigate } from 'react-router-dom';


type QuestionnaireStatus = 'draft' | 'published' | 'archived';

type Questionnaire = {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: QuestionnaireStatus;
  created_at: string;
};

type ToastType = 'success' | 'error' | 'info';

function Toast({
  toast,
  onClose,
}: {
  toast: { type: ToastType; title: string; message?: string } | null;
  onClose: () => void;
}) {
  if (!toast) return null;

  const base =
    'fixed z-[60] right-4 bottom-4 w-[min(420px,calc(100%-32px))] rounded-xl border px-4 py-3 shadow-xl backdrop-blur';
  const cls =
    toast.type === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50'
      : toast.type === 'error'
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-50'
        : 'border-white/15 bg-black/40 text-white';

  return (
    <div className={`${base} ${cls}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{toast.title}</div>
          {toast.message && (
            <div className="mt-0.5 text-xs opacity-90 whitespace-pre-line">
              {toast.message}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md px-2 py-1 text-xs border border-white/15 hover:bg-white/10"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function QuestionnairesPage() {
  const { profile, subscription } = useAuth();
  const navigate = useNavigate();


  const [showSubModal, setShowSubModal] = useState(false);

  const [rows, setRows] = useState<Questionnaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');


  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // question counts per questionnaire
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>(
    {},
  );

  // per-row busy for publish/unpublish
  const [publishBusy, setPublishBusy] = useState<Record<string, boolean>>({});

  // toast
  const [toast, setToast] = useState<{
    type: ToastType;
    title: string;
    message?: string;
  } | null>(null);

  const subscriptionInactive = !subscription?.is_active;

  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) {
      setShowSubModal(true);
      return;
    }
    action();
  }

  function showToast(type: ToastType, title: string, message?: string) {
    setToast({ type, title, message });
    window.clearTimeout((showToast as any)._t);
    (showToast as any)._t = window.setTimeout(() => setToast(null), 2500);
  }

  async function load() {
    if (!profile?.tenant_id) return;

    setLoading(true);

    const { data, error } = await supabase
      .from('questionnaires')
      .select('id, tenant_id, title, description, status, created_at')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false });

    if (error) {
      setRows([]);
      setQuestionCounts({});
      setLoading(false);
      showToast('error', 'Σφάλμα φόρτωσης', error.message);
      return;
    }

    const list = (data as Questionnaire[]) ?? [];
    setRows(list);

    // Load question counts (disable publish if 0)
    // NOTE: assumes table is named "questionnaire_questions"
    // columns: id, tenant_id, questionnaire_id, ... (as we created earlier)
    const { data: qs, error: qErr } = await supabase
      .from('questionnaire_questions')
      .select('questionnaire_id')
      .eq('tenant_id', profile.tenant_id);

    if (!qErr && qs) {
      const map: Record<string, number> = {};
      for (const r of qs as any[]) {
        const id = r.questionnaire_id as string;
        map[id] = (map[id] ?? 0) + 1;
      }
      setQuestionCounts(map);
    } else {
      // if table doesn't exist yet, don’t block UI—just allow publish with warning
      setQuestionCounts({});
      if (qErr) {
        console.warn('questionnaire_questions count error', qErr);
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [profile?.tenant_id]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter(
      (r) =>
        (r.title ?? '').toLowerCase().includes(needle) ||
        (r.description ?? '').toLowerCase().includes(needle) ||
        r.id.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  useEffect(() => {
    setPage(1);
  }, [q, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const startIdx = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(filtered.length, page * pageSize);

  function canPublish(row: Questionnaire) {
    const count = questionCounts[row.id] ?? 0;
    return count > 0;
  }

  async function togglePublish(row: Questionnaire) {
    requireActiveSubscription(async () => {
      const isCurrentlyPublished = row.status === 'published';

      if (isCurrentlyPublished) {
        const ok = confirm(
          'Θέλεις σίγουρα να αποσύρεις αυτό το ερωτηματολόγιο; Θα γίνει “Πρόχειρο” και δεν θα είναι διαθέσιμο για συμπλήρωση.',
        );
        if (!ok) return;
      } else {
        // publish attempt
        if (!canPublish(row)) {
          showToast(
            'error',
            'Δεν μπορεί να δημοσιευτεί',
            'Πρέπει να προσθέσεις τουλάχιστον 1 ερώτηση πριν το δημοσιεύσεις.',
          );
          return;
        }
      }

      const newStatus: QuestionnaireStatus = isCurrentlyPublished
        ? 'draft'
        : 'published';

      // optimistic UI
      setPublishBusy((m) => ({ ...m, [row.id]: true }));
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, status: newStatus } : r)),
      );

      const { error } = await supabase
        .from('questionnaires')
        .update({ status: newStatus })
        .eq('tenant_id', profile?.tenant_id)
        .eq('id', row.id);

      setPublishBusy((m) => ({ ...m, [row.id]: false }));

      if (error) {
        // rollback
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id ? { ...r, status: row.status } : r,
          ),
        );
        showToast('error', 'Αποτυχία ενημέρωσης', error.message);
        return;
      }

      showToast(
        'success',
        newStatus === 'published' ? 'Δημοσιεύτηκε' : 'Αποσύρθηκε',
      );
    });
  }

  async function deleteQuestionnaire(id: string) {
    requireActiveSubscription(async () => {
      if (
        !confirm(
          'Διαγραφή αυτού του ερωτηματολογίου; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.',
        )
      )
        return;

      // optional: you can check status and warn more
      const row = rows.find((r) => r.id === id);
      if (row?.status === 'published') {
        const ok = confirm(
          'Το ερωτηματολόγιο είναι “Δημοσιευμένο”. Θέλεις σίγουρα να το διαγράψεις;',
        );
        if (!ok) return;
      }

      const { error } = await supabase
        .from('questionnaires')
        .delete()
        .eq('tenant_id', profile?.tenant_id)
        .eq('id', id);

      if (error) {
        showToast('error', 'Αποτυχία διαγραφής', error.message);
        return;
      }

      setRows((prev) => prev.filter((r) => r.id !== id));
      setQuestionCounts((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });

      showToast('success', 'Διαγράφηκε');
    });
  }

  return (
    <div className="p-6">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          className="h-9 w-full sm:w-72 rounded-md border border-border/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
          placeholder="Αναζήτηση ερωτηματολογίων…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <button
          className="h-9 w-full sm:w-auto rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white flex items-center justify-center gap-2 sm:ml-auto"
          onClick={() => requireActiveSubscription(() => navigate('/questionnaires/new'))}
        >
          <Plus className="w-4 h-4" />
          Νέο Ερωτηματολόγιο
        </button>
      </div>

      <div className="rounded-md border border-border/10 overflow-hidden">
        {/* DESKTOP */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-210 text-sm">
            <thead className="bg-secondary-background/60">
              <tr className="text-left">
                <Th>Τίτλος</Th>
                <Th>Περιγραφή</Th>
                <Th>Ερωτήσεις</Th>
                <Th>Κατάσταση</Th>
                <Th className="text-right pr-3">Ενέργειες</Th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="px-3 py-4 opacity-60" colSpan={5}>
                    Loading…
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td className="px-3 py-4 opacity-60" colSpan={5}>
                    Δεν υπάρχουν ερωτηματολόγια
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.length > 0 &&
                paginated.map((qq) => {
                  const count = questionCounts[qq.id] ?? 0;
                  const isPublished = qq.status === 'published';
                  const busy = !!publishBusy[qq.id];

                  const badgeClass = isPublished
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-success'
                    : 'border-amber-500/40 bg-amber-500/10 text-warning';

                  const publishDisabled = !isPublished && count === 0;

                  return (
                    <tr
                      key={qq.id}
                      className="border-t border-border/10 hover:bg-secondary/10"
                    >
                      <Td className="font-medium">{qq.title}</Td>
                      <Td className="text-text-secondary">
                        <div className="max-w-xs whitespace-normal wrap-break-word text-xs leading-snug">
                          {qq.description ?? '—'}
                        </div>
                      </Td>

                      <Td>
                        <span className="text-xs">
                          {count}
                          {count === 0 && (
                            <span className="ml-2 text-[11px] text-rose-300/90">
                              (πρόσθεσε 1 για publish)
                            </span>
                          )}
                        </span>
                      </Td>

                      <Td>
                        <span
                          className={[
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs border transition-all duration-200',
                            badgeClass,
                            busy ? 'opacity-70 scale-[0.99]' : 'opacity-100',
                          ].join(' ')}
                        >
                          {isPublished ? 'Δημοσιευμένο' : 'Πρόχειρο'}
                        </span>
                      </Td>

                      <Td className="text-right space-x-1 pr-3">
                        {/* Publish / Unpublish */}
                        <IconButton
                          icon={isPublished ? EyeOff : CheckCircle2}
                          label={isPublished ? 'Απόσυρση' : 'Δημοσίευση'}
                          onClick={() => togglePublish(qq)}
                          disabled={busy || publishDisabled}
                          loading={busy}
                          titleOverride={
                            publishDisabled
                              ? 'Πρέπει να έχει τουλάχιστον 1 ερώτηση για να δημοσιευτεί'
                              : undefined
                          }
                        />

                        {/* Edit */}
                        <IconButton
                          icon={Pencil}
                          label="Επεξεργασία"
                          onClick={() =>
                            requireActiveSubscription(() => navigate(`/questionnaires/${qq.id}`))
                          }
                          disabled={busy}
                        />

                        {/* Delete */}
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/60 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                          onClick={() => deleteQuestionnaire(qq.id)}
                          disabled={busy}
                          aria-label="Διαγραφή"
                          title="Διαγραφή"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Διαγραφή</span>
                        </button>
                      </Td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* MOBILE */}
        <div className="md:hidden divide-y divide-border/10">
          {loading && (
            <div className="px-3 py-4 text-sm opacity-60">Loading…</div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="px-3 py-4 text-sm opacity-60">
              Δεν υπάρχουν ερωτηματολόγια
            </div>
          )}

          {!loading &&
            filtered.length > 0 &&
            paginated.map((qq) => {
              const count = questionCounts[qq.id] ?? 0;
              const isPublished = qq.status === 'published';
              const busy = !!publishBusy[qq.id];
              const publishDisabled = !isPublished && count === 0;

              return (
                <div key={qq.id} className="bg-secondary/5 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {qq.title}
                      </div>
                      <div className="mt-1 text-xs text-text-secondary">
                        {qq.description ?? '—'}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="opacity-80">Ερωτήσεις: {count}</span>

                        <span
                          className={
                            'inline-flex items-center rounded-full px-2 py-0.5 border transition-all duration-200 ' +
                            (isPublished
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                              : 'border-amber-500/40 bg-amber-500/10 text-amber-300')
                          }
                        >
                          {isPublished ? 'Δημοσιευμένο' : 'Πρόχειρο'}
                        </span>

                        {publishDisabled && (
                          <span className="text-rose-300/90">
                            +1 ερώτηση για publish
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <IconButton
                        icon={isPublished ? EyeOff : CheckCircle2}
                        label={isPublished ? 'Απόσυρση' : 'Δημοσίευση'}
                        onClick={() => togglePublish(qq)}
                        disabled={busy || publishDisabled}
                        loading={busy}
                        titleOverride={
                          publishDisabled
                            ? 'Πρέπει να έχει τουλάχιστον 1 ερώτηση για να δημοσιευτεί'
                            : undefined
                        }
                      />
                      <IconButton
                        icon={Pencil}
                        label="Επεξεργασία"
                        onClick={() =>
                           requireActiveSubscription(() => navigate(`/questionnaires/${qq.id}`))
                        }
                        disabled={busy}
                      />
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/60 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                        onClick={() => deleteQuestionnaire(qq.id)}
                        disabled={busy}
                        aria-label="Διαγραφή"
                        title="Διαγραφή"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Διαγραφή</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

          {/* Mobile pagination footer */}
        </div>

        {/* Shared pagination footer */}
        {!loading && filtered.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 py-2 text-xs text-text-secondary border-t border-border/10">
            <div>
              Εμφάνιση <span className="font-semibold">{startIdx}</span>
              {filtered.length > 0 && (
                <>
                  –<span className="font-semibold">{endIdx}</span>
                </>
              )}{' '}
              από <span className="font-semibold">{filtered.length}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                <span>Γραμμές ανά σελίδα:</span>
                <select
                  className="bg-transparent border border-border/10 rounded px-1 py-0.5"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-2 py-1 rounded border border-border/10 disabled:opacity-40"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Προηγ.
                </button>
                <span>
                  Σελίδα <span className="font-semibold">{page}</span> από{' '}
                  <span className="font-semibold">{pageCount}</span>
                </span>
                <button
                  className="px-2 py-1 rounded border border-border/10 disabled:opacity-40"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page === pageCount}
                >
                  Επόμενο
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TODO: keep your Create/Edit modals as you already have them */}
      {/* Example:
        {showCreate && <CreateQuestionnaireModal ... />}
        {editRow && <EditQuestionnaireModal row={editRow} ... />}
      */}

      <SubscriptionRequiredModal
        open={showSubModal}
        onClose={() => setShowSubModal(false)}
      />
    </div>
  );
}

/* small helpers */
function Th({ children, className = '' }: any) {
  return <th className={`px-3 py-2 font-semibold ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: any) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}

function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  loading,
  titleOverride,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  titleOverride?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/10',
        'hover:bg-secondary/20 disabled:opacity-50 disabled:hover:bg-transparent',
        'transition-transform active:scale-[0.98]',
      ].join(' ')}
      aria-label={label}
      title={titleOverride ?? label}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
      <span className="sr-only">{label}</span>
    </button>
  );
}
