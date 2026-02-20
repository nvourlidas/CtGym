// src/components/ProgramGeneratorModal.tsx
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import DatePicker from 'react-datepicker';
import { el } from 'date-fns/locale/el';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';

import { addMonths, isAfter, } from 'date-fns';
import { useNavigate } from 'react-router-dom';

import { Rocket } from "lucide-react";



type GymClass = { id: string; title: string };

// ✅ same idea as your member modal: store Date objects, send/compute ISO dates when needed
// function dateToISODate(d: Date) {
//   const y = d.getFullYear();
//   const m = String(d.getMonth() + 1).padStart(2, '0');
//   const day = String(d.getDate()).padStart(2, '0');
//   return `${y}-${m}-${day}`; // local date (no timezone shift)
// }


type Toast = {
  id: string;
  title: string;
  message?: string;
  variant?: "error" | "success" | "info";
  actionLabel?: string;
  onAction?: () => void;
};

function ToastHost({
  toasts,
  dismiss,
}: {
  toasts: Toast[];
  dismiss: (id: string) => void;
}) {
  return (
    <div className="fixed right-4 top-4 z-100 flex w-120 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            "rounded-xl border border-border/15 bg-secondary-background/95 backdrop-blur shadow-2xl shadow-black/20",
            "px-3 py-3",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div
                className={[
                  "text-sm font-semibold",
                  t.variant === "error" ? "text-danger" : "",
                  t.variant === "success" ? "text-success" : "",
                ].join(" ")}
              >
                {t.title}
              </div>
              {t.message && (
                <div className="mt-1 text-xs text-text-secondary">{t.message}</div>
              )}
              {t.actionLabel && t.onAction && (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => t.onAction?.()}
                    className="inline-flex items-center gap-2 h-8 rounded-md px-3 text-xs font-semibold bg-primary hover:bg-primary/90 text-white shadow-md hover:shadow-lg transition-all cursor-pointer"
                  >
                    <Rocket className="h-3.5 w-3.5" />
                    {t.actionLabel}
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="rounded-md border border-border/15 px-2 py-1 text-xs hover:bg-secondary/30"
              aria-label="Κλείσιμο"
              title="Κλείσιμο"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProgramGeneratorModal({
  open,
  onClose,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  onGenerated: () => void;
}) {
  const { profile, subscription } = useAuth();
  const navigate = useNavigate();
  const tenantId = profile?.tenant_id;

  function getTier(sub: any): 'free' | 'starter' | 'pro' {
    const name = String(sub?.plan_name ?? sub?.plan?.name ?? '').toLowerCase();
    const code = String(sub?.plan_code ?? sub?.plan?.code ?? '').toLowerCase();

    // make it resilient to your naming
    if (name.includes('pro') || code.includes('pro')) return 'pro';
    if (name.includes('starter') || code.includes('starter')) return 'starter';
    return 'free';
  }

  const tier = getTier(subscription as any);

  // "ahead from today"
  const today0 = startOfDay(new Date());

  const maxAllowedDate: Date | null =
    tier === 'pro'
      ? null
      : tier === 'starter'
        ? addMonths(today0, 3)
        : addDays(today0, 7);


  function startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addDays(d: Date, days: number) {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
  }

  // Decide horizon (Free=7d, Starter=~90d, Pro=unlimited)
  // Adjust the detection to your actual subscription fields if needed.
  function getHorizonDays(): number {
    const planName = String((subscription as any)?.plan_name ?? (subscription as any)?.name ?? "").toLowerCase();
    const planTier = String((subscription as any)?.plan_id?? (subscription as any)?.tier ?? "").toLowerCase();

    const isPro = planTier === "pro" || planName.includes("pro") || planTier.includes("friend_app");
    const isStarter = planTier === "starter" || planName.includes("starter") || planTier.includes("friend_app");

    if (isPro) return Number.POSITIVE_INFINITY;
    if (isStarter) return 90; // ~3 months
    return 7; // free default
  }

  function maxAllowedDateFromToday(): Date | null {
    const days = getHorizonDays();
    if (!Number.isFinite(days)) return null; // unlimited
    return addDays(startOfDay(new Date()), days);
  }

  const [classes, setClasses] = useState<GymClass[]>([]);
  const [classId, setClassId] = useState('');
  const [classSearch, setClassSearch] = useState('');
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [dayOfWeek, setDayOfWeek] = useState<'0' | '1' | '2' | '3' | '4' | '5' | '6'>('1'); // Δευτέρα
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('19:00');

  // ✅ use same DatePicker style as CreateMemberModal
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);

  const [capacity, setCapacity] = useState<number | ''>('');
  const [cancelBeforeHours, setCancelBeforeHours] = useState<number | ''>(''); // NEW
  const [saving, setSaving] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);

  function pushToast(t: Omit<Toast, "id">) {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, ...t }]);
    // auto-dismiss
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 5000);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }

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

  // Close dropdown on outside click
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

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!classId) {
      alert('Παρακαλώ επιλέξτε ένα μάθημα.');
      return;
    }
    if (!fromDate || !toDate || !startTime || !endTime) {
      alert('Παρακαλώ συμπληρώστε τις ημερομηνίες και ώρες.');
      return;
    }

    // ✅ Plan limitation: how far ahead you can schedule
    if (maxAllowedDate && (isAfter(fromDate, maxAllowedDate) || isAfter(toDate, maxAllowedDate))) {
      // use your existing toast function (same one you used for members/classes/plans)
      pushToast({
        variant: "error",
        title: "Περιορισμός προγραμματισμού",
        message:
          tier === "free"
            ? "Στο Free μπορείς να προγραμματίσεις έως 7 ημέρες μπροστά. Αναβάθμισε για περισσότερο."
            : "Στο Starter μπορείς να προγραμματίσεις έως 3 μήνες μπροστά. Αναβάθμισε για απεριόριστο.",
        actionLabel: "Αναβάθμιση",
        onAction: () => navigate("/billing"),
      });
      return;
    }

    if (!tenantId || !classId || !fromDate || !toDate || !startTime || !endTime) return;

    const cancelVal = cancelBeforeHours === '' ? null : Number(cancelBeforeHours);
    if (cancelVal != null && (isNaN(cancelVal) || cancelVal < 0)) {
      alert('Το πεδίο "Ακύρωση μέχρι (ώρες πριν)" πρέπει να είναι >= 0.');
      return;
    }

    setSaving(true);
    try {
      const sessionsToInsert: any[] = [];

      // Work with local dates (midnight), like typical date picker logic
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(toDate);
      end.setHours(0, 0, 0, 0);

      const targetDow = Number(dayOfWeek); // 0=Κυρ
      const capVal = capacity === '' ? null : Number(capacity);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === targetDow) {
          const s = new Date(d);
          const e2 = new Date(d);

          const [sh, sm] = startTime.split(':').map(Number);
          const [eh, em] = endTime.split(':').map(Number);

          s.setHours(sh, sm, 0, 0);
          e2.setHours(eh, em, 0, 0);

          sessionsToInsert.push({
            tenant_id: tenantId,
            class_id: classId,
            starts_at: s.toISOString(),
            ends_at: e2.toISOString(),
            capacity: capVal,
            cancel_before_hours: cancelVal, // NEW
          });
        }
      }

      if (sessionsToInsert.length === 0) {
        setSaving(false);
        return;
      }

      const { error } = await supabase.from('class_sessions').insert(sessionsToInsert);
      if (error) throw error;

      onGenerated();
      onClose();
    } catch (err) {
      console.error('Failed to generate program', err);
    } finally {
      setSaving(false);
    }
  };

  const filteredClasses = classes.filter((c) =>
    c.title.toLowerCase().includes(classSearch.toLowerCase())
  );
  const selectedClass = classes.find((c) => c.id === classId);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <ToastHost toasts={toasts} dismiss={dismissToast} />
      <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-secondary-background p-6 shadow-2xl text-text-primary">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Δημιουργία προγράμματος (επαναλαμβανόμενες συνεδρίες)
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
          {/* Custom searchable dropdown for class */}
          <div ref={dropdownRef} className="relative">
            <label className="block text-sm font-medium mb-1">Μάθημα</label>
            <button
              type="button"
              className="input flex items-center justify-between"
              onClick={() => setClassDropdownOpen((v) => !v)}
            >
              <span>{selectedClass ? selectedClass.title : 'Επιλέξτε μάθημα…'}</span>
              <span className="ml-2 text-xs opacity-70">{classDropdownOpen ? '▲' : '▼'}</span>
            </button>

            {classDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full rounded-md border border-white/15 bg-secondary-background shadow-lg">
                <div className="p-2 border-b border-white/10">
                  <input
                    autoFocus
                    className="input h-9! text-sm!"
                    placeholder="Αναζήτηση μαθήματος..."
                    value={classSearch}
                    onChange={(e) => setClassSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {filteredClasses.length === 0 && (
                    <div className="px-3 py-2 text-xs text-text-secondary">Δεν βρέθηκαν μαθήματα</div>
                  )}
                  {filteredClasses.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`w-full px-3 py-2 text-left text-sm hover:bg:white/5 ${c.id === classId ? 'bg-white/10' : ''
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Ημέρα εβδομάδας</label>
              <select
                className="input"
                value={dayOfWeek}
                onChange={(e) =>
                  setDayOfWeek(e.target.value as '0' | '1' | '2' | '3' | '4' | '5' | '6')
                }
              >
                <option value="1">Δευτέρα</option>
                <option value="2">Τρίτη</option>
                <option value="3">Τετάρτη</option>
                <option value="4">Πέμπτη</option>
                <option value="5">Παρασκευή</option>
                <option value="6">Σάββατο</option>
                <option value="0">Κυριακή</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Ώρα έναρξης</label>
              <input
                type="time"
                className="input"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Ώρα λήξης</label>
              <input
                type="time"
                className="input"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* ✅ DatePickers (same behavior as your other modal) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Από ημερομηνία</label>
              <DatePicker
                selected={fromDate}
                onChange={(date) => {
                  const picked = date as Date | null;
                  if (!picked) {
                    setFromDate(null);
                    return;
                  }

                  const maxAllowed = maxAllowedDateFromToday();
                  if (maxAllowed && startOfDay(picked) > startOfDay(maxAllowed)) {
                    pushToast({
                      variant: "error",
                      title: "Περιορισμός ημερομηνίας",
                      message: `Στο πλάνο σου μπορείς να προγραμματίσεις έως ${maxAllowed.toLocaleDateString("el-GR")}.`,
                      actionLabel: "Αναβάθμιση",
                      onAction: () => navigate("/settings/billing"),
                    });
                    return; // keep previous fromDate
                  }

                  // valid -> set
                  setFromDate(picked);

                  // also keep toDate consistent (optional safety)
                  if (toDate && startOfDay(toDate) < startOfDay(picked)) {
                    setToDate(picked);
                  }
                }}
                dateFormat="dd/MM/yyyy"
                locale={el}
                placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
                className="input"
                wrapperClassName="w-full"
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                scrollableYearDropdown
                yearDropdownItemNumber={80}
              />
              {/* hidden value (optional) if you ever want to see what gets stored */}
              {/* <div className="mt-1 text-[11px] opacity-60">{fromDate ? dateToISODate(fromDate) : ''}</div> */}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Έως ημερομηνία</label>
              <DatePicker
                selected={toDate}
                onChange={(date) => {
                  const picked = date as Date | null;
                  if (!picked) {
                    setToDate(null);
                    return;
                  }

                  // cannot be before fromDate
                  if (fromDate && startOfDay(picked) < startOfDay(fromDate)) {
                    pushToast({
                      variant: "error",
                      title: "Μη έγκυρο εύρος",
                      message: "Η ημερομηνία 'Έως' δεν μπορεί να είναι πριν από την 'Από'.",
                    });
                    return; // keep previous toDate
                  }

                  // plan horizon
                  const maxAllowed = maxAllowedDateFromToday();
                  if (maxAllowed && startOfDay(picked) > startOfDay(maxAllowed)) {
                    pushToast({
                      variant: "error",
                      title: "Περιορισμός ημερομηνίας",
                      message: `Στο πλάνο σου μπορείς να προγραμματίσεις έως ${maxAllowed.toLocaleDateString("el-GR")}.`,
                      actionLabel: "Αναβάθμιση",
                      onAction: () => navigate("/billing"),
                    });
                    return; // keep previous toDate
                  }

                  setToDate(picked);
                }}
                dateFormat="dd/MM/yyyy"
                locale={el}
                placeholderText="ΗΗ/ΜΜ/ΕΕΕΕ"
                className="input"
                wrapperClassName="w-full"
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                scrollableYearDropdown
                yearDropdownItemNumber={80}
              />
            </div>
            <p className="text-xs text-text-secondary">
              {tier === 'pro'
                ? 'Pro: απεριόριστος προγραμματισμός.'
                : tier === 'starter'
                  ? 'Starter: προγραμματισμός έως 3 μήνες μπροστά.'
                  : 'Free: προγραμματισμός έως 7 ημέρες μπροστά.'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Διαθέσιμες θέσεις (προαιρετικό)
            </label>
            <input
              type="number"
              min={0}
              className="input"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value === '' ? '' : Number(e.target.value))}
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
                setCancelBeforeHours(e.target.value === '' ? '' : Number(e.target.value))
              }
            />
          </div>

          <p className="text-xs text-text-secondary">
            Θα δημιουργηθεί μία συνεδρία για κάθε επιλεγμένη ημέρα της εβδομάδας, ανάμεσα στις δύο
            ημερομηνίες.
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Άκυρο
            </button>
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
              {saving ? 'Δημιουργία…' : 'Δημιουργία προγράμματος'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
