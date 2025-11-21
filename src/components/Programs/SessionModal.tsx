// src/components/Programs/SessionModal.tsx
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import type { SessionRow, SessionRowFromDb } from '../../pages/Classes/ProgramsPage2';

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
  const [classSearch, setClassSearch] = useState('');
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [startsAt, setStartsAt] = useState<string>(''); // datetime-local (local time)
  const [endsAt, setEndsAt] = useState<string>('');
  const [capacity, setCapacity] = useState<number | ''>('');
  const [cancelBeforeHours, setCancelBeforeHours] = useState<number | ''>(''); // NEW
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

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!classDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target as Node)) {
        setClassDropdownOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [classDropdownOpen]);

  useEffect(() => {
    if (session) {
      // EDIT MODE – convert UTC ISO from DB -> local datetime-local string
      setClassId(session.class_id);
      setStartsAt(isoToLocalInputValue(session.starts_at));
      setEndsAt(session.ends_at ? isoToLocalInputValue(session.ends_at) : '');
      setCapacity(session.capacity ?? '');
      setCancelBeforeHours(
        session.cancel_before_hours != null ? session.cancel_before_hours : ''
      );
    } else if (defaultDate) {
      // CREATE MODE – default from clicked calendar date (local)
      const base = new Date(defaultDate);
      const end = new Date(base.getTime() + 60 * 60 * 1000);
      setStartsAt(toLocalInputValue(base));
      setEndsAt(toLocalInputValue(end));
      setClassId('');
      setCapacity('');
      setCancelBeforeHours('');
    }
  }, [session, defaultDate]);

  if (!open) return null;

  const isEdit = !!session;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !classId || !startsAt || !endsAt) return;

    setSaving(true);

    // LOCAL -> UTC for saving in DB
    const startIso = localInputToIso(startsAt);
    const endIso = localInputToIso(endsAt);
    const capVal = capacity === '' ? null : Number(capacity);
    const cancelVal =
      cancelBeforeHours === '' ? null : Number(cancelBeforeHours);

    try {
      if (isEdit && session) {
        const { data, error } = await supabase
          .from('class_sessions')
          .update({
            class_id: classId,
            starts_at: startIso,
            ends_at: endIso,
            capacity: capVal,
            cancel_before_hours: cancelVal,
          })
          .eq('id', session.id)
          .select(
            `id, tenant_id, class_id, starts_at, ends_at, capacity, cancel_before_hours, classes:classes(title)`
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
            cancel_before_hours: cancelVal,
          })
          .select(
            `id, tenant_id, class_id, starts_at, ends_at, capacity, cancel_before_hours, classes:classes(title)`
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
    const confirmDel = window.confirm('Σίγουρα θέλετε να διαγράψετε αυτή τη συνεδρία;');
    if (!confirmDel) return;

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

  const filteredClasses = classes.filter((c) =>
    c.title.toLowerCase().includes(classSearch.toLowerCase())
  );
  const selectedClass = classes.find((c) => c.id === classId);

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
          {/* Searchable class dropdown */}
          <div ref={dropdownRef} className="relative">
            <label className="block text-sm font-medium mb-1">Μάθημα</label>
            <button
              type="button"
              className="input flex items-center justify-between"
              onClick={() => setClassDropdownOpen((v) => !v)}
            >
              <span>
                {selectedClass ? selectedClass.title : 'Επιλέξτε μάθημα…'}
              </span>
              <span className="ml-2 text-xs opacity-70">
                {classDropdownOpen ? '▲' : '▼'}
              </span>
            </button>

            {classDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full rounded-md border border-white/15 bg-secondary-background shadow-lg">
                <div className="p-2 border-b border-white/10">
                  <input
                    autoFocus
                    className="input !h-9 !text-sm"
                    placeholder="Αναζήτηση μαθήματος..."
                    value={classSearch}
                    onChange={(e) => setClassSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {filteredClasses.length === 0 && (
                    <div className="px-3 py-2 text-xs text-text-secondary">
                      Δεν βρέθηκαν μαθήματα
                    </div>
                  )}
                  {filteredClasses.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-white/5 ${
                        c.id === classId ? 'bg-white/10' : ''
                      }`}
                      onClick={() => {
                        setClassId(c.id);
                        setClassDropdownOpen(false);
                      }}
                    >
                      {c.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
            <label className="block text-sm font-medium mb-1">
              Διαθέσιμες θέσεις
            </label>
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

          <div>
            <label className="block text-sm font-medium mb-1">
              Ακύρωση μέχρι (ώρες πριν, προαιρετικό)
            </label>
            <input
              type="number"
              min={0}
              className="input"
              value={cancelBeforeHours}
              onChange={(e) =>
                setCancelBeforeHours(
                  e.target.value === '' ? '' : Number(e.target.value)
                )
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

/** Converts a Date (local) -> "YYYY-MM-DDTHH:mm" for datetime-local */
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

/** Converts UTC ISO string from DB -> local datetime-local string */
function isoToLocalInputValue(iso: string) {
  const d = new Date(iso); // JS converts UTC -> local automatically
  return toLocalInputValue(d);
}

/** Converts datetime-local string (local) -> UTC ISO string for DB */
function localInputToIso(local: string) {
  // "YYYY-MM-DDTHH:mm" interpreted as local time
  return new Date(local).toISOString();
}
