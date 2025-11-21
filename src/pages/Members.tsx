import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import MemberDetailsModal from '../components/Members/MemberDetailsModal';

type Member = {
  id: string;
  full_name: string | null;
  phone: string | null;
  tenant_id: string | null;
  role: 'member';
  created_at: string;
  email: string | null;
  birth_date?: string | null;
  address?: string | null;
  afm?: string | null;
  max_dropin_debt?: number | null;
};

export default function MembersPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Member | null>(null);

  // pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Details modal state
  const [detailsMember, setDetailsMember] = useState<Member | null>(null);

  // debts per member
  const [membershipDebts, setMembershipDebts] = useState<Record<string, number>>({});
  const [dropinDebts, setDropinDebts] = useState<Record<string, number>>({});

  const formatMoney = (value: number) => `${value.toFixed(2)} €`;

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);

    // 1) Load members (profiles)
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, full_name, phone, tenant_id, role, created_at, birth_date, address, afm, max_dropin_debt, email'
      )
      .eq('tenant_id', profile.tenant_id)
      .eq('role', 'member')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setRows([]);
      setMembershipDebts({});
      setDropinDebts({});
      setLoading(false);
      return;
    }

    const members = (data as Member[]) ?? [];
    setRows(members);

    const memberIds = members.map((m) => m.id);
    if (memberIds.length === 0) {
      setMembershipDebts({});
      setDropinDebts({});
      setLoading(false);
      return;
    }

    // 2) Membership debts: sum(memberships.debt) per user_id
    const { data: membershipsData, error: membErr } = await supabase
      .from('memberships')
      .select('user_id, debt')
      .eq('tenant_id', profile.tenant_id)
      .in('user_id', memberIds);

    const membershipMap: Record<string, number> = {};
    if (!membErr && membershipsData) {
      (membershipsData as any[]).forEach((m) => {
        const uid = m.user_id as string;
        const debtVal = Number(m.debt ?? 0);
        if (!Number.isFinite(debtVal)) return;
        membershipMap[uid] = (membershipMap[uid] ?? 0) + debtVal;
      });
    }

    // 3) Drop-in debts: sum(drop_in_price) where booking_type='drop_in' and drop_in_paid=false
    const { data: bookingsData, error: bookErr } = await supabase
      .from('bookings')
      .select('user_id, drop_in_price, booking_type, drop_in_paid')
      .eq('tenant_id', profile.tenant_id)
      .eq('booking_type', 'drop_in')
      .eq('drop_in_paid', false)
      .in('user_id', memberIds);

    const dropinMap: Record<string, number> = {};
    if (!bookErr && bookingsData) {
      (bookingsData as any[]).forEach((b) => {
        const uid = b.user_id as string;
        const priceVal = Number(b.drop_in_price ?? 0);
        if (!Number.isFinite(priceVal)) return;
        dropinMap[uid] = (dropinMap[uid] ?? 0) + priceVal;
      });
    }

    setMembershipDebts(membershipMap);
    setDropinDebts(dropinMap);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [profile?.tenant_id]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) =>
      (r.full_name ?? '').toLowerCase().includes(needle) ||
      (r.phone ?? '').toLowerCase().includes(needle) ||
      r.id.toLowerCase().includes(needle)
    );
  }, [rows, q]);

  // Reset to first page when filter or page size changes
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
          placeholder="Αναζήτηση μελών…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white"
          onClick={() => setShowCreate(true)}
        >
          Νέο Μέλος
        </button>
      </div>

      <div className="rounded-md border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary-background/60">
            <tr className="text-left">
              <Th>Όνομα</Th>
              <Th>Τηλέφωνο</Th>
              <Th>Συνολική Οφειλή</Th>
              <Th>Max Drop-in Οφειλή</Th>
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
                  No members
                </td>
              </tr>
            )}
            {!loading &&
              filtered.length > 0 &&
              paginated.map((m) => {
                const membershipDebt = membershipDebts[m.id] ?? 0;
                const dropinDebt = dropinDebts[m.id] ?? 0;
                const totalDebt = membershipDebt + dropinDebt;

                return (
                  <tr
                    key={m.id}
                    className="border-t border-white/10 hover:bg-secondary/10"
                  >
                    <Td>{m.full_name ?? '—'}</Td>
                    <Td>{m.phone ?? '—'}</Td>
                    <Td>
                      
                                        {totalDebt != null && totalDebt !== 0
                    ? <span className="text-amber-300 font-medium">{formatMoney(totalDebt)}</span>
                    : <span className="text-emerald-300 text-xs uppercase tracking-wide"> 0 </span>}
                    </Td>
                    <Td>
                      {m.max_dropin_debt != null
                        ? formatMoney(Number(m.max_dropin_debt))
                        : '—'}
                    </Td>
                    <Td>{new Date(m.created_at).toLocaleString()}</Td>
                    <Td className="text-right space-x-1">
                      <button
                        className="px-2 py-1 text-xs rounded border border-white/10 hover:bg-secondary/10"
                        onClick={() => setDetailsMember(m)}
                      >
                        Λεπτομέρειες
                      </button>
                      <button
                        className="px-2 py-1 text-xs rounded hover:bg-secondary/10"
                        onClick={() => setEditRow(m)}
                      >
                        Επεξεργασία
                      </button>
                      <DeleteButton id={m.id} onDeleted={load} />
                    </Td>
                  </tr>
                );
              })}
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

      {showCreate && profile?.tenant_id && (
        <CreateMemberModal
          tenantId={profile.tenant_id}
          onClose={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
      {editRow && (
        <EditMemberModal
          row={editRow}
          onClose={() => {
            setEditRow(null);
            load();
          }}
        />
      )}

      {/* Details modal (Details + History + Economic tabs) */}
      {detailsMember && profile?.tenant_id && (
        <MemberDetailsModal
          member={detailsMember}
          tenantId={profile.tenant_id}
          onClose={() => setDetailsMember(null)}
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

function DeleteButton({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (
      !confirm(
        'Διαγραφή αυτού του μέλους; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.'
      )
    )
      return;
    setBusy(true);
    await supabase.functions.invoke('member-delete', { body: { id } });
    setBusy(false);
    onDeleted();
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

/* CREATE */
function CreateMemberModal({
  tenantId,
  onClose,
}: {
  tenantId: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [afm, setAfm] = useState('');
  const [maxDropinDebt, setMaxDropinDebt] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password) return;
    setBusy(true);
    await supabase.functions.invoke('member-create', {
      body: {
        email,
        password,
        full_name: fullName,
        phone,
        tenant_id: tenantId,
        birth_date: birthDate || null,
        address: address || null,
        afm: afm || null,
        max_dropin_debt: maxDropinDebt ? Number(maxDropinDebt) : null,
      },
    });
    setBusy(false);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Νέο Μέλος">
      <FormRow label="Όνομα *">
        <input
          className="input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </FormRow>
      <FormRow label="Email *">
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
      <FormRow label="Ημ. γέννησης">
        <input
          className="input"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
      </FormRow>
      <FormRow label="Διεύθυνση">
        <input
          className="input"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </FormRow>
      <FormRow label="ΑΦΜ">
        <input
          className="input"
          value={afm}
          onChange={(e) => setAfm(e.target.value)}
        />
      </FormRow>
      <FormRow label="Μέγιστο χρέος drop-in">
        <input
          className="input"
          type="number"
          step="0.01"
          value={maxDropinDebt}
          onChange={(e) => setMaxDropinDebt(e.target.value)}
        />
      </FormRow>
      <FormRow label="Password *">
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormRow>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Ακύρωση
        </button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Δημιουργία...' : 'Δημιουργία'}
        </button>
      </div>
    </Modal>
  );
}

/* EDIT */
function EditMemberModal({
  row,
  onClose,
}: {
  row: Member;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState(row.full_name ?? '');
  const [phone, setPhone] = useState(row.phone ?? '');
  const [birthDate, setBirthDate] = useState(row.birth_date ?? '');
  const [address, setAddress] = useState(row.address ?? '');
  const [afm, setAfm] = useState(row.afm ?? '');
  const [maxDropinDebt, setMaxDropinDebt] = useState(
    row.max_dropin_debt != null ? String(row.max_dropin_debt) : ''
  );
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await supabase.functions.invoke('member-update', {
      body: {
        id: row.id,
        full_name: fullName,
        phone,
        password: password || undefined,
        birth_date: birthDate || null,
        address: address || null,
        afm: afm || null,
        max_dropin_debt: maxDropinDebt ? Number(maxDropinDebt) : null,
      },
    });
    setBusy(false);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Επεξεργασία Μέλους">
      <FormRow label="Όνομα">
        <input
          className="input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </FormRow>
      <FormRow label="Τηλέφωνο">
        <input
          className="input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </FormRow>
      <FormRow label="Ημ. γέννησης">
        <input
          className="input"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
      </FormRow>
      <FormRow label="Διεύθυνση">
        <input
          className="input"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </FormRow>
      <FormRow label="ΑΦΜ">
        <input
          className="input"
          value={afm}
          onChange={(e) => setAfm(e.target.value)}
        />
      </FormRow>
      <FormRow label="Μέγιστο χρέος drop-in">
        <input
          className="input"
          type="number"
          step="0.01"
          value={maxDropinDebt}
          onChange={(e) => setMaxDropinDebt(e.target.value)}
        />
      </FormRow>
      <FormRow label="Νέο password (προαιρετικό)">
        <input
          className="input"
          type="password"
          placeholder="Αφήστε κενό για να διατηρήσετε το τρέχον"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormRow>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Ακύρωση
        </button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Αποθήκευση...' : 'Αποθήκευση'}
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
