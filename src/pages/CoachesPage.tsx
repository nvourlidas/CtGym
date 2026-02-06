import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import SubscriptionRequiredModal from '../components/SubscriptionRequiredModal';

type Coach = {
  id: string;
  tenant_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  bio: string | null;
  is_active: boolean;
  created_at: string;
};

export default function CoachesPage() {
  const { profile, subscription } = useAuth();
  const tenantId = profile?.tenant_id as string | undefined;

  const [showSubModal, setShowSubModal] = useState(false);

  const [rows, setRows] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Coach | null>(null);

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function load() {
    if (!tenantId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('coaches')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading coaches:', error);
    } else {
      setRows((data || []) as Coach[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (tenantId) {
      load();
    }
  }, [tenantId]);

  // filtering
  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => {
      return (
        (r.full_name ?? '').toLowerCase().includes(needle) ||
        (r.email ?? '').toLowerCase().includes(needle) ||
        (r.phone ?? '').toLowerCase().includes(needle) ||
        r.id.toLowerCase().includes(needle)
      );
    });
  }, [rows, q]);

  // reset page when filter/page size changes
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


  const subscriptionInactive = !subscription?.is_active;

  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) {
      setShowSubModal(true);
      return;
    }
    action();
  }


  return (
    <div className="p-6">
      {/* Header toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <input
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
          placeholder="Αναζήτηση προπονητών…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white"
          onClick={() => requireActiveSubscription(() => setShowCreate(true))}
        >
          Νέος Προπονητής
        </button>
      </div>

      {/* Table */}
      <div className="rounded-md border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary-background/60">
            <tr className="text-left">
              <Th>Όνομα</Th>
              <Th>Email</Th>
              <Th>Τηλέφωνο</Th>
              <Th>Κατάσταση</Th>
              <Th>Ημ. Δημιουργίας</Th>
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
                  Δεν υπάρχουν προπονητές
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
                  <Td className="font-medium">{c.full_name}</Td>
                  <Td className="text-text-secondary">
                    {c.email ?? '—'}
                  </Td>
                  <Td className="text-text-secondary">
                    {c.phone ?? '—'}
                  </Td>
                  <Td>
                    {c.is_active ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-400">
                        Ενεργός
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-white/5 text-text-secondary">
                        Ανενεργός
                      </span>
                    )}
                  </Td>
                  <Td>{new Date(c.created_at).toLocaleString()}</Td>
                  <Td className="text-right">
                    <button
                      className="px-2 py-1 text-sm rounded hover:bg-secondary/10"
                      onClick={() => requireActiveSubscription(() => setEditRow(c))}
                    >
                      Επεξεργασία
                    </button>
                    <DeleteCoachButton
                      id={c.id}
                      tenantId={tenantId!}
                      onDeleted={load}
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

      {/* Modals */}
      {showCreate && tenantId && (
        <CreateCoachModal
          tenantId={tenantId}
          onClose={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {editRow && (
        <EditCoachModal
          row={editRow}
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

/* Table helpers */
function Th({ children, className = '' }: { children: any; className?: string }) {
  return <th className={`px-3 py-2 font-semibold ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: { children: any; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}

/* Delete button */
function DeleteCoachButton({
  id,
  tenantId,
  onDeleted,
  guard,
}: {
  id: string;
  tenantId: string;
  onDeleted: () => void;
  guard: () => boolean;
}) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (guard && !guard()) return;
    if (!confirm('Διαγραφή αυτού του προπονητή; Αυτό δεν μπορεί να αναιρεθεί.')) return;
    setBusy(true);
    const { error } = await supabase
      .from('coaches')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('Error deleting coach:', error);
      alert(error.message ?? 'Σφάλμα κατά τη διαγραφή.');
    } else {
      onDeleted();
    }
    setBusy(false);
  };

  return (
    <button
      className="ml-2 px-2 py-1 text-sm rounded text-danger hover:bg-danger/10 disabled:opacity-50"
      onClick={onClick}
      disabled={busy}
    >
      {busy ? 'Διαγραφή…' : 'Διαγραφή'}
    </button>
  );
}

/* Create modal */
function CreateCoachModal({
  tenantId,
  onClose,
}: {
  tenantId: string;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!fullName.trim()) {
      alert('Το όνομα είναι υποχρεωτικό.');
      return;
    }
    setBusy(true);

    const { error } = await supabase.from('coaches').insert({
      tenant_id: tenantId,
      full_name: fullName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      bio: bio.trim() || null,
      is_active: isActive,
    });

    if (error) {
      console.error('Error creating coach:', error);
      alert(error.message ?? 'Σφάλμα κατά τη δημιουργία προπονητή.');
      setBusy(false);
      return;
    }

    setBusy(false);
    onClose();
  };

  return (
    <Modal title="Νέος Προπονητής" onClose={onClose}>
      <FormRow label="Ονοματεπώνυμο *">
        <input
          className="input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </FormRow>
      <FormRow label="Email">
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormRow>
      <FormRow label="Τηλέφωνο">
        <input
          className="input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </FormRow>
      <FormRow label="Σύντομο βιογραφικό / σημειώσεις">
        <textarea
          className="input"
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </FormRow>
      <FormRow label="Κατάσταση">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span>Ενεργός προπονητής</span>
        </label>
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

/* Edit modal */
function EditCoachModal({
  row,
  onClose,
}: {
  row: Coach;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState(row.full_name ?? '');
  const [email, setEmail] = useState(row.email ?? '');
  const [phone, setPhone] = useState(row.phone ?? '');
  const [bio, setBio] = useState(row.bio ?? '');
  const [isActive, setIsActive] = useState(row.is_active);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!fullName.trim()) {
      alert('Το όνομα είναι υποχρεωτικό.');
      return;
    }
    setBusy(true);

    const { error } = await supabase
      .from('coaches')
      .update({
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        bio: bio.trim() || null,
        is_active: isActive,
      })
      .eq('id', row.id);

    if (error) {
      console.error('Error updating coach:', error);
      alert(error.message ?? 'Σφάλμα κατά την ενημέρωση προπονητή.');
      setBusy(false);
      return;
    }

    setBusy(false);
    onClose();
  };

  return (
    <Modal title="Επεξεργασία Προπονητή" onClose={onClose}>
      <FormRow label="Ονοματεπώνυμο *">
        <input
          className="input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </FormRow>
      <FormRow label="Email">
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormRow>
      <FormRow label="Τηλέφωνο">
        <input
          className="input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </FormRow>
      <FormRow label="Σύντομο βιογραφικό / σημειώσεις">
        <textarea
          className="input"
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </FormRow>
      <FormRow label="Κατάσταση">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span>Ενεργός προπονητής</span>
        </label>
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

/* UI helpers (ίδια λογική με ClassesPage) */
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: any;
  onClose: () => void;
}) {
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

function FormRow({
  label,
  children,
}: {
  label: string;
  children: any;
}) {
  return (
    <label className="block mb-3">
      <div className="mb-1 text-sm opacity-80">{label}</div>
      {children}
    </label>
  );
}
