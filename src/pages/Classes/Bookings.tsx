import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import { Plus, Search, CalendarDays, AlertTriangle, BookOpen } from 'lucide-react';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';

import type { Booking, DateFilterMode } from './bookings/types';
import { STATUS_OPTIONS } from './bookings/types';
import { translateErrorMessage } from './bookings/bookingUtils';
import StyledSelect from './bookings/components/StyledSelect';
import ModalShell from './bookings/components/ModalShell';
import PrimaryButton from './bookings/components/PrimaryButton';
import BookingsTable from './bookings/components/BookingsTable';
import CreateBookingModal from './bookings/modals/CreateBookingModal';
import EditBookingModal from './bookings/modals/EditBookingModal';

const DATE_MODES: { value: DateFilterMode; label: string }[] = [
  { value: 'all',    label: 'Όλες' },
  { value: 'today',  label: 'Σήμερα' },
  { value: 'custom', label: 'Ημερομηνία' },
];

export default function BookingsPage() {
  const { profile, subscription } = useAuth();
  const [showSubModal, setShowSubModal]         = useState(false);
  const [rows, setRows]                         = useState<Booking[]>([]);
  const [totalCount, setTotalCount]             = useState(0);
  const [loading, setLoading]                   = useState(true);
  const [q, setQ]                               = useState('');
  const [error, setError]                       = useState<string | null>(null);
  const [showCreate, setShowCreate]             = useState(false);
  const [editRow, setEditRow]                   = useState<Booking | null>(null);
  const [errorModal, setErrorModal]             = useState<{ title: string; message: string } | null>(null);
  const [classFilter, setClassFilter]           = useState('');
  const [statusFilter, setStatusFilter]         = useState('');
  const [dateFilterMode, setDateFilterMode]     = useState<DateFilterMode>('today');
  const [customDate, setCustomDate]             = useState('');
  const [bookingTypeFilter, setBookingTypeFilter] = useState('');
  const [page, setPage]                         = useState(1);
  const [pageSize, setPageSize]                 = useState(10);
  const [classOptions, setClassOptions]         = useState<{ id: string; title: string }[]>([]);

  const subscriptionInactive = !subscription?.is_active;
  const handleError = (title: string, message: string) => setErrorModal({ title, message: translateErrorMessage(message) });

  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) { setShowSubModal(true); return; }
    action();
  }

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true); setError(null);
    const from = (page - 1) * pageSize;

    let query = supabase.from('bookings_list')
      .select('id,tenant_id,session_id,user_id,status,created_at,booking_type,drop_in_price,member_full_name,starts_at,ends_at,capacity,class_id,class_title,category_name,category_color', { count: 'exact' })
      .eq('tenant_id', profile.tenant_id).order('created_at', { ascending: false });

    if (classFilter) query = query.eq('class_id', classFilter);
    if (statusFilter) query = query.eq('status', statusFilter);
    if (bookingTypeFilter) query = query.eq('booking_type', bookingTypeFilter);
    if (dateFilterMode === 'today' || (dateFilterMode === 'custom' && customDate)) {
      const base = dateFilterMode === 'today' ? new Date().toISOString().slice(0, 10) : customDate;
      query = query.gte('starts_at', `${base}T00:00:00.000Z`).lte('starts_at', `${base}T23:59:59.999Z`);
    }
    const needle = q.trim();
    if (needle) query = query.or(`member_full_name.ilike.%${needle}%,class_title.ilike.%${needle}%,category_name.ilike.%${needle}%,status.ilike.%${needle}%`);

    const { data, error: err, count } = await query.range(from, from + pageSize - 1);

    if (err) {
      const { data: bare, error: e2, count: c2 } = await supabase.from('bookings')
        .select('id,tenant_id,session_id,user_id,status,created_at,booking_type,drop_in_price', { count: 'exact' })
        .eq('tenant_id', profile.tenant_id).order('created_at', { ascending: false }).range(from, from + pageSize - 1);
      if (e2) { setError(e2.message); handleError('Σφάλμα φόρτωσης κρατήσεων', e2.message); setRows([]); setTotalCount(0); setLoading(false); return; }
      setRows(((bare as any[]) ?? []).map((b) => ({ ...b, profile: null, session: null })));
      setTotalCount(c2 ?? 0); setLoading(false); return;
    }

    setRows(((data as any[]) ?? []).map((r) => ({
      id: r.id, tenant_id: r.tenant_id, session_id: r.session_id, user_id: r.user_id,
      status: r.status, created_at: r.created_at,
      booking_type: r.booking_type ?? 'membership', drop_in_price: r.drop_in_price ?? null,
      profile: r.member_full_name ? { id: r.user_id, full_name: r.member_full_name } : null,
      session: r.starts_at ? { id: r.session_id, starts_at: r.starts_at, ends_at: r.ends_at, capacity: r.capacity, classes: r.class_id ? { id: r.class_id, title: r.class_title ?? '—', class_categories: r.category_name ? { name: r.category_name, color: r.category_color ?? null } : null } : null } : null,
    })));
    setTotalCount(count ?? 0);
    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id, page, pageSize, classFilter, statusFilter, bookingTypeFilter, dateFilterMode, customDate, q]);
  useEffect(() => { setPage(1); }, [q, pageSize, classFilter, statusFilter, bookingTypeFilter, dateFilterMode, customDate]);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    supabase.from('classes').select('id,title').eq('tenant_id', profile.tenant_id).order('title')
      .then(({ data }) => setClassOptions(((data as any[]) ?? []).map((c) => ({ id: c.id, title: c.title }))));
  }, [profile?.tenant_id]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIdx  = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx    = Math.min(totalCount, page * pageSize);

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <BookOpen className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-black text-text-primary tracking-tight">Κρατήσεις</h1>
            <p className="text-xs text-text-secondary mt-px">{loading ? '…' : `${totalCount} κρατήσεις`}</p>
          </div>
        </div>
        <button onClick={() => requireActiveSubscription(() => setShowCreate(true))}
          className="group relative inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px transition-all cursor-pointer overflow-hidden shrink-0"
        >
          <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          <Plus className="h-3.5 w-3.5 relative z-10" />
          <span className="relative z-10">Νέα Κράτηση</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
          <input className="w-full h-9 pl-9 pr-3 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all" placeholder="Αναζήτηση κρατήσεων…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <StyledSelect value={classFilter} onChange={setClassFilter} className="min-w-36">
          <option value="">Όλα τα τμήματα</option>
          {classOptions.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </StyledSelect>

        <StyledSelect value={statusFilter} onChange={setStatusFilter}>
          <option value="">Όλες οι καταστάσεις</option>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </StyledSelect>

        <StyledSelect value={bookingTypeFilter} onChange={setBookingTypeFilter}>
          <option value="">Όλοι οι τύποι</option>
          <option value="membership">Μέλος</option>
          <option value="drop_in">Drop-in</option>
        </StyledSelect>

        <div className="flex items-center gap-1 p-1 rounded-xl border border-border/15 bg-secondary-background">
          {DATE_MODES.map((m) => (
            <button key={m.value} onClick={() => setDateFilterMode(m.value)}
              className={['h-7 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer', dateFilterMode === m.value ? 'bg-primary text-white shadow-sm shadow-primary/30' : 'text-text-secondary hover:text-text-primary hover:bg-secondary/30'].join(' ')}
            >
              {m.label}
            </button>
          ))}
        </div>

        {dateFilterMode === 'custom' && (
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input type="date" className="h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all" value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Table */}
      <BookingsTable
        loading={loading} rows={rows} totalCount={totalCount}
        page={page} pageCount={pageCount} pageSize={pageSize} startIdx={startIdx} endIdx={endIdx}
        subscriptionInactive={subscriptionInactive}
        onEdit={(b) => requireActiveSubscription(() => setEditRow(b))}
        onDeleted={load} onError={handleError} onShowSubModal={() => setShowSubModal(true)}
        setPage={setPage} setPageSize={setPageSize}
      />

      {/* Modals */}
      {showCreate && <CreateBookingModal tenantId={profile?.tenant_id!} onClose={() => { setShowCreate(false); load(); }} onError={handleError} />}
      {editRow    && <EditBookingModal   row={editRow}                  onClose={() => { setEditRow(null); load(); }}    onError={handleError} />}

      {errorModal && (
        <ModalShell title={errorModal.title} icon={<AlertTriangle className="h-4 w-4 text-danger" />} onClose={() => setErrorModal(null)}
          footer={<PrimaryButton busy={false} busyLabel="" label="ΟΚ" onClick={() => setErrorModal(null)} />}
        >
          <p className="text-sm text-text-secondary whitespace-pre-line leading-relaxed">{errorModal.message}</p>
        </ModalShell>
      )}

      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </div>
  );
}
