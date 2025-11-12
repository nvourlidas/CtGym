import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';

type GymClass = {
  id: string;
  title: string;
};

type SessionRow = {
  id: string;
  tenant_id: string;
  class_id: string;
  starts_at: string; // ISO
  ends_at: string;   // ISO
  capacity: number | null;
  created_at: string;
  //classes?: { title: string }; // joined
};

export default function ClassSessionsPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [qClass, setQClass] = useState<string>(''); // filter
  const [dateFrom, setDateFrom] = useState<string>(''); // yyyy-mm-dd
  const [dateTo, setDateTo] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<SessionRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);
    setError(null);

    const [cls, sess] = await Promise.all([
      supabase.from('classes')
        .select('id, title')
        .eq('tenant_id', profile.tenant_id)
        .order('title'),
      supabase.from('class_sessions')
        .select('id, tenant_id, class_id, starts_at, ends_at, capacity, created_at')
        .eq('tenant_id', profile.tenant_id)
        .order('starts_at', { ascending: true }),
    ]);

    if (!cls.error) setClasses((cls.data as GymClass[]) ?? []);
    if (!sess.error) setRows((sess.data as SessionRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.tenant_id]);

  const filtered = useMemo(() => {
    let list = rows;
    if (qClass) list = list.filter(r => r.class_id === qClass);
    if (dateFrom) list = list.filter(r => new Date(r.starts_at) >= new Date(dateFrom));
    if (dateTo) {
      const end = new Date(dateTo);
      end.setDate(end.getDate() + 1); // include entire 'to' day
      list = list.filter(r => new Date(r.starts_at) < end);
    }
    return list;
  }, [rows, qClass, dateFrom, dateTo]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <select
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm"
          value={qClass} onChange={e => setQClass(e.target.value)}
        >
          <option value="">All classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>

        <input type="date"
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm"
          value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <input type="date"
          className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm"
          value={dateTo} onChange={e => setDateTo(e.target.value)} />

        <button
          className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white"
          onClick={() => setShowCreate(true)}
        >
          New Session
        </button>
      </div>

      {error && (
        <div className="mb-4 text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">
          {error}
        </div>
      )}

      <div className="rounded-md border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary-background/60">
            <tr className="text-left">
              <Th>Class</Th>
              <Th>Starts</Th>
              <Th>Ends</Th>
              <Th>Capacity</Th>
              <Th className="text-right pr-3">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="px-3 py-4 opacity-60" colSpan={5}>Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td className="px-3 py-4 opacity-60" colSpan={5}>No sessions</td></tr>}
            {filtered.map(s => (
              <tr key={s.id} className="border-t border-white/10 hover:bg-secondary/10">
                <Td className="font-medium">
                  {classes.find(c => c.id === s.class_id)?.title ?? '—'}
                </Td>
                <Td>{new Date(s.starts_at).toLocaleString()}</Td>
                <Td>{new Date(s.ends_at).toLocaleString()}</Td>
                <Td>{s.capacity ?? '—'}</Td>
                <Td className="text-right">
                  <button className="px-2 py-1 text-sm rounded hover:bg-secondary/10"
                    onClick={() => setEditRow(s)}>Edit</button>
                  <DeleteButton id={s.id} onDeleted={load} setError={setError} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateSessionModal
          classes={classes}
          tenantId={profile?.tenant_id!}
          onClose={() => { setShowCreate(false); load(); }}
          setError={setError}
        />
      )}
      {editRow && (
        <EditSessionModal
          row={editRow}
          classes={classes}
          onClose={() => { setEditRow(null); load(); }}
          setError={setError}
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

function DeleteButton({ id, onDeleted, setError }: { id: string; onDeleted: () => void; setError: (s: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    setBusy(true);
    const res = await supabase.functions.invoke('session-delete', { body: { id } });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? 'Delete failed');
    } else if ((res.data as any)?.error) {
      setError((res.data as any).error);
    } else {
      setError(null);
      onDeleted();
    }
  };
  return (
    <button className="ml-2 px-2 py-1 text-sm rounded text-danger hover:bg-danger/10 disabled:opacity-50"
      onClick={onClick} disabled={busy}>
      {busy ? 'Deleting…' : 'Delete'}
    </button>
  );
}

function CreateSessionModal({ classes, tenantId, onClose, setError }:
  { classes: GymClass[]; tenantId: string; onClose: () => void; setError: (s: string | null) => void }) {
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [starts, setStarts] = useState<string>(''); // datetime-local
  const [ends, setEnds] = useState<string>('');
  const [capacity, setCapacity] = useState<number>(20);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!classId || !starts || !ends) return;
    setBusy(true);
    const res = await supabase.functions.invoke('session-create', {
      body: {
        tenant_id: tenantId,
        class_id: classId,
        starts_at: new Date(starts).toISOString(),
        ends_at: new Date(ends).toISOString(),
        capacity,
      },
    });
    setBusy(false);
    if (res.error || (res.data as any)?.error) {
      setError(res.error?.message ?? (res.data as any)?.error ?? 'Create failed');
      return;
    }
    setError(null);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="New Session">
      <FormRow label="Class *">
        <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
          {classes.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </FormRow>
      <FormRow label="Starts *">
        <input className="input" type="datetime-local" value={starts} onChange={e => setStarts(e.target.value)} />
      </FormRow>
      <FormRow label="Ends *">
        <input className="input" type="datetime-local" value={ends} onChange={e => setEnds(e.target.value)} />
      </FormRow>
      <FormRow label="Capacity">
        <input className="input" type="number" min={0} value={capacity}
          onChange={e => setCapacity(Number(e.target.value))} />
      </FormRow>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Creating…' : 'Create'}
        </button>
      </div>
    </Modal>
  );
}

function EditSessionModal({ row, classes, onClose, setError }:
  { row: SessionRow; classes: GymClass[]; onClose: () => void; setError: (s: string | null) => void }) {

  const [classId, setClassId] = useState(row.class_id);
  const [starts, setStarts] = useState<string>(() => toLocalDT(row.starts_at));
  const [ends, setEnds] = useState<string>(() => toLocalDT(row.ends_at));
  const [capacity, setCapacity] = useState<number>(row.capacity ?? 20);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!classId || !starts || !ends) return;
    setBusy(true);
    const res = await supabase.functions.invoke('session-update', {
      body: {
        id: row.id,
        class_id: classId,
        starts_at: new Date(starts).toISOString(),
        ends_at: new Date(ends).toISOString(),
        capacity,
      },
    });
    setBusy(false);
    if (res.error || (res.data as any)?.error) {
      setError(res.error?.message ?? (res.data as any)?.error ?? 'Save failed');
      return;
    }
    setError(null);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Edit Session">
      <FormRow label="Class *">
        <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
          {classes.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </FormRow>
      <FormRow label="Starts *">
        <input className="input" type="datetime-local" value={starts} onChange={e => setStarts(e.target.value)} />
      </FormRow>
      <FormRow label="Ends *">
        <input className="input" type="datetime-local" value={ends} onChange={e => setEnds(e.target.value)} />
      </FormRow>
      <FormRow label="Capacity">
        <input className="input" type="number" min={0} value={capacity}
          onChange={e => setCapacity(Number(e.target.value))} />
      </FormRow>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}

/* helpers */
function toLocalDT(iso: string) {
  // returns "yyyy-mm-ddThh:mm" for <input type="datetime-local" />
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

/* small UI helpers (same as your page) */
function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-md border border-white/10 bg-secondary-background text-text-primary shadow-xl">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="rounded px-2 py-1 hover:bg-white/5">✕</button>
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
