import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth";
import {
  ExternalLink, Sparkles, X, Check, Minus, ShieldCheck, Star,
  Zap, ArrowRight, Crown,
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
      style: "currency", currency: currency || "EUR", maximumFractionDigits: 2,
    }).format(val);
  } catch {
    return `${val.toFixed(2)} ${currency || "EUR"}`;
  }
}

type FeatureKey =
  | "admin_panel" | "members_management" | "bookings" | "classes"
  | "workout_templates" | "questionnaires" | "email_campaigns"
  | "push_notifications" | "exports" | "theme_customization"
  | "mobile_app" | "support_priority";

const FEATURES: { key: FeatureKey; label: string; hint?: string }[] = [
  { key: "admin_panel",          label: "Admin Panel πρόσβαση" },
  { key: "members_management",   label: "Διαχείριση μελών" },
  { key: "bookings",             label: "Κρατήσεις & check-in" },
  { key: "classes",              label: "Classes & προγράμματα" },
  { key: "workout_templates",    label: "Workout Templates" },
  { key: "questionnaires",       label: "Ερωτηματολόγια" },
  { key: "email_campaigns",      label: "Αποστολή Email σε μέλη" },
  { key: "push_notifications",   label: "Push Notifications" },
  { key: "exports",              label: "Export Excel / PDF" },
  { key: "theme_customization",  label: "Custom theme & logo", hint: "Αλλαγή χρωμάτων/branding στο mobile" },
  { key: "mobile_app",           label: "Mobile App για μέλη" },
  { key: "support_priority",     label: "Προτεραιότητα υποστήριξης" },
];

function fmtLimit(v?: number | null) {
  if (v == null) return "∞";
  if (!Number.isFinite(v)) return "—";
  return String(v);
}

type LimitKey = "members" | "classes" | "memberships" | "schedule_days_ahead";

const PLAN_LIMITS: { key: LimitKey; label: string; hint?: string }[] = [
  { key: "members",              label: "Μέλη",                               hint: "Μέγιστος αριθμός μελών" },
  { key: "classes",              label: "Τμήματα",                            hint: "Μέγιστος αριθμός τμημάτων" },
  { key: "memberships",          label: "Συνδρομές",                          hint: "Μέγιστος αριθμός πακέτων/συνδρομών" },
  { key: "schedule_days_ahead",  label: "Προγραμματισμός sessions (ημέρες)",  hint: "Πόσες ημέρες μπροστά μπορείς να δημιουργήσεις sessions" },
];

type PlanKey = "free" | "starter" | "pro";
type PlanLimits = Record<LimitKey, number | null>;

const PLAN_LIMITS_BY_PLAN: Record<PlanKey, PlanLimits> = {
  free:    { members: 10,   classes: 3,    memberships: 2,  schedule_days_ahead: 7   },
  starter: { members: 60,   classes: 10,   memberships: 10, schedule_days_ahead: 90  },
  pro:     { members: null, classes: null, memberships: null, schedule_days_ahead: null },
};

function planTier(p: PlanRow): PlanKey {
  const id   = String(p.id   ?? "").toLowerCase();
  const name = String(p.name ?? "").toLowerCase();
  if (id.includes("pro")     || name.includes("pro"))     return "pro";
  if (id.includes("starter") || name.includes("starter")) return "starter";
  if (id.includes("free")    || name.includes("free"))    return "free";
  return "starter";
}

function getPlanKey(p: PlanRow): PlanKey { return planTier(p); }

function featureEnabled(key: FeatureKey, p: PlanRow): boolean {
  const tier = planTier(p);
  const core = key === "admin_panel" || key === "members_management" || key === "bookings" || key === "classes";

  if (tier === "free") {
    if (core) return true;
    if (key === "mobile_app") return !!p.includes_mobile;
    return false;
  }
  if (tier === "starter") {
    if (core) return true;
    if (key === "mobile_app") return !!p.includes_mobile;
    if (key === "workout_templates") return true;
    if (key === "questionnaires") return true;
    if (key === "email_campaigns") return true;
    if (key === "push_notifications") return true;
    if (key === "exports") return false;
    if (key === "theme_customization") return false;
    if (key === "support_priority") return false;
    return false;
  }
  // pro
  if (core) return true;
  if (key === "mobile_app") return !!p.includes_mobile;
  return ["workout_templates","questionnaires","email_campaigns","push_notifications","exports","theme_customization","support_priority"].includes(key);
}

function ValueCell({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-emerald-500/10 border border-success/25">
      <Check className="h-3.5 w-3.5 text-success" />
    </span>
  ) : (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-white/5 border border-border/10">
      <Minus className="h-3.5 w-3.5 text-text-secondary" />
    </span>
  );
}

// Tier accent helpers (Tailwind-compatible inline style approach for CSS var colors)
function tierAccent(tier: PlanKey) {
  if (tier === "pro")     return { badge: "bg-accent/10 border-accent/30 text-accent",   btn: "bg-accent/20 border-accent/40 hover:bg-accent/30 text-accent", ring: "border-accent/30 shadow-accent/10" };
  if (tier === "starter") return { badge: "bg-primary/10 border-primary/25 text-primary",         btn: "bg-primary/15 border-primary/30 hover:bg-primary/25 text-primary",         ring: "border-primary/20 shadow-primary/10"   };
  return                         { badge: "bg-white/5 border-border/10 text-text-secondary",          btn: "bg-white/5 border-border/10 hover:bg-white/10 text-text-secondary",             ring: "border-border/10 shadow-transparent"     };
}

export default function PlanPickerModal({
  open, plans, currentPlanId, busy, error, onClose, onSubscribe,
}: {
  open: boolean;
  plans: PlanRow[];
  currentPlanId?: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubscribe: (planId: string) => void;
}) {
  const visiblePlans = useMemo(() => (plans ?? []).filter((p) => p.is_active !== false), [plans]);

  const { profile } = useAuth();
  const tenantId = profile?.tenant_id ?? null;

  const [hasEverActivated, setHasEverActivated]   = useState<boolean>(true);
  const [checkingEver, setCheckingEver]           = useState<boolean>(false);
  const [trialBusyId, setTrialBusyId]             = useState<string | null>(null);
  const [pendingTrialPlanId, setPendingTrialPlanId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function checkEverActivated() {
      if (!tenantId) return;
      setCheckingEver(true);
      const { data, error } = await supabase.from("tenant_payments").select("id").eq("tenant_id", tenantId).limit(1);
      if (cancelled) return;
      setHasEverActivated(error ? true : (data?.length ?? 0) > 0);
      setCheckingEver(false);
    }
    checkEverActivated();
    return () => { cancelled = true; };
  }, [tenantId]);

  const popularId = useMemo(() => {
    const pro = visiblePlans.find((p) => planTier(p) === "pro");
    if (pro) return pro.id;
    const sorted = [...visiblePlans].sort((a, b) => (a.monthly_price_cents ?? 0) - (b.monthly_price_cents ?? 0));
    return sorted[Math.floor(sorted.length / 2)]?.id;
  }, [visiblePlans]);

  function handleChoosePlan(planId: string) {
    const plan = visiblePlans.find((p) => p.id === planId);
    if (!plan) return;
    const key = getPlanKey(plan);
    const isTrialEligible = !hasEverActivated && key !== "free";
    if (currentPlanId === planId) return;

    if (isTrialEligible) {
      setPendingTrialPlanId(planId);
      return;
    }
    onSubscribe(planId);
  }

  async function confirmTrial() {
    if (!pendingTrialPlanId || !tenantId) return;
    try {
      setTrialBusyId(pendingTrialPlanId);
      const { error } = await supabase.rpc("start_trial", { p_tenant_id: tenantId, p_plan_id: pendingTrialPlanId, p_trial_days: 14 });
      if (error) throw error;
      window.location.reload();
    } catch (e) {
      console.error(e);
    } finally {
      setTrialBusyId(null);
      setPendingTrialPlanId(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label="Close" />

      {/* Modal */}
      <div className="absolute inset-0 flex items-start justify-center p-4 md:p-8 overflow-auto">
        <div
          className="relative w-full max-w-6xl rounded-2xl border border-border/10 bg-secondary-background/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          style={{ animation: "planModalIn 0.28s cubic-bezier(0.16,1,0.3,1)" }}
        >
          {/* Top accent bar */}
          <div className="h-0.75 w-full bg-linear-to-r from-accent via-yellow-300 to-accent" />

          {/* ── Header ── */}
          <div className="px-6 py-5 border-b border-border/10">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-accent/25 bg-accent/10 text-accent mb-3">
                  <Sparkles className="h-3 w-3" />
                  Επιλογή πλάνου
                </div>
                <h2 className="text-xl md:text-2xl font-black text-text-primary tracking-tight leading-tight">
                  Ξεκίνα σήμερα — αναβάθμισε όποτε θέλεις
                </h2>
                <p className="mt-1.5 text-sm text-text-secondary max-w-2xl leading-relaxed">
                  Διάλεξε το πλάνο που ταιριάζει στο γυμναστήριό σου. Η πληρωμή γίνεται
                  στο ασφαλές checkout της Viva και η ενεργοποίηση είναι αυτόματη.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {[
                    { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: "Ασφαλής πληρωμή με Viva" },
                    { icon: null, label: "Χωρίς συμβόλαιο" },
                    { icon: null, label: "Ακύρωση οποτεδήποτε" },
                  ].map((badge) => (
                    <span key={badge.label} className="inline-flex items-center gap-1.5 rounded-full border border-border/10 bg-white/5 text-text-secondary text-[11px] font-medium px-2.5 py-1">
                      {badge.icon}
                      {badge.label}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={onClose}
                className="shrink-0 p-1.5 rounded-xl border border-border/10 bg-white/5 hover:bg-white/10 text-text-secondary hover:text-text-primary transition-all cursor-pointer"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mx-6 mt-4 flex items-start gap-2 px-4 py-3 rounded-xl border border-red-400/25 bg-red-500/10 text-red-300 text-sm">
              <span className="mt-px shrink-0">⚠</span>
              {error}
            </div>
          )}

          {visiblePlans.length === 0 ? (
            <div className="p-6 text-sm text-text-secondary">Δεν υπάρχουν ενεργά πλάνα.</div>
          ) : (
            <div className="p-5 md:p-6 space-y-6">

              {/* ── Plan cards ── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {visiblePlans.map((p) => {
                  const isCurrent      = currentPlanId === p.id;
                  const isPopular      = p.id === popularId;
                  const isFree         = p.id === "free";
                  const key            = getPlanKey(p);
                  const lim            = PLAN_LIMITS_BY_PLAN[key];
                  const isTrialEligible = !hasEverActivated && key !== "free";
                  const isThisBusy     = busy || checkingEver || trialBusyId === p.id;
                  const isDisabled     = isThisBusy || isCurrent || isFree;
                  const accent         = tierAccent(key);
                  const enabledFeatures = FEATURES.filter((f) => featureEnabled(f.key, p)).slice(0, 6);

                  return (
                    <div
                      key={p.id}
                      className={[
                        "relative rounded-2xl border flex flex-col overflow-hidden transition-all duration-200",
                        "bg-secondary/10",
                        isPopular
                          ? `${accent.ring} shadow-lg`
                          : "border-border/10 shadow-sm",
                      ].join(" ")}
                    >
                      {/* Popular ribbon */}
                      {isPopular && (
                        <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-linear-to-r from-accent via-accent to-yellow-500/0" />
                      )}

                      <div className="p-5 flex flex-col flex-1">
                        {/* Plan name + badge */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            {key === "pro" && <Crown className="h-4 w-4 text-accent" />}
                            {key === "starter" && <Zap className="h-4 w-4 text-blue-400" />}
                            <span className="text-base font-bold text-text-primary">{p.name}</span>
                          </div>
                          {isPopular && (
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold border ${accent.badge}`}>
                              <Star className="h-3 w-3" />
                              Δημοφιλές
                            </span>
                          )}
                          {isCurrent && (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] border border-border/10 bg-white/5 text-text-secondary">
                              Τρέχον
                            </span>
                          )}
                        </div>

                        {/* Price */}
                        <div className="mt-2 mb-1">
                          <span className="text-3xl font-black text-text-primary tracking-tight">
                            {fmtMoney(p.monthly_price_cents, p.currency)}
                          </span>
                          <span className="text-xs text-text-secondary font-normal ml-1">/ μήνα</span>
                        </div>
                        <p className="text-xs text-text-secondary mb-4 leading-relaxed">
                          {key === "pro"     ? "Όλα τα Pro εργαλεία για ανάπτυξη & marketing."
                           : key === "starter" ? "Ιδανικό για να ξεκινήσεις οργανωμένα."
                                               : "Βασική πρόσβαση για δοκιμή."}
                        </p>

                        {/* Limits grid */}
                        <div className="grid grid-cols-2 gap-1.5 mb-4">
                          {[
                            { label: "Μέλη",        val: lim.members            },
                            { label: "Τμήματα",     val: lim.classes            },
                            { label: "Συνδρομές",   val: lim.memberships        },
                            { label: "Πρόγραμμα",   val: lim.schedule_days_ahead, suffix: lim.schedule_days_ahead != null ? "μ" : "" },
                          ].map((item) => (
                            <div key={item.label} className="rounded-xl border border-border/10 bg-white/4 px-2.5 py-2">
                              <div className="text-[10px] text-text-secondary mb-0.5">{item.label}</div>
                              <div className="text-sm font-bold text-text-primary leading-none">
                                {fmtLimit(item.val)}{item.suffix ?? ""}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Feature list */}
                        <ul className="space-y-1.5 flex-1">
                          {enabledFeatures.map((f) => (
                            <li key={f.key} className="flex items-center gap-2 text-xs text-text-secondary">
                              <span className="shrink-0 w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                <Check className="h-2.5 w-2.5 text-success" />
                              </span>
                              {f.label}
                            </li>
                          ))}
                          {FEATURES.filter((f) => featureEnabled(f.key, p)).length > enabledFeatures.length && (
                            <li className="text-[11px] text-text-secondary pl-6 opacity-70">
                              + {FEATURES.filter((f) => featureEnabled(f.key, p)).length - enabledFeatures.length} ακόμα χαρακτηριστικά…
                            </li>
                          )}
                        </ul>

                        {/* CTA */}
                        <div className="mt-5 space-y-1.5">
                          <button
                            className={[
                              "w-full inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold border transition-all duration-150",
                              isDisabled
                                ? "opacity-50 cursor-not-allowed border-border/10 bg-white/5 text-text-secondary"
                                : `cursor-pointer ${accent.btn} hover:-translate-y-px`,
                            ].join(" ")}
                            disabled={isDisabled}
                            onClick={() => handleChoosePlan(p.id)}
                          >
                            {isThisBusy ? (
                              <span className="flex gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
                              </span>
                            ) : isFree ? "Μη Διαθέσιμο"
                              : isCurrent ? "Τρέχον πλάνο"
                              : isTrialEligible ? (
                                <><Zap className="h-4 w-4" />Δωρεάν Δοκιμή 14 ημερών</>
                              ) : (
                                <><span>Απόκτησέ το</span><ArrowRight className="h-4 w-4" /></>
                              )}
                            {!isDisabled && !isTrialEligible && !isThisBusy && (
                              <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                            )}
                          </button>
                          {!isCurrent && (
                            <p className="text-center text-[10.5px] text-text-secondary">
                              {isTrialEligible || isFree
                                ? "Ξεκινάει άμεσα — χωρίς κάρτα."
                                : "Ασφαλής πληρωμή μέσω Viva."}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Compare table ── */}
              <div className="rounded-2xl border border-border/10 overflow-hidden">
                <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-text-primary">Σύγκριση χαρακτηριστικών</div>
                    <div className="text-xs text-text-secondary mt-0.5">Δες αναλυτικά τι περιλαμβάνει το κάθε πλάνο.</div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-160 w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/10 bg-secondary/10">
                        <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-text-secondary w-1/3">
                          Χαρακτηριστικό
                        </th>
                        {visiblePlans.map((p) => {
                          const isPopular = p.id === popularId;
                          const isCurrent = currentPlanId === p.id;
                          const key       = getPlanKey(p);
                          const accent    = tierAccent(key);
                          return (
                            <th key={p.id} className="px-5 py-3 text-left">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-text-primary text-sm">{p.name}</span>
                                {isPopular && (
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${accent.badge}`}>
                                    <Star className="h-2.5 w-2.5" />Δημοφιλές
                                  </span>
                                )}
                                {isCurrent && (
                                  <span className="rounded-full px-2 py-0.5 text-[10px] border border-border/10 bg-white/5 text-text-secondary">Τρέχον</span>
                                )}
                              </div>
                              <div className="mt-0.5 text-xs text-text-secondary">
                                <span className="font-bold text-text-primary">{fmtMoney(p.monthly_price_cents, p.currency)}</span> / μήνα
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>

                    <tbody>
                      {/* Limits section */}
                      <tr className="border-t border-border/10 bg-secondary/5">
                        <td className="px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-wider text-text-secondary" colSpan={1}>
                          Όρια πλάνου
                        </td>
                        {visiblePlans.map((p) => <td key={p.id} className="px-5 py-2.5" />)}
                      </tr>
                      {PLAN_LIMITS.map((l) => (
                        <tr key={String(l.key)} className="border-t border-border/10 hover:bg-secondary/5 transition-colors">
                          <td className="px-5 py-3">
                            <div className="text-sm font-medium text-text-primary">{l.label}</div>
                            {l.hint && <div className="text-[11px] text-text-secondary mt-0.5">{l.hint}</div>}
                          </td>
                          {visiblePlans.map((p) => {
                            const key = getPlanKey(p);
                            const value = PLAN_LIMITS_BY_PLAN[key]?.[l.key];
                            return (
                              <td key={p.id} className="px-5 py-3">
                                <span className="inline-flex items-center h-7 px-3 rounded-xl border border-border/10 bg-white/5 text-sm font-bold text-text-primary">
                                  {fmtLimit(value)}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}

                      {/* Features section */}
                      <tr className="border-t border-border/10 bg-secondary/5">
                        <td className="px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-wider text-text-secondary">
                          Χαρακτηριστικά
                        </td>
                        {visiblePlans.map((p) => <td key={p.id} className="px-5 py-2.5" />)}
                      </tr>
                      {FEATURES.map((f) => (
                        <tr key={f.key} className="border-t border-border/10 hover:bg-secondary/5 transition-colors">
                          <td className="px-5 py-3">
                            <div className="text-sm font-medium text-text-primary">{f.label}</div>
                            {f.hint && <div className="text-[11px] text-text-secondary mt-0.5">{f.hint}</div>}
                          </td>
                          {visiblePlans.map((p) => (
                            <td key={p.id} className="px-5 py-3">
                              <ValueCell ok={featureEnabled(f.key, p)} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ── Footer ── */}
          <div className="px-6 py-4 border-t border-border/10 flex items-center justify-between gap-3 bg-secondary/5">
            <p className="text-[11px] text-text-secondary">
              Οι τιμές είναι μηνιαίες. Η ενεργοποίηση γίνεται αυτόματα μετά την πληρωμή.
            </p>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm font-semibold text-text-secondary hover:text-text-primary transition-all cursor-pointer"
            >
              Κλείσιμο
            </button>
          </div>
        </div>
      </div>

      {/* Trial confirmation modal */}
      {pendingTrialPlanId && (() => {
        const plan = visiblePlans.find((p) => p.id === pendingTrialPlanId);
        return (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-sm mx-4 rounded-2xl border border-border/10 bg-secondary-background shadow-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-black text-text-primary text-sm">Έναρξη Δωρεάν Δοκιμής</p>
                  <p className="text-[11px] text-text-secondary mt-0.5">14 ημέρες χωρίς χρέωση — χωρίς κάρτα.</p>
                </div>
              </div>
              <div className="rounded-xl border border-border/10 bg-secondary/10 px-4 py-3 space-y-1">
                <p className="text-sm font-bold text-text-primary">{plan?.name ?? pendingTrialPlanId}</p>
                <p className="text-xs text-text-secondary">Η δοκιμή ξεκινάει αμέσως και λήγει σε 14 ημέρες.</p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingTrialPlanId(null)}
                  disabled={!!trialBusyId}
                  className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  Ακύρωση
                </button>
                <button
                  type="button"
                  onClick={confirmTrial}
                  disabled={!!trialBusyId}
                  className="h-9 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {trialBusyId
                    ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />Παρακαλώ περίμενε…</>
                    : <><Zap className="h-3.5 w-3.5" />Ξεκίνα τη δοκιμή</>
                  }
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes planModalIn {
          from { opacity: 0; transform: translateY(20px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0)    scale(1);     }
        }
      `}</style>
    </div>
  );
}