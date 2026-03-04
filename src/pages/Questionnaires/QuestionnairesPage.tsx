import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import type { LucideIcon } from 'lucide-react';
import {
  Pencil, Trash2, Loader2, Plus, CheckCircle2, EyeOff,
  ClipboardList, Search, X, ChevronLeft, ChevronRight, ChevronDown,
  CheckCircle, AlertTriangle,
} from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';
import { useNavigate } from 'react-router-dom';
import PlanGate from "../../components/billing/PlanGate";

type QuestionnaireStatus = 'draft' | 'published' | 'archived';
type Questionnaire = { id: string; tenant_id: string; title: string; description: string | null; status: QuestionnaireStatus; created_at: string };
type ToastType = 'success' | 'error' | 'info';

function Toast({ toast, onClose }: { toast: { type: ToastType; title: string; message?: string } | null; onClose: () => void }) {
  if (!toast) return null;
  const cls = toast.type === 'success'
    ? 'border-success/30 bg-success/10 text-success'
    : toast.type === 'error'
      ? 'border-danger/30 bg-danger/10 text-danger'
      : 'border-border/20 bg-secondary-background text-text-primary';
  const Icon = toast.type === 'success' ? CheckCircle : AlertTriangle;
  return (
    <div className={`fixed z-60 right-4 bottom-4 w-[min(420px,calc(100%-32px))] rounded-xl border px-4 py-3 shadow-xl backdrop-blur-sm flex items-start gap-3 ${cls}`}>
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold">{toast.title}</div>
        {toast.message && <div className="mt-0.5 text-xs opacity-80 whitespace-pre-line">{toast.message}</div>}
      </div>
      <button type="button" onClick={onClose} className="shrink-0 h-5 w-5 rounded-lg flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity cursor-pointer">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const STATUS_META: Record<QuestionnaireStatus, { label: string; cls: string }> = {
  published: { label: 'Δημοσιευμένο', cls: 'border-success/35 bg-success/10 text-success' },
  draft:     { label: 'Πρόχειρο',     cls: 'border-warning/35 bg-warning/10 text-warning'  },
  archived:  { label: 'Αρχειοθέτηση', cls: 'border-border/25 bg-secondary/10 text-text-secondary' },
};

export default function QuestionnairesPage() {
  const { profile, subscription } = useAuth();
  const navigate = useNavigate();

  const tier = String((subscription as any)?.plan_id ?? (subscription as any)?.plan_name ?? (subscription as any)?.name ?? "").toLowerCase();
  const isPro = tier.includes("pro");
  const isStarter = tier.includes("starter");
  const isFriend = tier.includes("friend_app");
  const isFree = !(isPro || isStarter || isFriend);

  const [showSubModal, setShowSubModal] = useState(false);
  const [rows, setRows]             = useState<Questionnaire[]>([]);
  const [loading, setLoading]       = useState(true);
  const [q, setQ]                   = useState('');
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(10);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [publishBusy, setPublishBusy]       = useState<Record<string, boolean>>({});
  const [toast, setToast]           = useState<{ type: ToastType; title: string; message?: string } | null>(null);

  const subscriptionInactive = !subscription?.is_active;
  function requireActive(action: () => void) { if (subscriptionInactive) { setShowSubModal(true); return; } action(); }

  function showToast(type: ToastType, title: string, message?: string) {
    setToast({ type, title, message });
    window.clearTimeout((showToast as any)._t);
    (showToast as any)._t = window.setTimeout(() => setToast(null), 2500);
  }

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('questionnaires').select('id,tenant_id,title,description,status,created_at')
      .eq('tenant_id', profile.tenant_id).order('created_at', { ascending: false });
    if (error) { setRows([]); setQuestionCounts({}); setLoading(false); showToast('error','Σφάλμα φόρτωσης',error.message); return; }
    setRows((data as Questionnaire[]) ?? []);
    const { data: qs, error: qErr } = await supabase
      .from('questionnaire_questions').select('questionnaire_id').eq('tenant_id', profile.tenant_id);
    if (!qErr && qs) {
      const map: Record<string, number> = {};
      for (const r of qs as any[]) { const id = r.questionnaire_id as string; map[id] = (map[id] ?? 0) + 1; }
      setQuestionCounts(map);
    } else { setQuestionCounts({}); if (qErr) console.warn('questionnaire_questions count error', qErr); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const n = q.toLowerCase();
    return rows.filter((r) => (r.title ?? '').toLowerCase().includes(n) || (r.description ?? '').toLowerCase().includes(n) || r.id.toLowerCase().includes(n));
  }, [rows, q]);

  useEffect(() => { setPage(1); }, [q, pageSize]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);
  const startIdx  = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx    = Math.min(filtered.length, page * pageSize);

  function canPublish(row: Questionnaire) { return (questionCounts[row.id] ?? 0) > 0; }

  async function togglePublish(row: Questionnaire) {
    requireActive(async () => {
      const isPublished = row.status === 'published';
      if (isPublished) {
        if (!confirm('Θέλεις σίγουρα να αποσύρεις αυτό το ερωτηματολόγιο; Θα γίνει "Πρόχειρο".')) return;
      } else {
        if (!canPublish(row)) { showToast('error','Δεν μπορεί να δημοσιευτεί','Πρόσθεσε τουλάχιστον 1 ερώτηση πριν το δημοσιεύσεις.'); return; }
      }
      const newStatus: QuestionnaireStatus = isPublished ? 'draft' : 'published';
      setPublishBusy((m) => ({ ...m, [row.id]: true }));
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, status: newStatus } : r));
      const { error } = await supabase.from('questionnaires').update({ status: newStatus }).eq('tenant_id', profile?.tenant_id).eq('id', row.id);
      setPublishBusy((m) => ({ ...m, [row.id]: false }));
      if (error) {
        setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, status: row.status } : r));
        showToast('error','Αποτυχία ενημέρωσης',error.message); return;
      }
      showToast('success', newStatus === 'published' ? 'Δημοσιεύτηκε' : 'Αποσύρθηκε');
    });
  }

  async function deleteQuestionnaire(id: string) {
    requireActive(async () => {
      if (!confirm('Διαγραφή αυτού του ερωτηματολογίου; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.')) return;
      const row = rows.find((r) => r.id === id);
      if (row?.status === 'published') { if (!confirm('Το ερωτηματολόγιο είναι "Δημοσιευμένο". Θέλεις σίγουρα να το διαγράψεις;')) return; }
      const { error } = await supabase.from('questionnaires').delete().eq('tenant_id', profile?.tenant_id).eq('id', id);
      if (error) { showToast('error','Αποτυχία διαγραφής',error.message); return; }
      setRows((prev) => prev.filter((r) => r.id !== id));
      setQuestionCounts((prev) => { const c = { ...prev }; delete c[id]; return c; });
      showToast('success','Διαγράφηκε');
    });
  }

  return (
    <div className="relative">
      <div className={isFree ? "pointer-events-none select-none blur-sm opacity-60" : ""}>
        <div className="p-4 md:p-6 space-y-5">
          <Toast toast={toast} onClose={() => setToast(null)} />

          {/* ── Header ── */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                <ClipboardList className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-black text-text-primary tracking-tight">Ερωτηματολόγια</h1>
                <p className="text-xs text-text-secondary mt-px">Δημιουργία και δημοσίευση ερωτηματολογίων για μέλη.</p>
              </div>
            </div>
            <button
              onClick={() => requireActive(() => navigate('/questionnaires/new'))}
              className="group relative inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px transition-all cursor-pointer overflow-hidden"
            >
              <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
              <Plus className="h-3.5 w-3.5 relative z-10" />
              <span className="relative z-10">Νέο Ερωτηματολόγιο</span>
            </button>
          </div>

          {/* ── Search ── */}
          <div className="flex items-center gap-2 h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background max-w-sm">
            <Search className="h-3.5 w-3.5 text-text-secondary shrink-0" />
            <input
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-secondary"
              placeholder="Αναζήτηση ερωτηματολογίων…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && <button onClick={() => setQ('')} className="text-text-secondary hover:text-text-primary cursor-pointer"><X className="h-3 w-3" /></button>}
          </div>

          {/* ── Table card ── */}
          <div className="rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">

            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/10 bg-secondary-background/80">
                    {['Τίτλος','Περιγραφή','Ερωτήσεις','Κατάσταση',''].map((h, i) => (
                      <th key={i} className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary ${i === 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-text-secondary">
                      <div className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…</div>
                    </td></tr>
                  )}
                  {!loading && filtered.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center">
                      <div className="flex flex-col items-center gap-2 text-text-secondary">
                        <ClipboardList className="h-7 w-7 opacity-20" />
                        <span className="text-sm">Δεν υπάρχουν ερωτηματολόγια</span>
                      </div>
                    </td></tr>
                  )}
                  {!loading && paginated.map((qq) => {
                    const count = questionCounts[qq.id] ?? 0;
                    const isPublished = qq.status === 'published';
                    const busy = !!publishBusy[qq.id];
                    const publishDisabled = !isPublished && count === 0;
                    const meta = STATUS_META[qq.status] ?? STATUS_META.draft;
                    return (
                      <tr key={qq.id} className="border-t border-border/5 hover:bg-secondary/5 transition-colors">
                        <td className="px-4 py-3 font-bold text-text-primary">{qq.title}</td>
                        <td className="px-4 py-3 text-xs text-text-secondary max-w-xs">
                          <div className="line-clamp-2">{qq.description ?? '—'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-lg border border-primary/25 bg-primary/10 text-primary">{count} ερωτ.</span>
                            {count === 0 && <span className="text-[10px] text-danger opacity-80">+1 για publish</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-lg border transition-all ${meta.cls} ${busy ? 'opacity-60' : ''}`}>{meta.label}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <ActionBtn
                              icon={busy ? Loader2 : (isPublished ? EyeOff : CheckCircle2)}
                              label={isPublished ? 'Απόσυρση' : 'Δημοσίευση'}
                              onClick={() => togglePublish(qq)}
                              disabled={busy || publishDisabled}
                              spin={busy}
                              titleOverride={publishDisabled ? 'Πρέπει να έχει τουλάχιστον 1 ερώτηση' : undefined}
                            />
                            <ActionBtn icon={Pencil} label="Επεξεργασία" onClick={() => requireActive(() => navigate(`/questionnaires/${qq.id}`))} disabled={busy} />
                            <button type="button" onClick={() => deleteQuestionnaire(qq.id)} disabled={busy} title="Διαγραφή" aria-label="Διαγραφή"
                              className="h-7 w-7 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all disabled:opacity-40 cursor-pointer"
                            ><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-border/5">
              {loading && <div className="flex items-center justify-center gap-2 py-10 text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Φόρτωση…</span></div>}
              {!loading && filtered.length === 0 && <div className="flex flex-col items-center gap-2 py-10 text-text-secondary"><ClipboardList className="h-7 w-7 opacity-20" /><span className="text-sm">Δεν υπάρχουν ερωτηματολόγια</span></div>}
              {!loading && paginated.map((qq) => {
                const count = questionCounts[qq.id] ?? 0;
                const isPublished = qq.status === 'published';
                const busy = !!publishBusy[qq.id];
                const publishDisabled = !isPublished && count === 0;
                const meta = STATUS_META[qq.status] ?? STATUS_META.draft;
                return (
                  <div key={qq.id} className="px-4 py-3 hover:bg-secondary/5 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-text-primary text-sm truncate">{qq.title}</div>
                        {qq.description && <div className="text-xs text-text-secondary mt-0.5 line-clamp-2">{qq.description}</div>}
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-lg border border-primary/25 bg-primary/10 text-primary">{count} ερωτ.</span>
                          <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-lg border ${meta.cls}`}>{meta.label}</span>
                          {publishDisabled && <span className="text-[10px] text-danger">+1 ερώτηση για publish</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <ActionBtn icon={busy ? Loader2 : (isPublished ? EyeOff : CheckCircle2)} label={isPublished?'Απόσυρση':'Δημοσίευση'} onClick={() => togglePublish(qq)} disabled={busy||publishDisabled} spin={busy} />
                        <ActionBtn icon={Pencil} label="Επεξεργασία" onClick={() => requireActive(() => navigate(`/questionnaires/${qq.id}`))} disabled={busy} />
                        <button type="button" onClick={() => deleteQuestionnaire(qq.id)} disabled={busy} className="h-7 w-7 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all disabled:opacity-40 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {!loading && filtered.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/10 text-xs text-text-secondary flex-wrap gap-2">
                <span>Εμφάνιση <span className="font-bold text-text-primary">{startIdx}–{endIdx}</span> από <span className="font-bold text-text-primary">{filtered.length}</span></span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span>Ανά σελίδα:</span>
                    <div className="relative">
                      <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-7 pl-2.5 pr-6 rounded-xl border border-border/15 bg-secondary-background text-xs appearance-none outline-none focus:border-primary/40 cursor-pointer">
                        {[10,25,50].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary pointer-events-none" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage((p) => Math.max(1, p-1))} disabled={page===1} className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-40 cursor-pointer transition-all"><ChevronLeft className="h-3.5 w-3.5" /></button>
                    <span className="px-2">Σελίδα <span className="font-bold text-text-primary">{page}</span> / {pageCount}</span>
                    <button onClick={() => setPage((p) => Math.min(pageCount, p+1))} disabled={page===pageCount} className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-40 cursor-pointer transition-all"><ChevronRight className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isFree && (
        <div className="absolute inset-0 z-60 flex items-start justify-center p-6">
          <div className="w-full max-w-xl">
            <PlanGate blocked asOverlay allow={["starter","pro"]}
              title="Τα Ερωτηματολόγια είναι διαθέσιμα από Starter"
              description="Αναβάθμισε για να δημιουργείς και να δημοσιεύεις ερωτηματολόγια."
              onUpgradeClick={() => navigate("/settings/billing")}
            />
          </div>
        </div>
      )}

      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick, disabled, spin, titleOverride }: {
  icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean; spin?: boolean; titleOverride?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={titleOverride ?? label} aria-label={label}
      className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all disabled:opacity-50 cursor-pointer"
    >
      <Icon className={`h-3.5 w-3.5 ${spin ? 'animate-spin' : ''}`} />
    </button>
  );
}