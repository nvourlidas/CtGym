import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import { Plus, Search, X, ClipboardList } from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';
import { useNavigate } from 'react-router-dom';
import PlanGate from '../../components/billing/PlanGate';
import type { Questionnaire, QuestionnaireStatus, ToastType } from './questionnaires/types';
import Toast from './questionnaires/components/Toast';
import QuestionnairesTable from './questionnaires/components/QuestionnairesTable';

export default function QuestionnairesPage() {
  const { profile, subscription } = useAuth();
  const navigate = useNavigate();

  const tier = String((subscription as any)?.plan_id ?? (subscription as any)?.plan_name ?? (subscription as any)?.name ?? '').toLowerCase();
  const isFree = !(tier.includes('pro') || tier.includes('starter') || tier.includes('friend_app'));

  const [showSubModal, setShowSubModal] = useState(false);
  const [rows, setRows] = useState<Questionnaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [publishBusy, setPublishBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ type: ToastType; title: string; message?: string } | null>(null);

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
    if (error) { setRows([]); setQuestionCounts({}); setLoading(false); showToast('error', 'Σφάλμα φόρτωσης', error.message); return; }
    setRows((data as Questionnaire[]) ?? []);
    const { data: qs, error: qErr } = await supabase
      .from('questionnaire_questions').select('questionnaire_id').eq('tenant_id', profile.tenant_id);
    if (!qErr && qs) {
      const map: Record<string, number> = {};
      for (const r of qs as any[]) { const id = r.questionnaire_id as string; map[id] = (map[id] ?? 0) + 1; }
      setQuestionCounts(map);
    } else { setQuestionCounts({}); }
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
  const startIdx = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(filtered.length, page * pageSize);

  async function togglePublish(row: Questionnaire) {
    requireActive(async () => {
      const isPublished = row.status === 'published';
      if (isPublished) {
        if (!confirm('Θέλεις σίγουρα να αποσύρεις αυτό το ερωτηματολόγιο; Θα γίνει "Πρόχειρο".')) return;
      } else {
        if (!(questionCounts[row.id] ?? 0)) { showToast('error', 'Δεν μπορεί να δημοσιευτεί', 'Πρόσθεσε τουλάχιστον 1 ερώτηση πριν το δημοσιεύσεις.'); return; }
      }
      const newStatus: QuestionnaireStatus = isPublished ? 'draft' : 'published';
      setPublishBusy((m) => ({ ...m, [row.id]: true }));
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, status: newStatus } : r));
      const { error } = await supabase.from('questionnaires').update({ status: newStatus }).eq('tenant_id', profile?.tenant_id).eq('id', row.id);
      setPublishBusy((m) => ({ ...m, [row.id]: false }));
      if (error) {
        setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, status: row.status } : r));
        showToast('error', 'Αποτυχία ενημέρωσης', error.message); return;
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
      if (error) { showToast('error', 'Αποτυχία διαγραφής', error.message); return; }
      setRows((prev) => prev.filter((r) => r.id !== id));
      setQuestionCounts((prev) => { const c = { ...prev }; delete c[id]; return c; });
      showToast('success', 'Διαγράφηκε');
    });
  }

  return (
    <div className="relative">
      <div className={isFree ? 'pointer-events-none select-none blur-sm opacity-60' : ''}>
        <div className="p-4 md:p-6 space-y-5">
          <Toast toast={toast} onClose={() => setToast(null)} />

          {/* Header */}
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
            <button onClick={() => requireActive(() => navigate('/questionnaires/new'))}
              className="group relative inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px transition-all cursor-pointer overflow-hidden"
            >
              <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
              <Plus className="h-3.5 w-3.5 relative z-10" />
              <span className="relative z-10">Νέο Ερωτηματολόγιο</span>
            </button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background max-w-sm">
            <Search className="h-3.5 w-3.5 text-text-secondary shrink-0" />
            <input className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-secondary" placeholder="Αναζήτηση ερωτηματολογίων…" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button onClick={() => setQ('')} className="text-text-secondary hover:text-text-primary cursor-pointer"><X className="h-3 w-3" /></button>}
          </div>

          <QuestionnairesTable
            loading={loading} paginated={paginated} filtered={filtered}
            page={page} setPage={setPage} pageCount={pageCount} pageSize={pageSize} setPageSize={setPageSize}
            startIdx={startIdx} endIdx={endIdx}
            questionCounts={questionCounts} publishBusy={publishBusy}
            onTogglePublish={togglePublish}
            onEdit={(row) => requireActive(() => navigate(`/questionnaires/${row.id}`))}
            onDelete={deleteQuestionnaire}
          />
        </div>
      </div>

      {isFree && (
        <div className="absolute inset-0 z-60 flex items-start justify-center p-6">
          <div className="w-full max-w-xl">
            <PlanGate blocked asOverlay allow={['starter', 'pro']}
              title="Τα Ερωτηματολόγια είναι διαθέσιμα από Starter"
              description="Αναβάθμισε για να δημιουργείς και να δημοσιεύεις ερωτηματολόγια."
              onUpgradeClick={() => navigate('/settings/billing')}
            />
          </div>
        </div>
      )}

      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </div>
  );
}
