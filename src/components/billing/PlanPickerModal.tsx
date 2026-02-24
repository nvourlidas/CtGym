import { useMemo } from "react";
import {
  ExternalLink,
  Sparkles,
  X,
  Check,
  Minus,
  ShieldCheck,
  Star,
} from "lucide-react";

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
    return new Intl.NumberFormat("el-GR", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(val);
  } catch {
    return `${val.toFixed(2)} ${currency || "EUR"}`;
  }
}

/**
 * ✅ Marketing-first: define ONE feature catalog and per-plan availability.
 * Add/remove features here and they will show in the compare table + cards.
 */
type FeatureKey =
  | "admin_panel"
  | "members_management"
  | "bookings"
  | "classes"
  | "workout_templates"
  | "questionnaires"
  | "email_campaigns"
  | "push_notifications"
  | "exports"
  | "theme_customization"
  | "mobile_app"
  | "support_priority";

const FEATURES: { key: FeatureKey; label: string; hint?: string }[] = [
  { key: "admin_panel", label: "Admin Panel πρόσβαση" },
  { key: "members_management", label: "Διαχείριση μελών" },
  { key: "bookings", label: "Κρατήσεις & check-in" },
  { key: "classes", label: "Classes & προγράμματα" },

  { key: "workout_templates", label: "Workout Templates" },
  { key: "questionnaires", label: "Ερωτηματολόγια" },

  { key: "email_campaigns", label: "Αποστολή Email σε μέλη" },
  { key: "push_notifications", label: "Push Notifications" },

  { key: "exports", label: "Export Excel / PDF" },
  {
    key: "theme_customization",
    label: "Custom theme & logo",
    hint: "Αλλαγή χρωμάτων/branding στο mobile",
  },

  { key: "mobile_app", label: "Mobile App για μέλη" },
  { key: "support_priority", label: "Προτεραιότητα υποστήριξης" },
];

function fmtLimit(v?: number | null) {
  if (v == null) return "∞";
  if (!Number.isFinite(v)) return "—";
  return String(v);
}

/** ✅ Limits */
type LimitKey = "members" | "classes" | "memberships" | "schedule_days_ahead";

const PLAN_LIMITS: { key: LimitKey; label: string; hint?: string }[] = [
  { key: "members", label: "Μέλη", hint: "Μέγιστος αριθμός μελών" },
  { key: "classes", label: "Τμήματα", hint: "Μέγιστος αριθμός τμημάτων" },
  {
    key: "memberships",
    label: "Συνδρομές",
    hint: "Μέγιστος αριθμός πακέτων/συνδρομών",
  },
  {
    key: "schedule_days_ahead",
    label: "Προγραμματισμός sessions (ημέρες)",
    hint: "Πόσες ημέρες μπροστά μπορείς να δημιουργήσεις sessions στο πρόγραμμα",
  },
];

type PlanKey = "free" | "starter" | "pro";
type PlanLimits = Record<LimitKey, number | null>;

const PLAN_LIMITS_BY_PLAN: Record<PlanKey, PlanLimits> = {
  free: { members: 25, classes: 3, memberships: 2, schedule_days_ahead: 7 },
  starter: { members: 120, classes: 10, memberships: 10, schedule_days_ahead: 90 },
  pro: { members: null, classes: null, memberships: null, schedule_days_ahead: null }, // null => unlimited
};

/**
 * ✅ Decide plan tier from id/name. (works with your DB rows)
 */
function planTier(p: PlanRow): PlanKey {
  const id = String(p.id ?? "").toLowerCase();
  const name = String(p.name ?? "").toLowerCase();

  if (id.includes("pro") || name.includes("pro")) return "pro";
  if (id.includes("starter") || name.includes("starter")) return "starter";
  if (id.includes("free") || name.includes("free")) return "free";

  // fallback: treat unknown paid as starter
  return "starter";
}

// alias (so your code reads nicely)
function getPlanKey(p: PlanRow): PlanKey {
  return planTier(p);
}

/**
 * ✅ Per-tier feature availability.
 * (Email/Push/Exports/Theme are Pro-only as you requested)
 */
function featureEnabled(key: FeatureKey, p: PlanRow): boolean {
  const tier = planTier(p);

  const core =
    key === "admin_panel" ||
    key === "members_management" ||
    key === "bookings" ||
    key === "classes";

  if (tier === "free") {
    // Free: only core (and mobile if the plan row says it includes mobile)
    if (core) return true;
    if (key === "mobile_app") return !!p.includes_mobile;
    return false;
  }

  if (tier === "starter") {
    if (core) return true;
    if (key === "mobile_app") return !!p.includes_mobile;

    // Starter: extra ops tools
    if (key === "workout_templates") return true;
    if (key === "questionnaires") return true;

    // Pro-only:
    if (key === "email_campaigns") return true;
    if (key === "push_notifications") return true;
    if (key === "exports") return false;
    if (key === "theme_customization") return false;
    if (key === "support_priority") return false;
    if (key === "payments_viva") return true;

    return false;
  }

  // Pro
  if (tier === "pro") {
    if (core) return true;
    if (key === "mobile_app") return !!p.includes_mobile;
    if (key === "workout_templates") return true;
    if (key === "questionnaires") return true;
    if (key === "email_campaigns") return true;
    if (key === "push_notifications") return true;
    if (key === "exports") return true;
    if (key === "theme_customization") return true;
    if (key === "support_priority") return true;
    if (key === "payments_viva") return true;
    return false;
  }

  return false;
}

function ValueCell({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-emerald-500/10 border border-success/25">
      <Check className="h-4 w-4 text-success" />
    </span>
  ) : (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-white/5 border border-border/10">
      <Minus className="h-4 w-4 text-text-secondary" />
    </span>
  );
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
    [plans]
  );

  // ✅ pick "Most popular" (usually Starter). Fallback to middle priced.
  const popularId = useMemo(() => {
    const starter = visiblePlans.find((p) => planTier(p) === "starter");
    if (starter) return starter.id;

    const sorted = [...visiblePlans].sort(
      (a, b) => (a.monthly_price_cents ?? 0) - (b.monthly_price_cents ?? 0)
    );
    return sorted[Math.floor(sorted.length / 2)]?.id;
  }, [visiblePlans]);

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
        <div className="w-full max-w-6xl rounded-2xl border border-border/10 bg-secondary-background/95 backdrop-blur shadow-2xl">
          {/* Header / hero */}
          <div className="p-5 md:p-6 border-b border-border/10">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 text-xs font-semibold px-2.5 py-1 rounded-full border border-border/10 bg-white/5">
                  <Sparkles className="h-4 w-4 opacity-80" />
                  Επιλογή πλάνου
                </div>
                <div className="mt-2 text-xl md:text-2xl font-semibold">
                  Ξεκίνα σήμερα — αναβάθμισε όποτε θέλεις
                </div>
                <div className="mt-1 text-sm text-text-secondary max-w-3xl">
                  Διάλεξε το πλάνο που ταιριάζει στο γυμναστήριό σου. Η πληρωμή γίνεται
                  στο ασφαλές checkout της Viva και η ενεργοποίηση είναι αυτόματη.
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/10 bg-white/5 px-2 py-1">
                    <ShieldCheck className="h-4 w-4" />
                    Ασφαλής πληρωμή με Viva
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/10 bg-white/5 px-2 py-1">
                    Χωρίς συμβόλαιο
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/10 bg-white/5 px-2 py-1">
                    Ακύρωση οποτεδήποτε
                  </span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="shrink-0 inline-flex items-center justify-center rounded-xl border border-border/10 bg-white/5 hover:bg-white/10 px-3 py-2"
                aria-label="Close modal"
              >
                <X className="h-4 w-4 opacity-80" />
              </button>
            </div>
          </div>

          {error && (
            <div className="m-4 md:m-6 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {visiblePlans.length === 0 ? (
            <div className="p-5 md:p-6 text-sm text-text-secondary">
              Δεν υπάρχουν ενεργά πλάνα.
            </div>
          ) : (
            <div className="p-4 md:p-6 space-y-6">
              {/* ✅ Compare table */}
              <div className="rounded-2xl border border-border/10 overflow-hidden">
                <div className="px-4 py-3 bg-secondary/10 border-b border-border/10">
                  <div className="text-sm font-semibold">Σύγκριση χαρακτηριστικών</div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    Όλα τα πλάνα εμφανίζονται — δες γρήγορα τι περιλαμβάνει το καθένα.
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-225 w-full text-sm">
                    <thead className="bg-secondary-background/60">
                      <tr className="text-left">
                        <th className="px-4 py-3 text-xs font-semibold text-text-secondary">
                          Χαρακτηριστικό
                        </th>

                        {visiblePlans.map((p) => {
                          const isPopular = p.id === popularId;
                          const isCurrent = currentPlanId === p.id;

                          return (
                            <th key={p.id} className="px-4 py-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="font-semibold truncate">{p.name}</div>
                                  {isPopular && (
                                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border border-yellow-500/30 bg-accent/10 text-accent">
                                      <Star className="h-3.5 w-3.5" />
                                      Most popular
                                    </span>
                                  )}
                                  {isCurrent && (
                                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border border-border/10 bg-white/5 text-text-secondary">
                                      Τρέχον
                                    </span>
                                  )}
                                </div>

                                <div className="mt-1 text-xs text-text-secondary">
                                  <span className="font-semibold text-text-primary">
                                    {fmtMoney(p.monthly_price_cents, p.currency)}
                                  </span>{" "}
                                  / μήνα
                                </div>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>

                    <tbody>
                      {/* ✅ LIMITS section */}
                      <tr className="border-t border-border/10 bg-secondary/5">
                        <td className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">
                          Όρια πλάνου
                        </td>
                        {visiblePlans.map((p) => (
                          <td key={p.id} className="px-4 py-3" />
                        ))}
                      </tr>

                      {PLAN_LIMITS.map((l) => (
                        <tr
                          key={String(l.key)}
                          className="border-t border-border/10 hover:bg-secondary/10"
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium">{l.label}</div>
                            {l.hint && (
                              <div className="text-[11px] text-text-secondary mt-0.5">
                                {l.hint}
                              </div>
                            )}
                          </td>

                          {visiblePlans.map((p) => {
                            const key = getPlanKey(p);
                            const lim = PLAN_LIMITS_BY_PLAN[key];
                            const value = lim?.[l.key];

                            return (
                              <td key={p.id} className="px-4 py-3">
                                <span className="inline-flex items-center h-8 px-3 rounded-xl border border-border/10 bg-white/5 text-sm font-semibold">
                                  {fmtLimit(value)}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}

                      {/* ✅ FEATURES section */}
                      <tr className="border-t border-border/10 bg-secondary/5">
                        <td className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">
                          Χαρακτηριστικά
                        </td>
                        {visiblePlans.map((p) => (
                          <td key={p.id} className="px-4 py-3" />
                        ))}
                      </tr>

                      {FEATURES.map((f) => (
                        <tr
                          key={f.key}
                          className="border-t border-border/10 hover:bg-secondary/10"
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium">{f.label}</div>
                            {f.hint && (
                              <div className="text-[11px] text-text-secondary mt-0.5">
                                {f.hint}
                              </div>
                            )}
                          </td>

                          {visiblePlans.map((p) => (
                            <td key={p.id} className="px-4 py-3">
                              <ValueCell ok={featureEnabled(f.key, p)} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ✅ Plan cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visiblePlans.map((p) => {
                  const isCurrent = currentPlanId === p.id;
                  const isPopular = p.id === popularId;

                  const key = getPlanKey(p);
                  const lim = PLAN_LIMITS_BY_PLAN[key];

                  const enabledFeatures = FEATURES.filter((f) =>
                    featureEnabled(f.key, p)
                  ).slice(0, 7);

                  return (
                    <div
                      key={p.id}
                      className={[
                        "rounded-2xl border p-5 flex flex-col",
                        "bg-secondary/10",
                        isPopular
                          ? "border-accent/30 shadow-[0_0_0_1px_rgba(234,179,8,0.25)]"
                          : "border-border/10",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-base font-semibold truncate">
                              {p.name}
                            </div>
                            {isPopular && (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border border-accennt/30 bg-yellow-500/10 text-accent">
                                <Star className="h-3.5 w-3.5" />
                                Popular
                              </span>
                            )}
                          </div>

                          <div className="mt-2 text-2xl font-semibold">
                            {fmtMoney(p.monthly_price_cents, p.currency)}
                            <span className="text-xs font-medium text-text-secondary">
                              {" "}
                              / μήνα
                            </span>
                          </div>

                          <div className="mt-1 text-xs text-text-secondary">
                            {key === "pro"
                              ? "Όλα τα Pro εργαλεία για ανάπτυξη & marketing."
                              : key === "starter"
                                ? "Ιδανικό για να ξεκινήσεις οργανωμένα."
                                : "Βασική πρόσβαση για δοκιμή."}
                          </div>
                        </div>

                        {isCurrent && (
                          <span className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-border/10 text-text-secondary">
                            Τρέχον
                          </span>
                        )}
                      </div>

                      <ul className="mt-4 space-y-2 text-xs text-text-secondary">
                        {enabledFeatures.map((f) => (
                          <li key={f.key} className="flex gap-2">
                            <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/25">
                              <Check className="h-3.5 w-3.5 text-success" />
                            </span>
                            <span>{f.label}</span>
                          </li>
                        ))}

                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-text-secondary">
                          <div className="rounded-lg border border-border/10 bg-white/5 px-2 py-1">
                            Μέλη:{" "}
                            <span className="font-semibold text-text-primary">
                              {fmtLimit(lim.members)}
                            </span>
                          </div>
                          <div className="rounded-lg border border-border/10 bg-white/5 px-2 py-1">
                            Τμήματα:{" "}
                            <span className="font-semibold text-text-primary">
                              {fmtLimit(lim.classes)}
                            </span>
                          </div>
                          <div className="rounded-lg border border-border/10 bg-white/5 px-2 py-1">
                            Συνδρομές:{" "}
                            <span className="font-semibold text-text-primary">
                              {fmtLimit(lim.memberships)}
                            </span>
                          </div>
                          <div className="rounded-lg border border-border/10 bg-white/5 px-2 py-1">
                            Προγραμματισμός:{" "}
                            <span className="font-semibold text-text-primary">
                              {fmtLimit(lim.schedule_days_ahead)}
                            </span>
                          </div>
                        </div>

                        {FEATURES.filter((f) => featureEnabled(f.key, p)).length >
                          enabledFeatures.length && (
                            <li className="text-[11px] opacity-80">
                              +{" "}
                              {FEATURES.filter((f) => featureEnabled(f.key, p))
                                .length - enabledFeatures.length}{" "}
                              ακόμα…
                            </li>
                          )}
                      </ul>

                      <div className="mt-5">
                        <button
                          className={[
                            "w-full inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold border transition",
                            isCurrent
                              ? "opacity-60 cursor-not-allowed border-border/10 bg-white/5"
                              : isPopular
                                ? "border-accent/30 bg-accent/15 hover:bg-accent/20"
                                : "border-border/10 bg-secondary/10 hover:bg-secondary/20",
                          ].join(" ")}
                          disabled={busy || isCurrent}
                          onClick={() => onSubscribe(p.id)}
                          title={
                            isCurrent
                              ? "Είναι ήδη το τρέχον πλάνο"
                              : "Μετάβαση στο Viva Checkout"
                          }
                        >
                          {busy
                            ? "Παρακαλώ περίμενε…"
                            : isCurrent
                              ? "Τρέχον πλάνο"
                              : "Συνδρομή"}
                          {!isCurrent && (
                            <ExternalLink className="h-4 w-4 opacity-80" />
                          )}
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
            </div>
          )}

          <div className="p-4 md:p-6 border-t border-border/10 flex items-center justify-between gap-3">
            <div className="text-[11px] text-text-secondary">
              Οι τιμές είναι μηνιαίες. Η ενεργοποίηση γίνεται αυτόματα μετά την πληρωμή.
            </div>
            <button
              onClick={onClose}
              className="rounded-xl border border-border/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm font-semibold"
            >
              Κλείσιμο
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}