import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import type { LucideIcon } from 'lucide-react';
import { Pencil, Trash2, Loader2 } from 'lucide-react';

type CoachRef = {
  id: string;
  full_name: string;
};

type GymClass = {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  created_at: string;
  category_id: string | null;
  drop_in_enabled: boolean;
  drop_in_price: number | null;
  member_drop_in_price: number | null;
  coach_id: string | null;
  class_categories?:
    | {
        id: string;
        name: string;
        color: string | null;
      }
    | null;
  coach?: CoachRef | null;
};

type Category = {
  id: string;
  name: string;
  color: string | null;
};

type Coach = {
  id: string;
  full_name: string;
};

export default function ClassesPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<GymClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<GymClass | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);

  // pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('classes')
      .select(
        `
        id,
        tenant_id,
        title,
        description,
        created_at,
        category_id,
        drop_in_enabled,
        drop_in_price,
        member_drop_in_price,
        coach_id,
        class_categories (
          id,
          name,
          color
        ),
        coaches (
          id,
          full_name
        )
      `
      )
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const normalized: GymClass[] = (data as any[]).map((row) => ({
        ...row,
        class_categories: Array.isArray(row.class_categories)
          ? row.class_categories[0] ?? null
          : row.class_categories ?? null,
        coach: Array.isArray(row.coaches)
          ? row.coaches[0] ?? null
          : row.coaches ?? null,
      }));
      setRows(normalized);
    }

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
          console.error(error);
        } else {
          setCategories(data || []);
        }
      });
  }, [profile?.tenant_id]);

  // Load coaches for this tenant
  useEffect(() => {
    if (!profile?.tenant_id) return;

    supabase
      .from('coaches')
      .select('id, full_name')
      .eq('tenant_id', profile.tenant_id)
      .eq('is_active', true)
      .order('full_name', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
        } else {
          setCoaches(data || []);
        }
      });
  }, [profile?.tenant_id]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter(
      (r) =>
        (r.title ?? '').toLowerCase().includes(needle) ||
        (r.description ?? '').toLowerCase().includes(needle) ||
        r.id.toLowerCase().includes(needle) ||
        (r.class_categories?.name ?? '').toLowerCase().includes(needle),
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

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <input
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
          placeholder="Αναζήτηση τμημάτων…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white"
          onClick={() => setShowCreate(true)}
        >
          Νέο Τμήμα
        </button>
      </div>

      <div className="rounded-md border border-white/10 overflow-hidden">
        {/* DESKTOP / TABLE VIEW */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-secondary-background/60">
                <tr className="text-left">
                  <Th>Τίτλος</Th>
                  <Th>Περιγραφή</Th>
                  <Th>Κατηγορία</Th>
                  <Th>Προπονητής</Th>
                  <Th>Drop-in</Th>
                  <Th className="text-right pr-3">Ενέργειες</Th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="px-3 py-4 opacity-60" colSpan={6}>
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 opacity-60" colSpan={6}>
                      Δεν υπάρχουν τμήματα
                    </td>
                  </tr>
                )}
                {!loading &&
                  filtered.length > 0 &&
                  paginated.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-white/10 hover:bg-secondary/10"
                    >
                      <Td className="font-medium">{c.title}</Td>
                      <Td className="text-text-secondary align-top">
                        <div className="max-w-xs whitespace-normal break-words text-xs leading-snug">
                          {c.description ?? '—'}
                        </div>
                      </Td>
                      <Td>
                        {c.class_categories ? (
                          <span className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-white/5">
                            {c.class_categories.color && (
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full border border-white/20"
                                style={{
                                  backgroundColor: c.class_categories.color,
                                }}
                              />
                            )}
                            <span>{c.class_categories.name}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-text-secondary">—</span>
                        )}
                      </Td>
                      <Td>
                        {c.coach ? (
                          <span className="text-xs">{c.coach.full_name}</span>
                        ) : (
                          <span className="text-xs text-text-secondary">—</span>
                        )}
                      </Td>
                      <Td>
                        {c.drop_in_enabled ? (
                          <span className="text-xs">
                            Ναι
                            {c.drop_in_price != null && (
                              <span className="opacity-80">
                                {' '}
                                ({c.drop_in_price.toFixed(2)}€)
                              </span>
                            )}
                            {c.member_drop_in_price != null && (
                              <span className="opacity-80">
                                {' '}
                                · Μέλος: {c.member_drop_in_price.toFixed(2)}€
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-text-secondary">Όχι</span>
                        )}
                      </Td>
                      <Td className="text-right space-x-1 pr-3">
                        <IconButton
                          icon={Pencil}
                          label="Επεξεργασία"
                          onClick={() => setEditRow(c)}
                        />
                        <DeleteButton id={c.id} onDeleted={load} />
                      </Td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* MOBILE / CARD VIEW */}
        <div className="md:hidden">
          {loading && (
            <div className="px-3 py-4 text-sm opacity-60">Loading…</div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="px-3 py-4 text-sm opacity-60">
              Δεν υπάρχουν τμήματα
            </div>
          )}

          {!loading &&
            filtered.length > 0 &&
            paginated.map((c) => (
              <div
                key={c.id}
                className="border-t border-white/10 bg-secondary/5 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-sm">{c.title}</div>
                    <div className="mt-0.5 text-xs text-text-secondary">
                      {c.coach
                        ? `Προπονητής: ${c.coach.full_name}`
                        : 'Χωρίς προπονητή'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <IconButton
                      icon={Pencil}
                      label="Επεξεργασία"
                      onClick={() => setEditRow(c)}
                    />
                    <DeleteButton id={c.id} onDeleted={load} />
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {c.class_categories && (
                    <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white/5">
                      {c.class_categories.color && (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full border border-white/20"
                          style={{
                            backgroundColor: c.class_categories.color,
                          }}
                        />
                      )}
                      <span>{c.class_categories.name}</span>
                    </span>
                  )}
                  <span className="opacity-80">
                    Drop-in:{' '}
                    {c.drop_in_enabled ? (
                      <>
                        Ναι
                        {c.drop_in_price != null && (
                          <span className="opacity-80">
                            {' '}
                            ({c.drop_in_price.toFixed(2)}€)
                          </span>
                        )}
                        {c.member_drop_in_price != null && (
                          <span className="opacity-80">
                            {' '}
                            · Μέλος: {c.member_drop_in_price.toFixed(2)}€
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-text-secondary">Όχι</span>
                    )}
                  </span>
                </div>

                <div className="mt-2 text-xs text-text-secondary whitespace-normal break-words leading-snug">
                  {c.description ?? '—'}
                </div>
              </div>
            ))}
        </div>

        {/* Shared pagination footer */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-3 py-2 text-xs text-text-secondary border-t border-white/10">
            <div>
              Εμφάνιση <span className="font-semibold">{startIdx}</span>
              {filtered.length > 0 && (
                <>
                  –<span className="font-semibold">{endIdx}</span>
                </>
              )}{' '}
              από <span className="font-semibold">{filtered.length}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span>Γραμμές ανά σελίδα:</span>
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
        )}
      </div>

      {showCreate && (
        <CreateClassModal
          tenantId={profile?.tenant_id!}
          categories={categories}
          coaches={coaches}
          onClose={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
      {editRow && (
        <EditClassModal
          row={editRow}
          categories={categories}
          coaches={coaches}
          onClose={() => {
            setEditRow(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Th({ children, className = '' }: any) {
  return <th className={`px-3 py-2 font-semibold ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: any) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}

function DeleteButton({
  id,
  onDeleted,
}: {
  id: string;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (!confirm('Διαγραφή αυτού του τμήματος; Αυτό δεν μπορεί να αναιρεθεί.'))
      return;
    setBusy(true);
    await supabase.functions.invoke('class-delete', { body: { id } });
    setBusy(false);
    onDeleted();
  };

  return (
    <button
      type="button"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/60 text-red-400 hover:bg-red-500/10 disabled:opacity-50 ml-1"
      onClick={onClick}
      disabled={busy}
      aria-label="Διαγραφή τμήματος"
      title="Διαγραφή τμήματος"
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

function CreateClassModal({
  tenantId,
  categories,
  coaches,
  onClose,
}: {
  tenantId: string;
  categories: Category[];
  coaches: Coach[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [coachId, setCoachId] = useState<string>('');
  const [dropInEnabled, setDropInEnabled] = useState(false);
  const [dropInPrice, setDropInPrice] = useState<number | null>(null);
  const [memberDropInPrice, setMemberDropInPrice] = useState<number | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    await supabase.functions.invoke('class-create', {
      body: {
        tenant_id: tenantId,
        title: title.trim(),
        description: description.trim() || null,
        category_id: categoryId || null,
        coach_id: coachId || null,
        drop_in_enabled: dropInEnabled,
        drop_in_price: dropInEnabled ? dropInPrice : null,
        member_drop_in_price: dropInEnabled ? memberDropInPrice : null,
      },
    });
    setBusy(false);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Νέο Τμήμα">
      <FormRow label="Τίτλος *">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </FormRow>
      <FormRow label="Περιγραφή">
        <textarea
          className="input"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormRow>
      <FormRow label="Κατηγορία">
        <select
          className="input"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Χωρίς κατηγορία</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FormRow>
      <FormRow label="Προπονητής">
        <select
          className="input"
          value={coachId}
          onChange={(e) => setCoachId(e.target.value)}
        >
          <option value="">Χωρίς προπονητή</option>
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
      </FormRow>
      <FormRow label="Drop-in συμμετοχή">
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={dropInEnabled}
              onChange={(e) => setDropInEnabled(e.target.checked)}
            />
            <span>Επιτρέπεται drop-in για αυτό το τμήμα</span>
          </label>
          {dropInEnabled && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm opacity-80">
                  Τιμή ανά συμμετοχή (€):
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className="input max-w-[120px]"
                  value={dropInPrice ?? ''}
                  onChange={(e) =>
                    setDropInPrice(
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm opacity-80">
                  Τιμή drop-in για μέλη (€):
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className="input max-w-[120px]"
                  value={memberDropInPrice ?? ''}
                  onChange={(e) =>
                    setMemberDropInPrice(
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                />
              </div>
            </>
          )}
        </div>
      </FormRow>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Ακύρωση
        </button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Δημιουργία…' : 'Δημιουργία'}
        </button>
      </div>
    </Modal>
  );
}

function EditClassModal({
  row,
  categories,
  coaches,
  onClose,
}: {
  row: GymClass;
  categories: Category[];
  coaches: Coach[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState(row.title ?? '');
  const [description, setDescription] = useState(row.description ?? '');
  const [categoryId, setCategoryId] = useState<string>(row.category_id ?? '');
  const [coachId, setCoachId] = useState<string>(row.coach_id ?? '');
  const [dropInEnabled, setDropInEnabled] = useState<boolean>(
    row.drop_in_enabled ?? false,
  );
  const [dropInPrice, setDropInPrice] = useState<number | null>(
    row.drop_in_price ?? null,
  );
  const [memberDropInPrice, setMemberDropInPrice] = useState<number | null>(
    row.member_drop_in_price ?? null,
  );
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const res = await supabase.functions.invoke('class-update', {
      body: {
        id: row.id,
        title: title.trim(),
        description: description.trim() || null,
        category_id: categoryId || null,
        coach_id: coachId || null,
        drop_in_enabled: dropInEnabled,
        drop_in_price: dropInEnabled ? dropInPrice : null,
        member_drop_in_price: dropInEnabled ? memberDropInPrice : null,
      },
    });
    if (res.error) {
      console.error('Edge error:', res.error);
      alert(res.error.message ?? 'Function error');
    }
    setBusy(false);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Επεξεργασία Τμήματος">
      <FormRow label="Τίτλος *">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </FormRow>
      <FormRow label="Περιγραφή">
        <textarea
          className="input"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormRow>
      <FormRow label="Κατηγορία">
        <select
          className="input"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Χωρίς κατηγορία</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FormRow>
      <FormRow label="Προπονητής">
        <select
          className="input"
          value={coachId}
          onChange={(e) => setCoachId(e.target.value)}
        >
          <option value="">Χωρίς προπονητή</option>
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
      </FormRow>

      <FormRow label="Drop-in συμμετοχή">
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={dropInEnabled}
              onChange={(e) => setDropInEnabled(e.target.checked)}
            />
            <span>Επιτρέπεται drop-in για αυτό το τμήμα</span>
          </label>
          {dropInEnabled && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm opacity-80">
                  Τιμή ανά συμμετοχή (€):
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className="input max-w-[120px]"
                  value={dropInPrice ?? ''}
                  onChange={(e) =>
                    setDropInPrice(
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm opacity-80">
                  Τιμή drop-in για μέλη (€):
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className="input max-w-[120px]"
                  value={memberDropInPrice ?? ''}
                  onChange={(e) =>
                    setMemberDropInPrice(
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                />
              </div>
            </>
          )}
        </div>
      </FormRow>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Ακύρωση
        </button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </button>
      </div>
    </Modal>
  );
}

/* small UI helpers */
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

function IconButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 hover:bg-secondary/20"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
      <span className="sr-only">{label}</span>
    </button>
  );
}
