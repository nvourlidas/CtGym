import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import { Calendar, Plus, Trash, Loader2, AlertTriangle } from 'lucide-react';
import SessionAttendanceModal from '../../components/Programs/SessionAttendanceModal';
import { SessionQrModal } from '../../components/SessionQrModal';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';

import type { GymClass, SessionRow, DateFilter } from './sessions/types';
import { formatDate, formatTime, startOfDay, startOfWeek, startOfMonth } from './sessions/sessionUtils';

import StyledSelect from './sessions/components/StyledSelect';
import SessionsTable from './sessions/components/SessionsTable';
import CreateSessionModal from './sessions/modals/CreateSessionModal';
import EditSessionModal from './sessions/modals/EditSessionModal';

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: '',      label: 'Όλες' },
  { value: 'today', label: 'Σήμερα' },
  { value: 'week',  label: 'Εβδομάδα' },
  { value: 'month', label: 'Μήνας' },
];

export default function ClassSessionsPage() {
  const { profile, subscription } = useAuth();
  const [showSubModal, setShowSubModal]           = useState(false);
  const [loading, setLoading]                     = useState(true);
  const [rows, setRows]                           = useState<SessionRow[]>([]);
  const [classes, setClasses]                     = useState<GymClass[]>([]);
  const [qClass, setQClass]                       = useState('');
  const [dateFilter, setDateFilter]               = useState<DateFilter>('');
  const [showCreate, setShowCreate]               = useState(false);
  const [editRow, setEditRow]                     = useState<SessionRow | null>(null);
  const [error, setError]                         = useState<string | null>(null);
  const [totalCount, setTotalCount]               = useState(0);
  const [page, setPage]                           = useState(1);
  const [pageSize, setPageSize]                   = useState(10);
  const [attendanceSession, setAttendanceSession] = useState<SessionRow | null>(null);
  const [qrSession, setQrSession]                 = useState<SessionRow | null>(null);
  const [selectedIds, setSelectedIds]             = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting]           = useState(false);

  const subscriptionInactive = !subscription?.is_active;

  function requireActiveSubscription(action: () => void) {
    if (subscriptionInactive) { setShowSubModal(true); return; }
    action();
  }

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true); setError(null);
    const from = (page - 1) * pageSize;
    try {
      const [clsRes, sessRes] = await Promise.all([
        supabase.from('classes').select('id,title,class_categories(id,name,color)').eq('tenant_id', profile.tenant_id).order('title'),
        (() => {
          let q = supabase.from('class_sessions')
            .select('id,tenant_id,class_id,starts_at,ends_at,capacity,created_at,cancel_before_hours,checkin_token', { count: 'exact' })
            .eq('tenant_id', profile.tenant_id).order('starts_at', { ascending: false });
          if (qClass) q = q.eq('class_id', qClass);
          if (dateFilter) {
            const now = new Date();
            let start: Date | null = null, end: Date | null = null;
            if (dateFilter === 'today') { start = startOfDay(now);  end = new Date(start); end.setDate(end.getDate() + 1); }
            if (dateFilter === 'week')  { start = startOfWeek(now); end = new Date(start); end.setDate(end.getDate() + 7); }
            if (dateFilter === 'month') { start = startOfMonth(now);end = new Date(start); end.setMonth(end.getMonth() + 1); }
            if (start && end) q = q.gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString());
          }
          return q.range(from, from + pageSize - 1);
        })(),
      ]);

      if (!clsRes.error) {
        setClasses(((clsRes.data as any[]) ?? []).map((row) => ({
          id: row.id, title: row.title,
          class_categories: Array.isArray(row.class_categories) ? row.class_categories[0] ?? null : row.class_categories ?? null,
        })));
      }
      if (!sessRes.error) { setRows((sessRes.data as SessionRow[]) ?? []); setTotalCount(sessRes.count ?? 0); }
      else { setRows([]); setTotalCount(0); }
      if (clsRes.error || sessRes.error) setError(clsRes.error?.message ?? sessRes.error?.message ?? null);
      setSelectedIds([]);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [profile?.tenant_id, page, pageSize, qClass, dateFilter]);
  useEffect(() => { setPage(1); }, [qClass, dateFilter, pageSize]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIdx  = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx    = Math.min(totalCount, page * pageSize);
  const getClass  = (id: string) => classes.find((c) => c.id === id);
  const pageIds   = rows.map((s) => s.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Διαγραφή ${selectedIds.length} συνεδριών; Αυτή η ενέργεια δεν μπορεί να ακυρωθεί.`)) return;
    setBulkDeleting(true); setError(null);
    try {
      const results = await Promise.all(selectedIds.map((id) => supabase.functions.invoke('session-delete', { body: { id } })));
      const firstError = results.find((r) => r.error || (r.data as any)?.error);
      if (firstError) setError(firstError.error?.message ?? (firstError.data as any)?.error ?? 'Η ομαδική διαγραφή είχε σφάλματα.');
      await load();
    } finally { setBulkDeleting(false); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <Calendar className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-black text-text-primary tracking-tight">Συνεδρίες</h1>
            <p className="text-xs text-text-secondary mt-px">{loading ? '…' : `${totalCount} συνεδρίες`}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => requireActiveSubscription(handleBulkDelete)}
            disabled={selectedIds.length === 0 || bulkDeleting}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-danger/25 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Διαγραφή επιλεγμένων</span>
            {selectedIds.length > 0 && <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-danger/20 text-danger text-[10px] font-bold">{selectedIds.length}</span>}
          </button>
          <button
            onClick={() => requireActiveSubscription(() => setShowCreate(true))}
            className="group relative inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px transition-all cursor-pointer overflow-hidden shrink-0"
          >
            <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
            <Plus className="h-3.5 w-3.5 relative z-10" />
            <span className="relative z-10 hidden sm:inline">Νέα Συνεδρία</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <StyledSelect value={qClass} onChange={setQClass}>
          <option value="">Όλα τα τμήματα</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </StyledSelect>

        <div className="flex items-center gap-1 p-1 rounded-xl border border-border/15 bg-secondary-background">
          {DATE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setDateFilter(f.value)}
              className={['h-7 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer', dateFilter === f.value ? 'bg-primary text-white shadow-sm shadow-primary/30' : 'text-text-secondary hover:text-text-primary hover:bg-secondary/30'].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Table */}
      <SessionsTable
        loading={loading} rows={rows} totalCount={totalCount} classes={classes}
        page={page} pageCount={pageCount} pageSize={pageSize} startIdx={startIdx} endIdx={endIdx}
        selectedIds={selectedIds} allPageSelected={allPageSelected} setSelectedIds={setSelectedIds}
        setPage={setPage} setPageSize={setPageSize}
        onEdit={(s) => requireActiveSubscription(() => setEditRow(s))}
        onDeleteGuard={() => { if (subscriptionInactive) { setShowSubModal(true); return false; } return true; }}
        onDeleted={load} setError={setError}
        onAttendance={setAttendanceSession}
        onQr={setQrSession}
      />

      {/* Modals */}
      {showCreate && <CreateSessionModal classes={classes} tenantId={profile?.tenant_id!} onClose={() => { setShowCreate(false); load(); }} setError={setError} />}
      {editRow    && <EditSessionModal row={editRow} classes={classes} onClose={() => { setEditRow(null); load(); }} setError={setError} />}
      {attendanceSession && profile?.tenant_id && (
        <SessionAttendanceModal
          tenantId={profile.tenant_id} sessionId={attendanceSession.id}
          sessionTitle={getClass(attendanceSession.class_id)?.title ?? '—'}
          sessionTime={`${formatDate(attendanceSession.starts_at)} • ${formatTime(attendanceSession.starts_at)}${attendanceSession.ends_at ? '–' + formatTime(attendanceSession.ends_at) : ''}`}
          onClose={() => setAttendanceSession(null)}
        />
      )}
      {qrSession && profile?.tenant_id && (
        <SessionQrModal open={true} onClose={() => setQrSession(null)} tenantId={profile.tenant_id} sessionId={qrSession.id} sessionTitle={getClass(qrSession.class_id)?.title ?? '—'} token={qrSession.checkin_token} />
      )}

      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </div>
  );
}
