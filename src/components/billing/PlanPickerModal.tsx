import  { useMemo } from 'react';
import { ExternalLink, Sparkles, X } from 'lucide-react';

type PlanRow = {
  id: string;
  name: string;
  includes_mobile: boolean;
  monthly_price_cents: number;
  currency: string;
  is_active?: boolean;
};

function fmtMoney(cents: number, currency: string) {
  const val = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat('el-GR', {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 2,
    }).format(val);
  } catch {
    return `${val.toFixed(2)} ${currency || 'EUR'}`;
  }
}

/**
 * You can tune this map any time you want.
 * Key is plan.id. Fallback applies if not found.
 */
const PLAN_FEATURES: Record<string, string[]> = {
  admin: [
    'Πλήρες Admin Panel (memberships, bookings, classes)',
    'Προτεραιότητα σε υποστήριξη',
    'Αυτόματη ενεργοποίηση/ανανέωση μέσω Viva',
  ],
  // example if you add more:
  // pro: ['...', '...'],
};

function getFeaturesForPlan(p: PlanRow): string[] {
  const base = PLAN_FEATURES[p.id] ?? [
    'Πρόσβαση στο Admin Panel',
    'Αυτόματη ενεργοποίηση/ανανέωση μέσω Viva',
  ];

  // Add/override dynamically:
  const extras: string[] = [];
  extras.push(p.includes_mobile ? 'Περιλαμβάνει Mobile App' : 'Δεν περιλαμβάνει Mobile App');

  return [...base, ...extras];
}

export default function PlanPickerModal({
  open,
  plans,
  currentPlanId,
  busy,
  error,
  onClose,
  onSubscribe,
}: {
  open: boolean;
  plans: PlanRow[];
  currentPlanId?: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubscribe: (planId: string) => void;
}) {
  const visiblePlans = useMemo(
    () => (plans ?? []).filter((p) => p.is_active !== false),
    [plans],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop */}
      <button
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-label="Close"
      />

      {/* modal */}
      <div className="absolute inset-0 flex items-start justify-center p-4 md:p-8 overflow-auto">
        <div className="w-full max-w-5xl rounded-xl border border-white/10 bg-secondary-background/95 backdrop-blur shadow-2xl">
          <div className="flex items-start justify-between gap-3 p-4 md:p-5 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 opacity-80" />
                <span>Διαθέσιμα πλάνα</span>
              </div>
              <div className="mt-1 text-xs text-text-secondary">
                Επίλεξε πλάνο — θα μεταφερθείς στο ασφαλές checkout της Viva για πληρωμή με κάρτα.
              </div>
            </div>

            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-2"
              aria-label="Close modal"
            >
              <X className="h-4 w-4 opacity-80" />
            </button>
          </div>

          {error && (
            <div className="m-4 md:m-5 rounded-md border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {visiblePlans.length === 0 ? (
            <div className="p-4 md:p-5 text-sm text-text-secondary">
              Δεν υπάρχουν ενεργά πλάνα.
            </div>
          ) : (
            <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              {visiblePlans.map((p) => {
                const isCurrent = currentPlanId === p.id;
                const features = getFeaturesForPlan(p);

                return (
                  <div
                    key={p.id}
                    className="rounded-md border border-white/10 bg-secondary/10 p-4 flex flex-col"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{p.name}</div>
                        <div className="mt-2 text-lg font-semibold">
                          {fmtMoney(p.monthly_price_cents, p.currency)}
                          <span className="text-xs font-medium text-text-secondary"> / μήνα</span>
                        </div>
                      </div>

                      {isCurrent && (
                        <span className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-text-secondary">
                          Τρέχον
                        </span>
                      )}
                    </div>

                    <ul className="mt-3 space-y-1.5 text-xs text-text-secondary">
                      {features.map((f, idx) => (
                        <li key={idx} className="flex gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-white/30" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4">
                      <button
                        className={[
                          'w-full inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold border transition',
                          isCurrent
                            ? 'opacity-60 cursor-not-allowed border-white/10 bg-white/5'
                            : 'border-white/10 bg-secondary/10 hover:bg-secondary/20',
                        ].join(' ')}
                        disabled={busy || isCurrent}
                        onClick={() => onSubscribe(p.id)}
                        title={isCurrent ? 'Είναι ήδη το τρέχον πλάνο' : 'Μετάβαση στο Viva Checkout'}
                      >
                        {busy ? 'Παρακαλώ περίμενε…' : isCurrent ? 'Τρέχον πλάνο' : 'Συνδρομή'}
                        {!isCurrent && <ExternalLink className="h-4 w-4 opacity-80" />}
                      </button>

                      {!isCurrent && (
                        <div className="mt-2 text-[11px] text-text-secondary">
                          Θα μεταφερθείς στο Viva για ασφαλή πληρωμή με κάρτα.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="p-4 md:p-5 border-t border-white/10 flex items-center justify-end">
            <button
              onClick={onClose}
              className="rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-sm font-semibold"
            >
              Κλείσιμο
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
