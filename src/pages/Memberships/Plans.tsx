import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import type { LucideIcon } from 'lucide-react';
import { Pencil, Trash2, Plus, Loader2 } from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';

type PlanKind = 'duration' | 'sessions' | 'hybrid';

type Category = {
  id: string;
  name: string;
  color: string | null;
};

type Plan = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  price: number | null;
  plan_kind: PlanKind;
  duration_days: number | null;
  session_credits: number | null;
  created_at: string;
  categories: Category[];
};

export default function Plans() {
  const { profile, subscription } = useAuth();
  const [showSubModal, setShowSubModal] = useState(false);
  const [rows, setRows] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);

  // pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);


  const subscriptionInactive = !subscription?.is_active;

  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) {
      setShowSubModal(true);
      return;
    }
    action();
  }


  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('membership_plans')
      .select(`
        id,
        tenant_id,
        name,
        description,
        price,
        plan_kind,
        duration_days,
        session_credits,
        created_at,
        membership_plan_categories (
          category_id,
          class_categories (
            id,
            name,
            color
          )
        )
      `)
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false });

    if (error) {
      setError(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const normalized: Plan[] = ((data as any[]) ?? []).map((row) => {
      const links = (row.membership_plan_categories ?? []) as any[];
      const cats: Category[] = links
        .map((l) => l.class_categories)
        .filter((c: any) => !!c)
        .map((c: any) => ({
          id: c.id,
          name: c.name,
          color: c.color,
        }));

      return {
        id: row.id,
        tenant_id: row.tenant_id,
        name: row.name,
        description: row.description,
        price: row.price,
        plan_kind: row.plan_kind,
        duration_days: row.duration_days,
        session_credits: row.session_credits,
        created_at: row.created_at,
        categories: cats,
      };
    });

    setRows(normalized);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [profile?.tenant_id]);

  // Load categories for this tenant
  useEffect(() => {
    if (!profile?.tenant_id) return;

    supabase
      .from('class_categories')
      .select('id, name, color')
      .eq('tenant_id', profile.tenant_id)
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error('load categories error', error);
        } else {
          setCategories((data || []) as Category[]);
        }
      });
  }, [profile?.tenant_id]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter(
      (r) =>
        (r.name ?? '').toLowerCase().includes(needle) ||
        (r.description ?? '').toLowerCase().includes(needle) ||
        r.categories.some((c) => (c.name ?? '').toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  // Reset page when search or page size changes
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

  const renderBenefits = (p: Plan) =>
    [
      p.duration_days ? `${p.duration_days} μέρες` : null,
      p.session_credits ? `${p.session_credits} συνεδρίες` : null,
    ]
      .filter(Boolean)
      .join(' • ') || '—';

  return (
    <div className="p-4 md:p-6">
      {/* Top bar – responsive */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          className="h-9 w-full sm:w-64 rounded-md border border-white/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
          placeholder="Αναζήτηση Πλάνων…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="h-9 w-full sm:w-auto rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white flex items-center justify-center gap-2"
          onClick={() => requireActiveSubscription(() => setShowCreate(true))}
        >
          <Plus className="w-4 h-4" />
          <span>Νέο Πλάνο</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">
          {error}
        </div>
      )}

      <div className="rounded-md border border-white/10 overflow-hidden">
        {/* Loading / empty states */}
        {loading && (
          <div className="px-3 py-4 text-sm opacity-60">Loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="px-3 py-4 text-sm opacity-60">Κανένα Πλάνο</div>
        )}

        {/* Content when we have rows */}
        {!loading && filtered.length > 0 && (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/10">
              {paginated.map((p) => (
                <div
                  key={p.id}
                  className="p-3 bg-secondary-background/60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <div className="text-sm font-semibold">{p.name}</div>
                      {p.price != null && (
                        <div className="text-xs text-accent font-medium">
                          {formatMoney(p.price)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[11px] uppercase">
                        {p.plan_kind}
                      </span>
                      <IconButton
                        icon={Pencil}
                        label="Επεξεργασία πλάνου"
                        onClick={() => requireActiveSubscription(() => setEditRow(p))}
                      />
                      <DeleteButton id={p.id} onDeleted={load}
                        guard={() => {
                          if (subscriptionInactive) {
                            setShowSubModal(true);
                            return false;
                          }
                          return true;
                        }}
                      />
                    </div>
                  </div>

                  {p.description && (
                    <p className="mt-2 text-[13px] text-text-secondary">
                      {p.description}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.categories.length > 0 ? (
                      p.categories.map((cat) => (
                        <span
                          key={cat.id}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-white/5"
                        >
                          {cat.color && (
                            <span
                              className="inline-block h-2 w-2 rounded-full border border-white/20"
                              style={{ backgroundColor: cat.color }}
                            />
                          )}
                          <span>{cat.name}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-text-secondary">
                        Χωρίς κατηγορία
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-secondary">
                    <span>
                      Οφέλη: <span className="text-text-primary">{renderBenefits(p)}</span>
                    </span>
                    <span>Δημιουργήθηκε: {formatDateDMY(p.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-225 w-full text-sm">
                <thead className="bg-secondary-background/60">
                  <tr className="text-left">
                    <Th>Ονομασία</Th>
                    <Th>Περιγραφή</Th>
                    <Th>Κατηγορίες</Th>
                    <Th>Τιμή</Th>
                    <Th>Τύπος</Th>
                    <Th>Οφέλη</Th>
                    <Th>Δημιουργήθηκε</Th>
                    <Th className="text-right pr-3">Ενέργειες</Th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t border-white/10 hover:bg-secondary/10"
                    >
                      <Td className="font-medium">{p.name}</Td>
                      <Td className="font-medium">{p.description}</Td>
                      <Td>
                        {p.categories.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {p.categories.map((cat) => (
                              <span
                                key={cat.id}
                                className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-white/5"
                              >
                                {cat.color && (
                                  <span
                                    className="inline-block h-2.5 w-2.5 rounded-full border border-white/20"
                                    style={{ backgroundColor: cat.color }}
                                  />
                                )}
                                <span>{cat.name}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-text-secondary">—</span>
                        )}
                      </Td>
                      <Td>{p.price != null ? formatMoney(p.price) : '—'}</Td>
                      <Td className="uppercase">{p.plan_kind}</Td>
                      <Td>{renderBenefits(p)}</Td>
                      <Td>{formatDateDMY(p.created_at)}</Td>
                      <Td className="text-right space-x-1 pr-3">
                        <IconButton
                          icon={Pencil}
                          label="Επεξεργασία πλάνου"
                          onClick={() => requireActiveSubscription(() => setEditRow(p))}
                        />
                        <DeleteButton id={p.id} onDeleted={load}
                          guard={() => {
                            if (subscriptionInactive) {
                              setShowSubModal(true);
                              return false;
                            }
                            return true;
                          }}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 py-2 text-xs text-text-secondary border-t border-white/10">
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
                  <span>Γραμμές ανά Σελίδα:</span>
                  <select
                    className="bg-transparent border border-white/10 rounded px-1 py-0.5"
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
                    className="px-2 py-1 rounded border border-white/10 disabled:opacity-40"
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
                    className="px-2 py-1 rounded border border-white/10 disabled:opacity-40"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={page === pageCount}
                  >
                    Επόμενο
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <CreatePlanModal
          tenantId={profile?.tenant_id!}
          categories={categories}
          onClose={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
      {editRow && (
        <EditPlanModal
          row={editRow}
          categories={categories}
          onClose={() => {
            setEditRow(null);
            load();
          }}
        />
      )}


      <SubscriptionRequiredModal
        open={showSubModal}
        onClose={() => setShowSubModal(false)}
      />
    </div>
  );
}

function Th({ children, className = '' }: any) {
  return <th className={`px-3 py-2 font-semibold ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: any) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}

/* Reusable ghost icon button */
function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 hover:bg-secondary/20 disabled:opacity-50"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
      <span className="sr-only">{label}</span>
    </button>
  );
}

function DeleteButton({ id, onDeleted, guard }: { id: string; onDeleted: () => void; guard: () => boolean; }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (guard && !guard()) return;
    if (
      !confirm(
        'Διαγραφή αυτού του πλάνου; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.',
      )
    )
      return;
    setBusy(true);
    const res = await supabase.functions.invoke('plan-delete', { body: { id } });
    setBusy(false);
    if (res.error || (res.data as any)?.error) {
      alert(res.error?.message ?? (res.data as any)?.error ?? 'Delete failed');
    } else {
      onDeleted();
    }
  };
  return (
    <button
      type="button"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/60 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
      onClick={onClick}
      disabled={busy}
      aria-label="Διαγραφή πλάνου"
      title="Διαγραφή πλάνου"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
      <span className="sr-only">Διαγραφή</span>
    </button>
  );
}

/* ── Create ───────────────────────────────────────────────────────────── */
function CreatePlanModal({
  tenantId,
  categories,
  onClose,
}: {
  tenantId: string;
  categories: Category[];
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [planKind, setPlanKind] = useState<PlanKind>('duration');
  const [durationDays, setDurationDays] = useState<number>(0);
  const [sessionCredits, setSessionCredits] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const toggleCategory = (id: string) => {
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const submit = async () => {
    if (!name) return;
    if ((durationDays || 0) <= 0 && (sessionCredits || 0) <= 0) {
      alert('Παρέχετε ημέρες διάρκειας ή/και αριθμό συνεδριών.');
      return;
    }
    setBusy(true);
    const res = await supabase.functions.invoke('plan-create', {
      body: {
        tenant_id: tenantId,
        name,
        price,
        plan_kind: planKind,
        duration_days: durationDays || null,
        session_credits: sessionCredits || null,
        description,
        category_ids: categoryIds,
      },
    });
    setBusy(false);
    if (res.error || (res.data as any)?.error) {
      alert(res.error?.message ?? (res.data as any)?.error ?? 'Create failed');
      return;
    }
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Νέο Πλάνο Συνδρομής">
      <FormRow label="Ονομασία *">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FormRow>
      <FormRow label="Τιμή">
        <input
          className="input"
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
      </FormRow>
      <FormRow label="Τύπος Πλάνου">
        <select
          className="input"
          value={planKind}
          onChange={(e) => setPlanKind(e.target.value as PlanKind)}
        >
          <option value="duration">Διάρκεια (Μέρες)</option>
          <option value="sessions">Αριθμός συνεδριών</option>
          <option value="hybrid">Και τα δύο (Μέρες + Αριθμός)</option>
        </select>
      </FormRow>

      {(planKind === 'duration' || planKind === 'hybrid') && (
        <FormRow label="Διάρκεια (Μέρες)">
          <input
            className="input"
            type="number"
            min={0}
            value={durationDays}
            onChange={(e) => setDurationDays(Number(e.target.value))}
          />
        </FormRow>
      )}

      {(planKind === 'sessions' || planKind === 'hybrid') && (
        <FormRow label="Αριθμός συνεδριών">
          <input
            className="input"
            type="number"
            min={0}
            value={sessionCredits}
            onChange={(e) => setSessionCredits(Number(e.target.value))}
          />
        </FormRow>
      )}

      <FormRow label="Κατηγορίες">
        <div className="flex flex-wrap gap-2">
          {categories.length === 0 && (
            <span className="text-xs text-text-secondary">
              Καμία κατηγορία διαθέσιμη.
            </span>
          )}
          {categories.map((c) => {
            const checked = categoryIds.includes(c.id);
            return (
              <label
                key={c.id}
                className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-white/5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={checked}
                  onChange={() => toggleCategory(c.id)}
                />
                {c.color && (
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full border border-white/20"
                    style={{ backgroundColor: c.color }}
                  />
                )}
                <span>{c.name}</span>
              </label>
            );
          })}
        </div>
      </FormRow>

      <FormRow label="Περιγραφή">
        <textarea
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormRow>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Κλείσιμο
        </button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Δημιουργία...' : 'Δημιουργία'}
        </button>
      </div>
    </Modal>
  );
}

/* ── Edit ─────────────────────────────────────────────────────────────── */
function EditPlanModal({
  row,
  categories,
  onClose,
}: {
  row: Plan;
  categories: Category[];
  onClose: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [price, setPrice] = useState<number>(row.price ?? 0);
  const [planKind, setPlanKind] = useState<PlanKind>(row.plan_kind);
  const [durationDays, setDurationDays] = useState<number>(row.duration_days ?? 0);
  const [sessionCredits, setSessionCredits] = useState<number>(
    row.session_credits ?? 0,
  );
  const [description, setDescription] = useState(row.description ?? '');
  const [categoryIds, setCategoryIds] = useState<string[]>(
    (row.categories ?? []).map((c) => c.id),
  );
  const [busy, setBusy] = useState(false);

  const toggleCategory = (id: string) => {
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const submit = async () => {
    if (!name) return;
    if ((durationDays || 0) <= 0 && (sessionCredits || 0) <= 0) {
      alert('Παρέχετε ημέρες διάρκειας ή/και αριθμό συνεδριών.');
      return;
    }
    setBusy(true);
    const res = await supabase.functions.invoke('plan-update', {
      body: {
        id: row.id,
        name,
        price,
        plan_kind: planKind,
        duration_days: durationDays || null,
        session_credits: sessionCredits || null,
        description,
        category_ids: categoryIds,
      },
    });
    setBusy(false);
    if (res.error || (res.data as any)?.error) {
      alert(res.error?.message ?? (res.data as any)?.error ?? 'Save failed');
      return;
    }
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Επεξεργασία Πλάνου συνδρομής">
      <FormRow label="Ονομασία *">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FormRow>
      <FormRow label="Τιμή">
        <input
          className="input"
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
      </FormRow>
      <FormRow label="Τύπος Πλάνου">
        <select
          className="input"
          value={planKind}
          onChange={(e) => setPlanKind(e.target.value as PlanKind)}
        >
          <option value="duration">Διάρκεια (Μέρες)</option>
          <option value="sessions">Αριθμός Συνεδριών</option>
          <option value="hybrid">Και τα δύο (Μέρες + Αριθμός)</option>
        </select>
      </FormRow>

      {(planKind === 'duration' || planKind === 'hybrid') && (
        <FormRow label="Διάρκεια (Μέρες)">
          <input
            className="input"
            type="number"
            min={0}
            value={durationDays}
            onChange={(e) => setDurationDays(Number(e.target.value))}
          />
        </FormRow>
      )}

      {(planKind === 'sessions' || planKind === 'hybrid') && (
        <FormRow label="Αριθμός Συνεδριών">
          <input
            className="input"
            type="number"
            min={0}
            value={sessionCredits}
            onChange={(e) => setSessionCredits(Number(e.target.value))}
          />
        </FormRow>
      )}

      <FormRow label="Κατηγορίες">
        <div className="flex flex-wrap gap-2">
          {categories.length === 0 && (
            <span className="text-xs text-text-secondary">
              Καμία κατηγορία διαθέσιμη.
            </span>
          )}
          {categories.map((c) => {
            const checked = categoryIds.includes(c.id);
            return (
              <label
                key={c.id}
                className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-white/5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={checked}
                  onChange={() => toggleCategory(c.id)}
                />
                {c.color && (
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full border border-white/20"
                    style={{ backgroundColor: c.color }}
                  />
                )}
                <span>{c.name}</span>
              </label>
            );
          })}
        </div>
      </FormRow>

      <FormRow label="Περιγραφή">
        <textarea
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormRow>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Κλείσιμο
        </button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Αποθήκευση...' : 'Αποθήκευση'}
        </button>
      </div>
    </Modal>
  );
}

/* UI helpers */
function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-md border border-white/10 bg-secondary-background text-text-primary shadow-xl">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 hover:bg-white/5"
          >
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
function FormRow({ label, children }: any) {
  return (
    <label className="block mb-3">
      <div className="mb-1 text-sm opacity-80">{label}</div>
      {children}
    </label>
  );
}

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(n);
}

function formatDateDMY(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}
