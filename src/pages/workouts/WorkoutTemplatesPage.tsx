import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import type { LucideIcon } from 'lucide-react';
import { Pencil, Trash2, Loader2, Send, Plus } from 'lucide-react';
import CreateWorkoutTemplateModal from '../../components/workouts/CreateWorkoutTemplateModal';

type TemplateRow = {
  id: string;
  user_id: string;
  name: string | null;
  notes: string | null;
  performed_at: string;
  is_template: boolean;
  workout_exercises?: Array<{ id: string }>;
};

type Member = {
  id: string; // auth.uid()
  full_name: string | null;
  email?: string | null;
};

export default function WorkoutTemplatesPage() {
  const { profile } = useAuth();

  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<TemplateRow | null>(null);
  const [assignRow, setAssignRow] = useState<TemplateRow | null>(null);

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);

    // templates: workouts with is_template=true
    const { data, error } = await supabase
      .from('workouts')
      .select('id,user_id,name,notes,performed_at,is_template,workout_exercises(id)')
      .eq('is_template', true)
      .order('performed_at', { ascending: false });

    if (!error && data) setRows(data as any[]);
    setLoading(false);
  }

  async function loadMembers() {
    if (!profile?.tenant_id) return;

    // ✅ Adjust this query to match your actual members source.
    // If you have a "members" table, use that.
    // If you store everyone in "profiles", filter by tenant_id + role='member'
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('tenant_id', profile.tenant_id)
      .eq('role', 'member')
      .order('full_name', { ascending: true });

    if (!error && data) setMembers(data as any[]);
  }

  useEffect(() => {
    load();
    loadMembers();
  }, [profile?.tenant_id]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter(
      (r) =>
        (r.name ?? '').toLowerCase().includes(needle) ||
        (r.notes ?? '').toLowerCase().includes(needle) ||
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

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <input
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
          placeholder="Αναζήτηση templates…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white inline-flex items-center gap-2"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="h-4 w-4" />
          Νέο Template
        </button>
      </div>

      <div className="rounded-md border border-white/10 overflow-hidden">
        {/* DESKTOP TABLE */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-secondary-background/60">
                <tr className="text-left">
                  <Th>Όνομα</Th>
                  <Th>Σημειώσεις</Th>
                  <Th>Ασκήσεις</Th>
                  <Th>Ημ/νία</Th>
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
                      Δεν υπάρχουν templates
                    </td>
                  </tr>
                )}

                {!loading &&
                  filtered.length > 0 &&
                  paginated.map((w) => {
                    const exCount = w.workout_exercises?.length ?? 0;
                    return (
                      <tr
                        key={w.id}
                        className="border-t border-white/10 hover:bg-secondary/10"
                      >
                        <Td className="font-medium">{w.name ?? '—'}</Td>
                        <Td className="text-text-secondary">
                          <div className="max-w-xs whitespace-normal break-words text-xs leading-snug">
                            {w.notes ?? '—'}
                          </div>
                        </Td>
                        <Td>{exCount}</Td>
                        <Td className="text-text-secondary text-xs">
                          {new Date(w.performed_at).toLocaleString('el-GR')}
                        </Td>
                        <Td className="text-right space-x-1 pr-3">
                          <IconButton
                            icon={Send}
                            label="Ανάθεση"
                            onClick={() => setAssignRow(w)}
                          />
                          <IconButton
                            icon={Pencil}
                            label="Επεξεργασία"
                            onClick={() => setEditRow(w)}
                          />
                          <DeleteButton id={w.id} onDeleted={load} />
                        </Td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* MOBILE CARDS */}
        <div className="md:hidden">
          {loading && (
            <div className="px-3 py-4 text-sm opacity-60">Loading…</div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="px-3 py-4 text-sm opacity-60">
              Δεν υπάρχουν templates
            </div>
          )}

          {!loading &&
            filtered.length > 0 &&
            paginated.map((w) => {
              const exCount = w.workout_exercises?.length ?? 0;
              return (
                <div
                  key={w.id}
                  className="border-t border-white/10 bg-secondary/5 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-sm">
                        {w.name ?? 'Template'}
                      </div>
                      <div className="mt-0.5 text-xs text-text-secondary">
                        {exCount} ασκήσεις ·{' '}
                        {new Date(w.performed_at).toLocaleDateString('el-GR')}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <IconButton
                        icon={Send}
                        label="Ανάθεση"
                        onClick={() => setAssignRow(w)}
                      />
                      <IconButton
                        icon={Pencil}
                        label="Επεξεργασία"
                        onClick={() => setEditRow(w)}
                      />
                      <DeleteButton id={w.id} onDeleted={load} />
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-text-secondary whitespace-normal break-words leading-snug">
                    {w.notes ?? '—'}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Pagination footer */}
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
        <CreateWorkoutTemplateModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onSaved={load}
        />
      )}

      {editRow && (
        <EditTemplateModal
          row={editRow}
          onClose={() => {
            setEditRow(null);
            load();
          }}
        />
      )}

      {assignRow && (
        <AssignTemplateModal
          row={assignRow}
          members={members}
          onClose={() => {
            setAssignRow(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/* ------------------ UI helpers (same as your page) ------------------ */

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

/* ------------------ actions ------------------ */

function DeleteButton({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (!confirm('Διαγραφή αυτού του template; Αυτό δεν μπορεί να αναιρεθεί.')) return;
    setBusy(true);
    await supabase.functions.invoke('workout-template-delete', { body: { id } });
    setBusy(false);
    onDeleted();
  };

  return (
    <button
      type="button"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/60 text-red-400 hover:bg-red-500/10 disabled:opacity-50 ml-1"
      onClick={onClick}
      disabled={busy}
      aria-label="Διαγραφή template"
      title="Διαγραφή template"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      <span className="sr-only">Διαγραφή</span>
    </button>
  );
}

/* ------------------ Modals (same pattern as your file) ------------------ */

function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-md border border-white/10 bg-secondary-background text-text-primary shadow-xl">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="rounded px-2 py-1 hover:bg-white/5">
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

function CreateTemplateModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const { profile } = useAuth();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!profile?.id) return;
    if (!name.trim()) return;

    setBusy(true);
    const res = await supabase.functions.invoke('workout-template-create', {
      body: {
        user_id: profile.id,
        name: name.trim(),
        notes: notes.trim() || null,
      },
    });

    if (res.error) {
      console.error(res.error);
      alert(res.error.message ?? 'Function error');
    }

    setBusy(false);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Νέο Template">
      <FormRow label="Όνομα *">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </FormRow>

      <FormRow label="Σημειώσεις">
        <textarea
          className="input"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </FormRow>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Ακύρωση
        </button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Δημιουργία…' : 'Δημιουργία'}
        </button>
      </div>

      <div className="mt-3 text-xs text-text-secondary">
        * Η δημιουργία εδώ φτιάχνει “κεφαλίδα” template. Τις ασκήσεις/sets τις
        προσθέτεις από το mobile ή από επόμενο builder που θα φτιάξουμε.
      </div>
    </Modal>
  );
}

function EditTemplateModal({ row, onClose }: { row: TemplateRow; onClose: () => void }) {
  const [name, setName] = useState(row.name ?? '');
  const [notes, setNotes] = useState(row.notes ?? '');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);

    const res = await supabase.functions.invoke('workout-template-update', {
      body: { id: row.id, name: name.trim(), notes: notes.trim() || null },
    });

    if (res.error) {
      console.error(res.error);
      alert(res.error.message ?? 'Function error');
    }

    setBusy(false);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Επεξεργασία Template">
      <FormRow label="Όνομα *">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </FormRow>

      <FormRow label="Σημειώσεις">
        <textarea
          className="input"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
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

function AssignTemplateModal({
  row,
  members,
  onClose,
}: {
  row: TemplateRow;
  members: Member[];
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const [memberId, setMemberId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!profile?.id) return;
    if (!memberId) return;

    setBusy(true);

    const res = await supabase.functions.invoke('workout-template-assign', {
      body: {
        template_workout_id: row.id,
        trainer_id: profile.id,
        member_id: memberId,
        message: message.trim() || null,
      },
    });

    if (res.error) {
      console.error(res.error);
      alert(res.error.message ?? 'Function error');
    }

    setBusy(false);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Ανάθεση Template">
      <div className="mb-3 text-sm">
        <div className="opacity-80">Template</div>
        <div className="font-semibold">{row.name ?? row.id}</div>
      </div>

      <FormRow label="Μέλος *">
        <select
          className="input"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
        >
          <option value="">Επιλογή μέλους…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {(m.full_name ?? 'Μέλος') + (m.email ? ` · ${m.email}` : '')}
            </option>
          ))}
        </select>
      </FormRow>

      <FormRow label="Μήνυμα (προαιρετικό)">
        <textarea
          className="input"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </FormRow>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Ακύρωση
        </button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Αποστολή…' : 'Αποστολή'}
        </button>
      </div>
    </Modal>
  );
}
