import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import type { LucideIcon } from 'lucide-react';
import {
  Pencil, Trash2, Loader2, Search, Plus, ChevronLeft, ChevronRight,
  X, AlertTriangle, CheckCircle2, Dumbbell, Tag, User, Euro, Check,
  ChevronDown,
} from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';
import { useNavigate } from 'react-router-dom';

type CoachRef  = { id: string; full_name: string };
type GymClass  = {
  id: string; tenant_id: string; title: string; description: string | null; created_at: string;
  category_id: string | null; drop_in_enabled: boolean; drop_in_price: number | null;
  member_drop_in_price: number | null; coach_id: string | null;
  class_categories?: { id: string; name: string; color: string | null } | null;
  coach?: CoachRef | null;
};
type Category  = { id: string; name: string; color: string | null };
type Coach     = { id: string; full_name: string };

async function readEdgeErrorPayload(err: any): Promise<any | null> {
  const res: Response | undefined = err?.context;
  if (!res) return null;
  try { return await res.clone().json(); }
  catch { try { const txt = await res.clone().text(); return txt ? { error: txt } : null; } catch { return null; } }
}

type Toast = { id: string; title: string; message?: string; variant?: 'error' | 'success' | 'info'; actionLabel?: string; onAction?: () => void };

function ToastHost({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  return (
    <div className="fixed right-4 top-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-2xl border border-border/15 bg-secondary-background/95 backdrop-blur-xl shadow-2xl shadow-black/25 overflow-hidden"
          style={{ animation: 'toastSlideIn 0.25s ease' }}
        >
          <div className={[
            'h-[3px]',
            t.variant === 'error'   ? 'bg-danger'  :
            t.variant === 'success' ? 'bg-success'  : 'bg-primary',
          ].join(' ')} />
          <div className="px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={[
                'text-sm font-bold',
                t.variant === 'error'   ? 'text-danger'  :
                t.variant === 'success' ? 'text-success'  : 'text-text-primary',
              ].join(' ')}>{t.title}</div>
              {t.message && <div className="mt-0.5 text-xs text-text-secondary">{t.message}</div>}
              {t.actionLabel && t.onAction && (
                <button
                  type="button"
                  onClick={() => t.onAction?.()}
                  className="mt-2.5 h-7 px-3 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  {t.actionLabel}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="p-1 rounded-lg border border-border/15 hover:bg-secondary/30 text-text-secondary shrink-0 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
      `}</style>
    </div>
  );
}

// ── Shared form helpers ───────────────────────────────────────────────────

function StyledSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        className="w-full h-9 pl-3.5 pr-9 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary appearance-none outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
    </div>
  );
}

function FormField({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary">
        {icon && <span className="opacity-60">{icon}</span>}
        {label}
      </label>
      {children}
    </div>
  );
}

function CustomCheckbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={[
          'w-4 h-4 rounded-md border flex items-center justify-center transition-all cursor-pointer shrink-0',
          checked ? 'bg-primary border-primary' : 'border-border/30 hover:border-primary/50',
        ].join(' ')}
      >
        {checked && <Check className="h-2.5 w-2.5 text-white" />}
      </div>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm text-text-primary">{label}</span>
    </label>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function ClassesPage() {
  const { profile, subscription } = useAuth();
  const [showSubModal, setShowSubModal] = useState(false);
  const [rows, setRows]       = useState<GymClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]             = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<GymClass | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [coaches, setCoaches]       = useState<Coach[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage]       = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const subscriptionInactive  = !subscription?.is_active;

  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (t: Omit<Toast, 'id'>, ms = 4500) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, ...t }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), ms);
  };
  const dismissToast = (id: string) => setToasts((prev) => prev.filter((x) => x.id !== id));

  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) { setShowSubModal(true); return; }
    action();
  }

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);
    const from = (page - 1) * pageSize;
    let query = supabase
      .from('classes_list')
      .select('id,tenant_id,title,description,created_at,category_id,drop_in_enabled,drop_in_price,member_drop_in_price,coach_id,category_name,category_color,coach_full_name', { count: 'exact' })
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false });

    const needle = q.trim();
    if (needle) query = query.or(`title.ilike.%${needle}%,description.ilike.%${needle}%,id.ilike.%${needle}%,category_name.ilike.%${needle}%,coach_full_name.ilike.%${needle}%`);

    const { data, error, count } = await query.range(from, from + pageSize - 1);

    if (!error) {
      setRows(((data as any[]) ?? []).map((r) => ({
        id: r.id, tenant_id: r.tenant_id, title: r.title,
        description: r.description ?? null, created_at: r.created_at,
        category_id: r.category_id ?? null,
        drop_in_enabled: !!r.drop_in_enabled,
        drop_in_price: r.drop_in_price ?? null,
        member_drop_in_price: r.member_drop_in_price ?? null,
        coach_id: r.coach_id ?? null,
        class_categories: r.category_name ? { id: r.category_id ?? '', name: r.category_name, color: r.category_color ?? null } : null,
        coach: r.coach_full_name ? { id: r.coach_id ?? '', full_name: r.coach_full_name } : null,
      })));
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id, page, pageSize, q]);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    supabase.from('class_categories').select('id,name,color').eq('tenant_id', profile.tenant_id).order('name').then(({ data }) => setCategories(data ?? []));
  }, [profile?.tenant_id]);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    supabase.from('coaches').select('id,full_name').eq('tenant_id', profile.tenant_id).eq('is_active', true).order('full_name').then(({ data }) => setCoaches(data ?? []));
  }, [profile?.tenant_id]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIdx  = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx    = Math.min(totalCount, page * pageSize);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <ToastHost toasts={toasts} dismiss={dismissToast} />

      {/* ── Page header ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <Dumbbell className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-black text-text-primary tracking-tight">Τμήματα</h1>
            <p className="text-xs text-text-secondary mt-px">
              {loading ? '…' : `${totalCount} τμήματα`}
            </p>
          </div>
        </div>

        <button
          onClick={() => requireActiveSubscription(() => setShowCreate(true))}
          className="
            group relative inline-flex items-center gap-1.5 h-9 px-4 rounded-xl
            text-sm font-bold text-white bg-primary hover:bg-primary/90
            shadow-sm shadow-primary/20 hover:-translate-y-px active:translate-y-0
            transition-all duration-150 cursor-pointer overflow-hidden shrink-0
          "
        >
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          <Plus className="h-3.5 w-3.5 relative z-10" />
          <span className="relative z-10 hidden sm:inline">Νέο Τμήμα</span>
        </button>
      </div>

      {/* ── Search ── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
        <input
          className="w-full h-9 pl-9 pr-3 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
          placeholder="Αναζήτηση τμημάτων…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
      </div>

      {/* ── Table card ── */}
      <div className="rounded-2xl border border-border/10 bg-secondary-background overflow-hidden shadow-sm">

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border/10 bg-secondary/5">
                {['Τίτλος', 'Κατηγορία', 'Προπονητής', 'Drop-in', ''].map((h, i) => (
                  <th key={i} className={['px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary', i === 4 ? 'text-right' : 'text-left'].join(' ')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-10">
                  <div className="flex items-center justify-center gap-2 text-text-secondary text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…
                  </div>
                </td></tr>
              )}
              {!loading && totalCount === 0 && (
                <tr><td colSpan={5} className="px-4 py-12">
                  <div className="flex flex-col items-center gap-3 text-text-secondary">
                    <Dumbbell className="h-8 w-8 opacity-25" />
                    <span className="text-sm">Δεν υπάρχουν τμήματα</span>
                  </div>
                </td></tr>
              )}
              {!loading && rows.map((c) => (
                <tr key={c.id} className="border-t border-border/5 hover:bg-secondary/5 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-text-primary">{c.title}</div>
                    {c.description && (
                      <div className="text-xs text-text-secondary mt-0.5 line-clamp-1 max-w-xs">{c.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.class_categories ? (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-border/15 bg-secondary/20">
                        {c.class_categories.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.class_categories.color }} />}
                        {c.class_categories.name}
                      </span>
                    ) : <span className="text-xs text-text-secondary opacity-40">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {c.coach
                      ? <span className="text-xs text-text-primary">{c.coach.full_name}</span>
                      : <span className="text-xs text-text-secondary opacity-40">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {c.drop_in_enabled ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg border border-success/25 bg-success/10 text-success w-fit">
                          <Check className="h-2.5 w-2.5" />Ενεργό
                        </span>
                        {c.drop_in_price != null && (
                          <span className="text-[11px] text-text-secondary">{c.drop_in_price.toFixed(2)}€ · Μέλος: {c.member_drop_in_price?.toFixed(2) ?? '—'}€</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-text-secondary opacity-40">Όχι</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => requireActiveSubscription(() => setEditRow(c))} />
                      <DeleteButton id={c.id} onDeleted={load} guard={() => { if (subscriptionInactive) { setShowSubModal(true); return false; } return true; }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-border/5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-text-secondary text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…
            </div>
          )}
          {!loading && totalCount === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-text-secondary">
              <Dumbbell className="h-8 w-8 opacity-25" />
              <span className="text-sm">Δεν υπάρχουν τμήματα</span>
            </div>
          )}
          {!loading && rows.map((c) => (
            <div key={c.id} className="px-4 py-4 hover:bg-secondary/5 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-text-primary">{c.title}</div>
                  {c.coach && <div className="text-xs text-text-secondary mt-0.5">{c.coach.full_name}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <IconButton icon={Pencil} label="Επεξεργασία" onClick={() => requireActiveSubscription(() => setEditRow(c))} />
                  <DeleteButton id={c.id} onDeleted={load} guard={() => { if (subscriptionInactive) { setShowSubModal(true); return false; } return true; }} />
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {c.class_categories && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border border-border/15 bg-secondary/20">
                    {c.class_categories.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.class_categories.color }} />}
                    {c.class_categories.name}
                  </span>
                )}
                {c.drop_in_enabled && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-success/25 bg-success/10 text-success font-semibold">
                    Drop-in {c.drop_in_price != null ? `${c.drop_in_price.toFixed(2)}€` : ''}
                  </span>
                )}
              </div>
              {c.description && (
                <div className="mt-2 text-xs text-text-secondary line-clamp-2 leading-relaxed">{c.description}</div>
              )}
            </div>
          ))}
        </div>

        {/* Pagination footer */}
        {!loading && totalCount > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/10 text-xs text-text-secondary">
            <span>
              <span className="font-bold text-text-primary">{startIdx}–{endIdx}</span> από <span className="font-bold text-text-primary">{totalCount}</span>
            </span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="hidden sm:inline">Ανά σελίδα:</span>
                <div className="relative">
                  <select
                    className="h-7 pl-2 pr-7 rounded-lg border border-border/15 bg-secondary-background text-xs appearance-none outline-none focus:border-primary/40 cursor-pointer"
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  >
                    {[10,25,50].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none" />
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 transition-all cursor-pointer disabled:cursor-not-allowed"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="px-2">
                  <span className="font-bold text-text-primary">{page}</span> / {pageCount}
                </span>
                <button
                  className="h-7 w-7 rounded-lg border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-30 transition-all cursor-pointer disabled:cursor-not-allowed"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page === pageCount}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateClassModal tenantId={profile?.tenant_id!} categories={categories} coaches={coaches} toast={pushToast} onClose={() => { setShowCreate(false); load(); }} />
      )}
      {editRow && (
        <EditClassModal row={editRow} categories={categories} coaches={coaches} onClose={() => { setEditRow(null); load(); }} />
      )}

      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function DeleteButton({ id, onDeleted, guard }: { id: string; onDeleted: () => void; guard?: () => boolean }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (guard && !guard()) return;
    if (!confirm('Διαγραφή αυτού του τμήματος; Αυτό δεν μπορεί να αναιρεθεί.')) return;
    setBusy(true);
    await supabase.functions.invoke('class-delete', { body: { id } });
    setBusy(false);
    onDeleted();
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-danger/20 text-danger hover:bg-danger/10 disabled:opacity-50 transition-all cursor-pointer"
      aria-label="Διαγραφή τμήματος"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}

function IconButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-border/15 text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
      aria-label={label}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

// ── Class form fields (shared between create/edit) ────────────────────────

function ClassFormFields({
  title, setTitle, description, setDescription,
  categoryId, setCategoryId, coachId, setCoachId,
  dropInEnabled, setDropInEnabled, dropInPrice, setDropInPrice,
  memberDropInPrice, setMemberDropInPrice,
  categories, coaches,
}: any) {
  return (
    <div className="space-y-4">
      <FormField label="Τίτλος *" icon={<Dumbbell className="h-3 w-3" />}>
        <input
          className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="π.χ. Yoga, Crossfit…"
        />
      </FormField>

      <FormField label="Περιγραφή">
        <textarea
          className="w-full px-3.5 py-2.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all resize-none"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Προαιρετική περιγραφή…"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Κατηγορία" icon={<Tag className="h-3 w-3" />}>
          <StyledSelect value={categoryId} onChange={setCategoryId}>
            <option value="">Χωρίς κατηγορία</option>
            {categories.map((c: Category) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </StyledSelect>
        </FormField>

        <FormField label="Προπονητής" icon={<User className="h-3 w-3" />}>
          <StyledSelect value={coachId} onChange={setCoachId}>
            <option value="">Χωρίς προπονητή</option>
            {coaches.map((c: Coach) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </StyledSelect>
        </FormField>
      </div>

      <FormField label="Drop-in συμμετοχή" icon={<Euro className="h-3 w-3" />}>
        <div className="space-y-3">
          <CustomCheckbox
            checked={dropInEnabled}
            onChange={setDropInEnabled}
            label="Επιτρέπεται drop-in για αυτό το τμήμα"
          />
          {dropInEnabled && (
            <div className="grid grid-cols-2 gap-3 pl-6">
              <div className="space-y-1">
                <div className="text-[11px] text-text-secondary">Τιμή ανά συμμετοχή (€)</div>
                <input
                  type="number" min={0} step={0.5}
                  className="w-full h-8 px-3 rounded-xl border border-border/15 bg-secondary-background text-sm outline-none focus:border-primary/40 transition-all"
                  value={dropInPrice ?? ''}
                  onChange={(e) => setDropInPrice(e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <div className="text-[11px] text-text-secondary">Τιμή για μέλη (€)</div>
                <input
                  type="number" min={0} step={0.5}
                  className="w-full h-8 px-3 rounded-xl border border-border/15 bg-secondary-background text-sm outline-none focus:border-primary/40 transition-all"
                  value={memberDropInPrice ?? ''}
                  onChange={(e) => setMemberDropInPrice(e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>
            </div>
          )}
        </div>
      </FormField>
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────

function Modal({ title, icon, onClose, children, footer }: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="w-full max-w-lg rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-2xl overflow-hidden"
        style={{ animation: 'classModalIn 0.2s ease' }}
      >
        <div className="h-[3px] w-full bg-gradient-to-r from-primary/0 via-primary to-primary/0" />
        <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
              {icon ?? <Dumbbell className="h-4 w-4 text-primary" />}
            </div>
            <h2 className="font-black text-text-primary tracking-tight">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl border border-border/10 hover:bg-secondary/30 text-text-secondary hover:text-text-primary transition-all cursor-pointer shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
        <div className="px-5 py-4 border-t border-border/10 flex justify-end gap-2">{footer}</div>
      </div>
      <style>{`@keyframes classModalIn { from { opacity:0; transform:translateY(16px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }`}</style>
    </div>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────

function CreateClassModal({ tenantId, categories, coaches, onClose, toast }: { tenantId: string; categories: Category[]; coaches: Coach[]; onClose: () => void; toast: (t: Omit<Toast,'id'>, ms?: number) => void }) {
  const [title, setTitle]                       = useState('');
  const [description, setDescription]           = useState('');
  const [categoryId, setCategoryId]             = useState('');
  const [coachId, setCoachId]                   = useState('');
  const [dropInEnabled, setDropInEnabled]       = useState(false);
  const [dropInPrice, setDropInPrice]           = useState<number | null>(null);
  const [memberDropInPrice, setMemberDropInPrice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('class-create', {
      body: { tenant_id: tenantId, title: title.trim(), description: description.trim() || null, category_id: categoryId || null, coach_id: coachId || null, drop_in_enabled: dropInEnabled, drop_in_price: dropInEnabled ? dropInPrice : null, member_drop_in_price: dropInEnabled ? memberDropInPrice : null },
    });
    setBusy(false);

    if (error) {
      const payload = await readEdgeErrorPayload(error);
      const code = payload?.error;
      if (code === 'PLAN_LIMIT:MAX_CLASSES_REACHED') {
        toast({ variant:'error', title:'Έφτασες το όριο του πλάνου σου', message: payload?.limit != null ? `Έχεις ήδη ${payload.current}/${payload.limit}.` : undefined, actionLabel:'Αναβάθμιση', onAction: () => navigate('/settings/billing') });
        return;
      }
      toast({ variant:'error', title:'Αποτυχία δημιουργίας τμήματος', message: code ?? error.message });
      return;
    }

    const code = (data as any)?.error;
    if (code) { toast({ variant:'error', title:'Αποτυχία', message: String(code) }); return; }
    toast({ variant:'success', title:'Το τμήμα δημιουργήθηκε', message:'Προστέθηκε επιτυχώς.' });
    onClose();
  };

  return (
    <Modal
      title="Νέο Τμήμα"
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Ακύρωση</button>
        <button onClick={submit} disabled={busy} className="group relative inline-flex items-center gap-2 h-9 px-5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px disabled:opacity-50 disabled:translate-y-0 transition-all cursor-pointer overflow-hidden">
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /><span className="relative z-10">Δημιουργία…</span></> : <span className="relative z-10">Δημιουργία</span>}
        </button>
      </>}
    >
      <ClassFormFields title={title} setTitle={setTitle} description={description} setDescription={setDescription} categoryId={categoryId} setCategoryId={setCategoryId} coachId={coachId} setCoachId={setCoachId} dropInEnabled={dropInEnabled} setDropInEnabled={setDropInEnabled} dropInPrice={dropInPrice} setDropInPrice={setDropInPrice} memberDropInPrice={memberDropInPrice} setMemberDropInPrice={setMemberDropInPrice} categories={categories} coaches={coaches} />
    </Modal>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────

function EditClassModal({ row, categories, coaches, onClose }: { row: GymClass; categories: Category[]; coaches: Coach[]; onClose: () => void }) {
  const [title, setTitle]                       = useState(row.title ?? '');
  const [description, setDescription]           = useState(row.description ?? '');
  const [categoryId, setCategoryId]             = useState(row.category_id ?? '');
  const [coachId, setCoachId]                   = useState(row.coach_id ?? '');
  const [dropInEnabled, setDropInEnabled]       = useState(row.drop_in_enabled ?? false);
  const [dropInPrice, setDropInPrice]           = useState<number | null>(row.drop_in_price ?? null);
  const [memberDropInPrice, setMemberDropInPrice] = useState<number | null>(row.member_drop_in_price ?? null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const res = await supabase.functions.invoke('class-update', {
      body: { id: row.id, title: title.trim(), description: description.trim() || null, category_id: categoryId || null, coach_id: coachId || null, drop_in_enabled: dropInEnabled, drop_in_price: dropInEnabled ? dropInPrice : null, member_drop_in_price: dropInEnabled ? memberDropInPrice : null },
    });
    if (res.error) alert(res.error.message ?? 'Function error');
    setBusy(false);
    onClose();
  };

  return (
    <Modal
      title="Επεξεργασία Τμήματος"
      icon={<Pencil className="h-4 w-4 text-primary" />}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Ακύρωση</button>
        <button onClick={submit} disabled={busy} className="group relative inline-flex items-center gap-2 h-9 px-5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px disabled:opacity-50 disabled:translate-y-0 transition-all cursor-pointer overflow-hidden">
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /><span className="relative z-10">Αποθήκευση…</span></> : <span className="relative z-10">Αποθήκευση</span>}
        </button>
      </>}
    >
      <ClassFormFields title={title} setTitle={setTitle} description={description} setDescription={setDescription} categoryId={categoryId} setCategoryId={setCategoryId} coachId={coachId} setCoachId={setCoachId} dropInEnabled={dropInEnabled} setDropInEnabled={setDropInEnabled} dropInPrice={dropInPrice} setDropInPrice={setDropInPrice} memberDropInPrice={memberDropInPrice} setMemberDropInPrice={setMemberDropInPrice} categories={categories} coaches={coaches} />
    </Modal>
  );
}