// src/components/SessionModal.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import type { SessionRow, SessionRowFromDb } from '../pages/Classes/ProgramsPage2';

type GymClass = { id: string; title: string };

export default function SessionModal({
  open,
  onClose,
  defaultDate,
  session,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  defaultDate: Date | null;
  session: SessionRow | null;
  onSaved: (s: SessionRow) => void;
  onDeleted: (id: string) => void;
}) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const [classes, setClasses] = useState<GymClass[]>([]);
  const [classId, setClassId] = useState<string>('');
  const [startsAt, setStartsAt] = useState<string>(''); // datetime-local
  const [endsAt, setEndsAt] = useState<string>('');
  const [capacity, setCapacity] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!tenantId || !open) return;
    const loadClasses = async () => {
      const { data } = await supabase
        .from('classes')
        .select('id,title')
        .eq('tenant_id', tenantId)
        .order('title');
      setClasses(data ?? []);
    };
    loadClasses();
  }, [tenantId, open]);

  useEffect(() => {
    if (session) {
      setClassId(session.class_id);
      setStartsAt(session.starts_at.slice(0, 16)); // yyyy-MM-ddTHH:mm
      setEndsAt(session.ends_at ? session.ends_at.slice(0, 16) : '');
      setCapacity(session.capacity ?? '');
    } else if (defaultDate) {
      const base = new Date(defaultDate);
      const end = new Date(base.getTime() + 60 * 60 * 1000);
      setStartsAt(toLocalInputValue(base));
      setEndsAt(toLocalInputValue(end));
      setClassId('');
      setCapacity('');
    }
  }, [session, defaultDate]);

  if (!open) return null;

  const isEdit = !!session;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !classId || !startsAt || !endsAt) return;

    setSaving(true);
    const startIso = new Date(startsAt).toISOString();
    const endIso = new Date(endsAt).toISOString();
    const capVal = capacity === '' ? null : Number(capacity);

    try {
      if (isEdit) {
        const { data, error } = await supabase
          .from('class_sessions')
          .update({
            class_id: classId,
            starts_at: startIso,
            ends_at: endIso,
            capacity: capVal,
          })
          .eq('id', session!.id)
          .select(
            `id, tenant_id, class_id, starts_at, ends_at, capacity, classes:classes(title)`
          )
          .single();

        if (error) throw error;

        const raw = data as SessionRowFromDb;
        const normalized: SessionRow = {
          ...raw,
          classes: Array.isArray(raw.classes)
            ? raw.classes[0] ?? null
            : (raw.classes as any) ?? null,
        };

        onSaved(normalized);
      } else {
        const { data, error } = await supabase
          .from('class_sessions')
          .insert({
            tenant_id: tenantId,
            class_id: classId,
            starts_at: startIso,
            ends_at: endIso,
            capacity: capVal,
          })
          .select(
            `id, tenant_id, class_id, starts_at, ends_at, capacity, classes:classes(title)`
          )
          .single();

        if (error) throw error;

        const raw = data as SessionRowFromDb;
        const normalized: SessionRow = {
          ...raw,
          classes: Array.isArray(raw.classes)
            ? raw.classes[0] ?? null
            : (raw.classes as any) ?? null,
        };

        onSaved(normalized);
      }
      onClose();
    } catch (err) {
      console.error('Failed to save session', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!session) return;
    const confirm = window.confirm('Σίγουρα θέλετε να διαγράψετε αυτή τη συνεδρία;');
    if (!confirm) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('class_sessions')
        .delete()
        .eq('id', session.id);

      if (error) throw error;

      onDeleted(session.id);
      onClose();
    } catch (err) {
      console.error('Failed to delete session', err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-secondary-background p-6 shadow-2xl text-text-primary">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {isEdit ? 'Επεξεργασία συνεδρίας' : 'Νέα συνεδρία'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-md border border-white/10 text-sm hover:bg-white/5"
          >
            ✕
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium mb-1">Μάθημα</label>
            <select
              className="input"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              required
            >
              <option value="">Επιλέξτε μάθημα…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Έναρξη</label>
              <input
                type="datetime-local"
                className="input"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Λήξη</label>
              <input
                type="datetime-local"
                className="input"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Διαθέσιμες θέσεις</label>
            <input
              type="number"
              min={0}
              className="input"
              value={capacity}
              onChange={(e) =>
                setCapacity(e.target.value === '' ? '' : Number(e.target.value))
              }
            />
          </div>

          <div className="mt-4 flex justify-between gap-2">
            {isEdit ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="h-9 rounded-md px-3 text-sm border border-red-500/70 text-red-400 hover:bg-red-500/10 disabled:opacity-60"
              >
                {deleting ? 'Διαγραφή…' : 'Διαγραφή συνεδρίας'}
              </button>
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary"
              >
                Άκυρο
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary disabled:opacity-60"
              >
                {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  );
}
