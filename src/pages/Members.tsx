import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import MemberDetailsModal from '../components/Members/MemberDetailsModal';
import SendMemberEmailModal from '../components/Members/SendMemberEmailModal';
import type { LucideIcon } from 'lucide-react';
import { Eye, Pencil, Trash2, Loader2 } from 'lucide-react';
import '../styles/quill-dark.css';
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale';
import SendMemberPushModal from '../components/Members/SendMemberPushModal';
import SubscriptionRequiredModal from '../components/SubscriptionRequiredModal';

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


type TenantRow = {
  name: string;
};

function formatDateDMY(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function dateToISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`; // "YYYY-MM-DD"
}

function parseISODateToLocal(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}



export default function MembersPage() {
  const { profile, subscription } = useAuth();
  const [showSubModal, setShowSubModal] = useState(false);
  const [tenant, setTenant] = useState<TenantRow | null>(null);
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
  const [membershipDebts, setMembershipDebts] = useState<Record<string, number>>(
    {},
  );
  const [dropinDebts, setDropinDebts] = useState<Record<string, number>>({});

  // email selection + modal
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showEmailModal, setShowEmailModal] = useState(false);

  const selectedMembers = useMemo(
    () => rows.filter((m) => selectedIds.includes(m.id)),
    [rows, selectedIds],
  );

  const [showPushModal, setShowPushModal] = useState(false);


  const formatMoney = (value: number) => `${value.toFixed(2)} €`;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const clearSelection = () => setSelectedIds([]);

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);

    // 1) Load members (profiles)
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, full_name, phone, tenant_id, role, created_at, birth_date, address, afm, max_dropin_debt, email',
      )
      .eq('tenant_id', profile.tenant_id)
      .eq('role', 'member')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setRows([]);
      setMembershipDebts({});
      setDropinDebts({});
      setSelectedIds([]);
      setLoading(false);
      return;
    }

    const members = (data as Member[]) ?? [];
    setRows(members);
    setSelectedIds([]); // καθάρισμα επιλογών σε κάθε φόρτωμα

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
    return rows.filter(
      (r) =>
        (r.full_name ?? '').toLowerCase().includes(needle) ||
        (r.phone ?? '').toLowerCase().includes(needle) ||
        r.id.toLowerCase().includes(needle),
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

  const pageIds = paginated.map((m) => m.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      if (allPageSelected) {
        // ξε-επιλογή όλων στη σελίδα
        return prev.filter((id) => !pageIds.includes(id));
      }
      // πρόσθεση όσων δεν υπάρχουν ήδη
      return [...prev, ...pageIds.filter((id) => !prev.includes(id))];
    });
  };

  useEffect(() => {
    (async () => {
      if (!profile?.tenant_id) {
        setTenant(null);
        return;
      }

      const { data, error } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', profile.tenant_id)
        .maybeSingle();

      if (error) {
        console.error('Failed to load tenant:', error);
        setTenant(null);
      } else {
        setTenant(data as TenantRow | null);
      }
    })();
  }, [profile?.tenant_id]);



  const subscriptionInactive = !subscription?.is_active;

  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) {
      setShowSubModal(true);
      return;
    }
    action();
  }


  const tenantNameFromProfile = tenant?.name ?? 'Cloudtec Gym';


  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
          placeholder="Αναζήτηση μελών…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white"
          onClick={() => requireActiveSubscription(() => setShowCreate(true))}
        >
          Νέο Μέλος
        </button>

        <button
          className="h-9 rounded-md px-3 text-sm border border-white/15 text-text-primary hover:bg-secondary/30 disabled:opacity-40"
          onClick={() => requireActiveSubscription(() => setShowEmailModal(true))}
          disabled={rows.length === 0}
        >
          Αποστολή Email
        </button>

        <button
          className="h-9 rounded-md px-3 text-sm border border-white/15 text-text-primary hover:bg-secondary/30 disabled:opacity-40"
          onClick={() => requireActiveSubscription(() => setShowPushModal(true))}
          disabled={rows.length === 0}
        >
          Αποστολή Push
        </button>



        {selectedIds.length > 0 && (
          <div className="text-xs text-text-secondary">
            Επιλεγμένα μέλη:{' '}
            <span className="font-semibold">{selectedIds.length}</span>{' '}
            <button
              type="button"
              className="underline ml-1"
              onClick={clearSelection}
            >
              (καθαρισμός)
            </button>
          </div>
        )}
      </div>

      <div className="rounded-md border border-white/10 overflow-hidden">
        {/* DESKTOP / TABLE VIEW */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-180 text-sm">
              <thead className="bg-secondary-background/60">
                <tr className="text-left">
                  <Th className="w-10">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={allPageSelected}
                      onChange={toggleSelectPage}
                    />
                  </Th>
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
                    <td className="px-3 py-4 opacity-60" colSpan={7}>
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 opacity-60" colSpan={7}>
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
                        <Td>
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={selectedIds.includes(m.id)}
                            onChange={() => toggleSelect(m.id)}
                          />
                        </Td>
                        <Td>{m.full_name ?? '—'}</Td>
                        <Td>{m.phone ?? '—'}</Td>
                        <Td>
                          {totalDebt !== 0 ? (
                            <span className="text-amber-300 font-medium">
                              {formatMoney(totalDebt)}
                            </span>
                          ) : (
                            <span className="text-emerald-300 text-xs uppercase tracking-wide">
                              0
                            </span>
                          )}
                        </Td>
                        <Td>
                          {m.max_dropin_debt != null
                            ? formatMoney(Number(m.max_dropin_debt))
                            : '—'}
                        </Td>
                        <Td>
                          {formatDateDMY(m.created_at)}
                        </Td>
                        <Td className="text-right space-x-1 pr-3">
                          <IconButton
                            icon={Eye}
                            label="Λεπτομέρειες"
                            onClick={() => setDetailsMember(m)}
                          />
                          <IconButton
                            icon={Pencil}
                            label="Επεξεργασία"
                            onClick={() => requireActiveSubscription(() => setEditRow(m))}
                          />
                          <DeleteButton
                            id={m.id}
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
                    );
                  })}
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
            <div className="px-3 py-4 text-sm opacity-60">No members</div>
          )}

          {!loading &&
            filtered.length > 0 &&
            paginated.map((m) => {
              const membershipDebt = membershipDebts[m.id] ?? 0;
              const dropinDebt = dropinDebts[m.id] ?? 0;
              const totalDebt = membershipDebt + dropinDebt;

              return (
                <div
                  key={m.id}
                  className="border-t border-white/10 bg-secondary/5 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 accent-primary"
                        checked={selectedIds.includes(m.id)}
                        onChange={() => toggleSelect(m.id)}
                      />
                      <div>
                        <div className="font-medium text-sm">
                          {m.full_name ?? '—'}
                        </div>
                        <div className="text-xs text-text-secondary">
                          {m.phone ?? '—'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <IconButton
                        icon={Eye}
                        label="Λεπτομέρειες"
                        onClick={() => setDetailsMember(m)}
                      />
                      <IconButton
                        icon={Pencil}
                        label="Επεξεργασία"
                        onClick={() => requireActiveSubscription(() => setEditRow(m))}
                      />
                      <DeleteButton
                        id={m.id}
                        onDeleted={load}
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

                  <div className="mt-2 space-y-1 text-xs">
                    <div>
                      <span className="opacity-70">Συνολική Οφειλή: </span>
                      {totalDebt !== 0 ? (
                        <span className="text-amber-300 font-medium">
                          {formatMoney(totalDebt)}
                        </span>
                      ) : (
                        <span className="text-emerald-300 uppercase tracking-wide">
                          0
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="opacity-70">Max Drop-in Οφειλή: </span>
                      {m.max_dropin_debt != null
                        ? formatMoney(Number(m.max_dropin_debt))
                        : '—'}
                    </div>
                    <div className="opacity-70">
                      Δημιουργήθηκε: {formatDateDMY(m.created_at)}
                    </div>

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
          subscriptionInactive={subscriptionInactive}
          onSubscriptionBlocked={() => setShowSubModal(true)}
        />
      )}

      {/* Send Email modal (separate component file) */}
      {showEmailModal && (
        <SendMemberEmailModal
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          tenantName={tenantNameFromProfile}
          tenantId={profile?.tenant_id ?? null}
          memberIds={selectedIds}
          selectedMembers={selectedMembers.map((m) => ({
            id: m.id,
            full_name: m.full_name,
            email: m.email,
          }))}
        />
      )}

      {showPushModal && (
        <SendMemberPushModal
          isOpen={showPushModal}
          onClose={() => setShowPushModal(false)}
          tenantName={tenantNameFromProfile}
          tenantId={profile?.tenant_id ?? null}
          selectedMembers={selectedMembers.map((m) => ({
            id: m.id,
            full_name: m.full_name,
            email: m.email,
            user_id: m.id, // 👈 ΠΡΟΣΟΧΗ: φρόντισε να υπάρχει αυτό στο m
          }))}
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

function DeleteButton({
  id,
  onDeleted,
  guard,
}: {
  id: string;
  onDeleted: () => void;
  guard?: () => boolean;
}) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (guard && !guard()) return; // ✅ subscription modal handled by parent
    if (
      !confirm(
        'Διαγραφή αυτού του μέλους; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.',
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
      type="button"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/60 text-red-400 hover:bg-red-500/10 disabled:opacity-50 ml-1"
      onClick={onClick}
      disabled={busy}
      aria-label="Διαγραφή μέλους"
      title="Διαγραφή μέλους"
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
  const [birthDate, setBirthDate] = useState<Date | null>(null);
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
        birth_date: birthDate ? dateToISODate(birthDate) : null,
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
        <DatePicker
          selected={birthDate}
          onChange={(date) => setBirthDate(date)}
          dateFormat="dd/MM/yyyy"
          locale={el}
          placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
          className="input"
          wrapperClassName="w-full"
          showMonthDropdown
          showYearDropdown
          dropdownMode="select"         // dropdown αντί για scroll
          scrollableYearDropdown        // (προαιρετικό) κάνει το year list scrollable
          yearDropdownItemNumber={80}   // πόσα χρόνια να δείχνει στο dropdown
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
  const [birthDate, setBirthDate] = useState<Date | null>(
    parseISODateToLocal(row.birth_date),
  );
  const [address, setAddress] = useState(row.address ?? '');
  const [afm, setAfm] = useState(row.afm ?? '');
  const [maxDropinDebt, setMaxDropinDebt] = useState(
    row.max_dropin_debt != null ? String(row.max_dropin_debt) : '',
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
        birth_date: birthDate ? dateToISODate(birthDate) : null,
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
        <DatePicker
          selected={birthDate}
          onChange={(date) => setBirthDate(date)}
          dateFormat="dd/MM/yyyy"
          locale={el}
          placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
          className="input"
          wrapperClassName="w-full"
          // 🔽 extra options για εύκολη επιλογή έτους
          showMonthDropdown
          showYearDropdown
          dropdownMode="select"         // dropdown αντί για scroll
          scrollableYearDropdown        // (προαιρετικό) κάνει το year list scrollable
          yearDropdownItemNumber={80}   // πόσα χρόνια να δείχνει στο dropdown
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
