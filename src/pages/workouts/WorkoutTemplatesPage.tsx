import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import type { LucideIcon } from 'lucide-react';
import { Pencil, Trash2, Loader2, Send, Plus } from 'lucide-react';
import CreateWorkoutTemplateModal from '../../components/workouts/CreateWorkoutTemplateModal';
import EditWorkoutTemplateModal from '../../components/workouts/EditWorkoutTemplateModal';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';

type TemplateRow = {
  id: string;
  tenant_id: string;
  created_by: string;
  coach_id: string | null;
  name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  workout_template_exercises?: Array<{ id: string }>;
};


type Member = {
  id: string; // auth.uid()
  full_name: string | null;
  email?: string | null;
};

export default function WorkoutTemplatesPage() {
  const { profile, subscription } = useAuth();
  const [showSubModal, setShowSubModal] = useState(false);

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

    const { data, error } = await supabase
      .from('workout_templates')
      .select('id,tenant_id,created_by,coach_id,name,notes,created_at,updated_at,workout_template_exercises(id)')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false });


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
          className="h-9 rounded-md border border-border/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
          placeholder="Αναζήτηση templates…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white inline-flex items-center gap-2"
          onClick={() => requireActiveSubscription(() => setShowCreate(true))}
        >
          <Plus className="h-4 w-4" />
          Νέο Template
        </button>
      </div>

      <div className="rounded-md border border-border/10 overflow-hidden">
        {/* DESKTOP TABLE */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-205 text-sm">
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
                    const exCount = w.workout_template_exercises?.length ?? 0;
                    return (
                      <tr
                        key={w.id}
                        className="border-t border-border/10 hover:bg-secondary/10"
                      >
                        <Td className="font-medium">{w.name ?? '—'}</Td>
                        <Td className="text-text-secondary">
                          <div className="max-w-xs whitespace-normal wrap-break-word text-xs leading-snug">
                            {w.notes ?? '—'}
                          </div>
                        </Td>
                        <Td>{exCount}</Td>
                        <Td className="text-text-secondary text-xs">
                          {new Date(w.updated_at ?? w.created_at).toLocaleString('el-GR')}
                        </Td>
                        <Td className="text-right space-x-1 pr-3">
                          <IconButton
                            icon={Send}
                            label="Ανάθεση"
                            onClick={() => requireActiveSubscription(() => setAssignRow(w))}
                          />
                          <IconButton
                            icon={Pencil}
                            label="Επεξεργασία"
                            onClick={() => requireActiveSubscription(() => setEditRow(w))}
                          />
                          <DeleteButton id={w.id} onDeleted={load}
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
              const exCount = w.workout_template_exercises?.length ?? 0;
              return (
                <div
                  key={w.id}
                  className="border-t border-border/10 bg-secondary/5 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-sm">
                        {w.name ?? 'Template'}
                      </div>
                      <div className="mt-0.5 text-xs text-text-secondary">
                        {exCount} ασκήσεις ·{' '}
                        {new Date(w.updated_at ?? w.created_at).toLocaleDateString('el-GR')}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <IconButton
                        icon={Send}
                        label="Ανάθεση"
                        onClick={() => requireActiveSubscription(() => setAssignRow(w))}
                      />
                      <IconButton
                        icon={Pencil}
                        label="Επεξεργασία"
                        onClick={() => requireActiveSubscription(() => setEditRow(w))}
                      />
                      <DeleteButton id={w.id} onDeleted={load}
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

                  <div className="mt-2 text-xs text-text-secondary whitespace-normal wrap-break-word leading-snug">
                    {w.notes ?? '—'}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Pagination footer */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-3 py-2 text-xs text-text-secondary border-t border-border/10">
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

      {showCreate && (
        <CreateWorkoutTemplateModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onSaved={load}
        />
      )}

      {editRow && (
        <EditWorkoutTemplateModal
          open={true}
          templateId={editRow.id}
          onClose={() => {
            setEditRow(null);
          }}
          onSaved={() => {
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


      <SubscriptionRequiredModal
        open={showSubModal}
        onClose={() => setShowSubModal(false)}
      />
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
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/10 hover:bg-secondary/20"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
      <span className="sr-only">{label}</span>
    </button>
  );
}

/* ------------------ actions ------------------ */

function DeleteButton({ id, onDeleted, guard }: { id: string; onDeleted: () => void; guard: () => boolean; }) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (guard && !guard()) return;
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
      <div className="w-full max-w-lg rounded-md border border-border/10 bg-secondary-background text-text-primary shadow-xl">
        <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
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
  const [memberQuery, setMemberQuery] = useState('');
  const [memberOpen, setMemberOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);


  const filteredMembers = useMemo(() => {
    const q = memberQuery.toLowerCase().trim();
    if (!q) return members;

    return members.filter((m) =>
      (m.full_name ?? '').toLowerCase().includes(q) ||
      (m.email ?? '').toLowerCase().includes(q),
    );
  }, [members, memberQuery]);

  useEffect(() => {
    if (!memberOpen) return;

    const onDown = (e: MouseEvent) => {
      const el = boxRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setMemberOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMemberOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [memberOpen]);

  const submit = async () => {
    if (!profile?.id) return;
    if (!memberId) return;

    setBusy(true);

    const res = await supabase.functions.invoke('workout-template-assign', {
      body: {
        template_id: row.id,
        member_id: memberId,
        coach_id: row.coach_id ?? null,  // optional, else function uses template.coach_id
        message: message.trim() || null,
      }

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
        <div className="relative" ref={boxRef}>
          <input
            className="input"
            placeholder="Αναζήτηση μέλους…"
            value={
              memberId
                ? (() => {
                  const m = members.find((x) => x.id === memberId);
                  return m ? (m.full_name ?? 'Μέλος') + (m.email ? ` · ${m.email}` : '') : '';
                })()
                : memberQuery
            }
            onChange={(e) => {
              setMemberQuery(e.target.value);
              setMemberId('');        // αν γράφει, σημαίνει δεν έχει επιλέξει
              setMemberOpen(true);
            }}
            onFocus={() => setMemberOpen(true)}
          />

          {memberOpen && (
            <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border/10 bg-secondary-background shadow-xl">
              <div className="sticky top-0 bg-secondary-background border-b border-border/10 px-3 py-2 flex items-center justify-between">
                <div className="text-xs text-text-secondary">
                  {filteredMembers.length} αποτελέσματα
                </div>
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded border border-border/10 hover:bg-secondary/20"
                  onClick={() => setMemberOpen(false)}
                >
                  Κλείσιμο
                </button>
              </div>

              {filteredMembers.length === 0 && (
                <div className="px-3 py-2 text-sm text-text-secondary">
                  Δεν βρέθηκαν μέλη
                </div>
              )}

              {filteredMembers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-secondary/20 text-sm"
                  // IMPORTANT: use onMouseDown so it fires before input loses focus
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setMemberId(m.id);
                    setMemberQuery('');
                    setMemberOpen(false);
                  }}
                >
                  <div className="font-medium">{m.full_name ?? 'Μέλος'}</div>
                  {m.email && <div className="text-xs text-text-secondary">{m.email}</div>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* μικρό hint / clear */}
        {memberId && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border border-border/10 hover:bg-secondary/20"
              onClick={() => {
                setMemberId('');
                setMemberQuery('');
              }}
            >
              Καθαρισμός επιλογής
            </button>
          </div>
        )}
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
