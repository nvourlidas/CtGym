import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  X, ArrowLeft, ChevronRight, Dumbbell, Info, ShieldCheck,
  Zap, MapPin, Globe, Phone, Mail, User, Lock, Building2, CheckCircle2,
  Eye, EyeOff,
} from "lucide-react";

type StepKey = "tenant" | "gymInfo" | "admin";

type Props = {
  open: boolean;
  onClose: () => void;
  onDone?: (tenantId: string) => void;
  onCreated?: (info: { tenantId: string; adminEmail: string }) => void;
};

type GymInfoForm = {
  email: string; phone: string; address: string; city: string;
  postal_code: string; website: string; description: string; logo_url: string;
};

type AdminForm = { email: string; password: string; confirmPassword: string; full_name: string };

const STEPS: { key: StepKey; title: string; subtitle: string; icon: React.ReactNode }[] = [
  { key: "tenant",  title: "Γυμναστήριο", subtitle: "Ξεκινήστε με το όνομα",    icon: <Dumbbell size={14} />    },
  { key: "gymInfo", title: "Στοιχεία",    subtitle: "Πληροφορίες επικοινωνίας", icon: <Info size={14} />        },
  { key: "admin",   title: "Διαχειριστής",subtitle: "Πρόσβαση & ασφάλεια",      icon: <ShieldCheck size={14} /> },
];

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

const ERROR_MESSAGES: Record<string, string> = {
  TENANT_NAME_TAKEN: "Υπάρχει ήδη γυμναστήριο με αυτό το όνομα.",
  ADMIN_EMAIL_TAKEN: "Υπάρχει ήδη χρήστης με αυτό το email.",
};

async function resolveFunctionError(err: any, fallback: string) {
  const ctx = err?.context;
  const res: Response | undefined =
    ctx instanceof Response ? ctx : (ctx?.response instanceof Response ? ctx.response : undefined);
  if (res) {
    try {
      const parsed = await res.clone().json().catch(async () => {
        const text = await res.clone().text();
        try { return JSON.parse(text); } catch { return { error: text }; }
      });
      if (parsed?.code && ERROR_MESSAGES[parsed.code]) return ERROR_MESSAGES[parsed.code];
      if (parsed?.error) return String(parsed.error);
    } catch {}
  }
  return String(err?.message || fallback);
}

function IconInput({
  icon, value, onChange, placeholder, type = "text", autoComplete,
}: {
  icon: React.ReactNode; value: string; onChange: (v: string) => void;
  placeholder: string; type?: string; autoComplete?: string;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex">
        {icon}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        autoComplete={autoComplete}
        className="w-full pl-9 pr-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-300
                   bg-white border border-slate-200 rounded-xl outline-none
                   transition-all duration-150
                   focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100
                   hover:border-slate-300"
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function PasswordInput({
  icon, value, onChange, placeholder, autoComplete, show, onToggleShow,
}: {
  icon: React.ReactNode; value: string; onChange: (v: string) => void;
  placeholder: string; autoComplete?: string; show: boolean; onToggleShow: () => void;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex">
        {icon}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        className="w-full pl-9 pr-9 py-2.5 text-sm text-slate-800 placeholder:text-slate-300
                   bg-white border border-slate-200 rounded-xl outline-none
                   transition-all duration-150
                   focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100
                   hover:border-slate-300"
      />
      <button
        type="button"
        onClick={onToggleShow}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Πολύ αδύναμος", color: "bg-red-400" };
  if (score === 2) return { score, label: "Αδύναμος",     color: "bg-orange-400" };
  if (score === 3) return { score, label: "Μέτριος",      color: "bg-yellow-400" };
  if (score === 4) return { score, label: "Ισχυρός",      color: "bg-emerald-400" };
  return                        { score, label: "Πολύ ισχυρός", color: "bg-emerald-500" };
}

function PasswordStrength({ password }: { password: string }) {
  const { score, label, color } = getPasswordStrength(password);
  if (!password) return null;
  const bars = 5;
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${i < score ? color : "bg-slate-100"}`}
          />
        ))}
      </div>
      <p className={`text-[11px] font-semibold ${score <= 1 ? "text-red-500" : score <= 2 ? "text-orange-500" : score === 3 ? "text-yellow-600" : "text-emerald-600"}`}>
        {label}
      </p>
    </div>
  );
}

export default function TenantOnboardingModal({ open, onClose, onDone, onCreated }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex]?.key ?? "tenant";

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);

  console.log(tenantId);

  const [gymInfo, setGymInfo] = useState<GymInfoForm>({
    email: "", phone: "", address: "", city: "",
    postal_code: "", website: "", description: "", logo_url: "",
  });
  const [admin, setAdmin] = useState<AdminForm>({ email: "", password: "", confirmPassword: "", full_name: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const canClose = !pending;
  const progressPct = useMemo(() => Math.round(((stepIndex + 1) / STEPS.length) * 100), [stepIndex]);

  const resetAll = () => {
    setStepIndex(0); setPending(false); setError(null);
    setTenantName(""); setTenantId(null);
    setGymInfo({ email: "", phone: "", address: "", city: "", postal_code: "", website: "", description: "", logo_url: "" });
    setAdmin({ email: "", password: "", confirmPassword: "", full_name: "" });
  };

  const close = () => { if (!canClose) return; resetAll(); onClose(); };

  const createTenant = async () => {
    const name = tenantName.trim();
    if (name.length < 2) { setError("Βάλε ένα όνομα γυμναστηρίου (τουλάχιστον 2 χαρακτήρες)."); return; }
    setError(null);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };

  const saveGymInfo = async () => {
    setError(null);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };

  const createAdmin = async () => {
    const name = tenantName.trim();
    const email = admin.email.trim();
    const pw = admin.password;
    if (name.length < 2) { setError("Λείπει όνομα γυμναστηρίου."); return; }
    if (!isValidEmail(email)) { setError("Βάλε ένα έγκυρο email για τον διαχειριστή."); return; }
    if (pw.length < 8) { setError("Ο κωδικός πρέπει να είναι τουλάχιστον 8 χαρακτήρες."); return; }
    if (pw !== admin.confirmPassword) { setError("Οι κωδικοί δεν ταιριάζουν."); return; }

    setPending(true); setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("onboard-tenant", {
        body: {
          action: "commit_before_payment",
          tenant_name: name,
          gym_info: {
            email: gymInfo.email.trim() || null, phone: gymInfo.phone.trim() || null,
            address: gymInfo.address.trim() || null, city: gymInfo.city.trim() || null,
            postal_code: gymInfo.postal_code.trim() || null, website: gymInfo.website.trim() || null,
            description: gymInfo.description.trim() || null, logo_url: gymInfo.logo_url.trim() || null,
          },
          admin: { email, password: pw, full_name: admin.full_name.trim() || null, role: "admin" },
        },
      });

      if (error) throw error;
      if (data?.ok === false) { setError(data.error || "Κάτι πήγε στραβά."); return; }
      if (!data?.tenant_id) throw new Error("Δεν επιστράφηκε tenant_id.");

      const info = { tenantId: data.tenant_id, adminEmail: email };
      onCreated?.(info);
      resetAll();
      onClose();
      onDone?.(data.tenant_id);
    } catch (e: any) {
      setError(await resolveFunctionError(e, "Αποτυχία ολοκλήρωσης εγγραφής."));
    } finally {
      setPending(false);
    }
  };

  const next = async () => {
    if (pending) return;
    if (step === "tenant") return createTenant();
    if (step === "gymInfo") return saveGymInfo();
    if (step === "admin") return createAdmin();
  };

  const back = () => { if (pending) return; setError(null); setStepIndex((i) => Math.max(i - 1, 0)); };

  if (!open) return null;

  const isFinal = step === "admin";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-800/30 backdrop-blur-sm"
        onClick={canClose ? close : undefined}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-140 rounded-2xl bg-white border border-slate-200/80
                   shadow-[0_24px_60px_-8px_rgba(15,23,42,0.18),0_8px_20px_-4px_rgba(15,23,42,0.08)]
                   overflow-hidden"
        style={{ animation: "onboardSlideUp 0.28s cubic-bezier(0.16,1,0.3,1)" }}
      >
        {/* Rainbow top bar */}
        <div className="h-0.75 w-full bg-linear-to-r from-[#4c6fff] via-[#2f55d4] to-indigo-400" />

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-7 pt-6 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100
                            text-[#2f55d4] text-[10.5px] font-bold uppercase tracking-widest
                            px-2.5 py-1 rounded-full mb-3">
              <Zap size={9} />
              Νέα Εγγραφή Γυμναστηρίου
            </div>
            <h2 className="text-[22px] font-black text-slate-800 tracking-tight leading-none">
              {STEPS[stepIndex].title}
            </h2>
            <p className="text-sm text-slate-400 mt-1 font-normal">{STEPS[stepIndex].subtitle}</p>
          </div>
          <button
            onClick={close}
            disabled={!canClose}
            className="mt-0.5 p-1.5 rounded-xl text-slate-400 hover:text-slate-600
                       hover:bg-slate-100 disabled:opacity-30 transition-all cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Step pills ── */}
        <div className="px-7 pb-4">
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const isDone   = i < stepIndex;
              const isActive = i === stepIndex;
              const isFuture = i > stepIndex;
              return (
                <div key={s.key} className="flex items-center gap-2 flex-1">
                  <div className={[
                    "flex items-center gap-2 flex-1 px-3 py-2 rounded-xl border text-[12px] font-semibold transition-all duration-200 select-none",
                    isDone   ? "bg-indigo-50 border-indigo-200 text-[#2f55d4]" : "",
                    isActive ? "bg-[#2f55d4] border-[#2f55d4] text-white shadow-md shadow-indigo-200/60" : "",
                    isFuture ? "bg-slate-50 border-slate-200 text-slate-400" : "",
                  ].join(" ")}>
                    <span className={[
                      "shrink-0 w-5 h-5 rounded-lg flex items-center justify-center",
                      isDone   ? "bg-indigo-200/50 text-[#2f55d4]" : "",
                      isActive ? "bg-white/25 text-white" : "",
                      isFuture ? "bg-slate-200/60 text-slate-400" : "",
                    ].join(" ")}>
                      {isDone ? <CheckCircle2 size={12} /> : s.icon}
                    </span>
                    <span className="truncate">{s.title}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`w-3 h-px shrink-0 rounded-full transition-colors duration-500 ${i < stepIndex ? "bg-indigo-300" : "bg-slate-200"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Thin progress bar */}
          <div className="mt-3 h-1 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-linear-to-r from-[#4c6fff] to-[#5fc27c] transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-7 pb-5 min-h-58">

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2.5 mb-4 px-3.5 py-3 rounded-xl
                            bg-red-50 border border-red-200 text-red-600 text-[13px]">
              <span className="mt-0.5 shrink-0">⚠</span>
              {error}
            </div>
          )}

          {/* STEP 1 */}
          {step === "tenant" && (
            <div className="space-y-3">
              <Field label="Όνομα γυμναστηρίου">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none flex">
                    <Building2 size={20} />
                  </span>
                  <input
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && next()}
                    placeholder="π.χ. Cloudtec Gym"
                    className="w-full pl-12 pr-4 py-4 text-[19px] font-bold text-slate-800
                               placeholder:text-slate-300 placeholder:font-normal placeholder:text-base
                               bg-slate-50 border-2 border-slate-200 rounded-xl outline-none
                               focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100/70
                               transition-all duration-150"
                  />
                </div>
              </Field>
              <div className="flex items-start gap-2.5 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                <Zap size={14} className="text-indigo-400 shrink-0 mt-px" />
                <p className="text-xs text-[#2f55d4]/80 leading-relaxed">
                  Αυτό θα είναι το <strong className="font-bold">αναγνωριστικό</strong> του γυμναστηρίου σας στην πλατφόρμα.
                </p>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === "gymInfo" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email">
                  <IconInput icon={<Mail size={14} />} value={gymInfo.email} onChange={(v) => setGymInfo((p) => ({ ...p, email: v }))} placeholder="info@yourgym.gr" />
                </Field>
                <Field label="Τηλέφωνο">
                  <IconInput icon={<Phone size={14} />} value={gymInfo.phone} onChange={(v) => setGymInfo((p) => ({ ...p, phone: v }))} placeholder="6900000000" />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="Διεύθυνση">
                    <IconInput icon={<MapPin size={14} />} value={gymInfo.address} onChange={(v) => setGymInfo((p) => ({ ...p, address: v }))} placeholder="Οδός, αριθμός" />
                  </Field>
                </div>
                <Field label="Πόλη">
                  <IconInput icon={<MapPin size={14} />} value={gymInfo.city} onChange={(v) => setGymInfo((p) => ({ ...p, city: v }))} placeholder="Θεσσαλονίκη" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Τ.Κ.">
                  <IconInput icon={<MapPin size={14} />} value={gymInfo.postal_code} onChange={(v) => setGymInfo((p) => ({ ...p, postal_code: v }))} placeholder="54622" />
                </Field>
                <Field label="Website">
                  <IconInput icon={<Globe size={14} />} value={gymInfo.website} onChange={(v) => setGymInfo((p) => ({ ...p, website: v }))} placeholder="https://yourgym.gr" />
                </Field>
              </div>
              <Field label="Περιγραφή">
                <textarea
                  value={gymInfo.description}
                  onChange={(e) => setGymInfo((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Σύντομη περιγραφή του γυμναστηρίου σας..."
                  rows={2}
                  className="w-full px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-300
                             bg-white border border-slate-200 rounded-xl outline-none resize-none
                             focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100
                             hover:border-slate-300 transition-all duration-150"
                />
              </Field>
            </div>
          )}

          {/* STEP 3 */}
          {step === "admin" && (
            <div className="space-y-3">
              <Field label="Ονοματεπώνυμο (προαιρετικό)">
                <IconInput icon={<User size={14} />} value={admin.full_name} onChange={(v) => setAdmin((p) => ({ ...p, full_name: v }))} placeholder="π.χ. Γιώργος Παπαδόπουλος" />
              </Field>
              <Field label="Email διαχειριστή">
                <IconInput icon={<Mail size={14} />} value={admin.email} onChange={(v) => setAdmin((p) => ({ ...p, email: v }))} placeholder="admin@yourgym.gr" type="email" />
              </Field>
              <Field label="Κωδικός">
                <PasswordInput
                  icon={<Lock size={14} />}
                  value={admin.password}
                  onChange={(v) => setAdmin((p) => ({ ...p, password: v }))}
                  placeholder="Τουλάχιστον 8 χαρακτήρες"
                  autoComplete="new-password"
                  show={showPassword}
                  onToggleShow={() => setShowPassword((s) => !s)}
                />
                <PasswordStrength password={admin.password} />
              </Field>
              <Field label="Επιβεβαίωση κωδικού">
                <PasswordInput
                  icon={<Lock size={14} />}
                  value={admin.confirmPassword}
                  onChange={(v) => setAdmin((p) => ({ ...p, confirmPassword: v }))}
                  placeholder="Επανάληψη κωδικού"
                  autoComplete="new-password"
                  show={showConfirmPassword}
                  onToggleShow={() => setShowConfirmPassword((s) => !s)}
                />
                {admin.confirmPassword && admin.password !== admin.confirmPassword && (
                  <p className="text-[11px] font-semibold text-red-500">Οι κωδικοί δεν ταιριάζουν</p>
                )}
                {admin.confirmPassword && admin.password === admin.confirmPassword && admin.confirmPassword.length > 0 && (
                  <p className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 size={11} /> Οι κωδικοί ταιριάζουν
                  </p>
                )}
              </Field>
              <div className="flex items-start gap-2.5 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                <ShieldCheck size={14} className="text-emerald-500 shrink-0 mt-px" />
                <p className="text-xs text-emerald-700/80 leading-relaxed">
                  Ο διαχειριστής θα έχει <strong className="font-bold">πλήρη πρόσβαση</strong> στην πλατφόρμα.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-7 py-4 bg-slate-50/80 border-t border-slate-100">

          <button
            onClick={back}
            disabled={pending || stepIndex === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl
                       text-sm font-semibold text-slate-500
                       bg-white border border-slate-200
                       hover:bg-slate-50 hover:text-slate-700 hover:border-slate-300
                       disabled:opacity-30 disabled:cursor-not-allowed
                       transition-all duration-150 cursor-pointer"
          >
            <ArrowLeft size={14} />
            Πίσω
          </button>

          <div className="flex items-center gap-3">
            {/* Step dots */}
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <div key={i} className={[
                  "rounded-full transition-all duration-300",
                  i === stepIndex ? "w-4 h-2 bg-indigo-500" : "",
                  i < stepIndex  ? "w-2 h-2 bg-indigo-300" : "",
                  i > stepIndex  ? "w-2 h-2 bg-slate-200"  : "",
                ].join(" ")} />
              ))}
            </div>

            <button
              onClick={next}
              disabled={pending}
              className={[
                "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white",
                "transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
                "hover:-translate-y-px active:translate-y-0",
                isFinal
                  ? "bg-linear-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-200 hover:shadow-emerald-300"
                  : "bg-linear-to-br from-[#4c6fff] to-[#2f55d4] shadow-lg shadow-indigo-200 hover:shadow-indigo-300",
              ].join(" ")}
            >
              {pending ? (
                <>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce [animation-delay:300ms]" />
                  </span>
                  Παρακαλώ περιμένετε…
                </>
              ) : (
                <>
                  {isFinal && <ShieldCheck size={15} />}
                  {isFinal ? "Ολοκλήρωση Εγγραφής" : "Επόμενο"}
                  {!isFinal && <ChevronRight size={15} />}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes onboardSlideUp {
          from { opacity: 0; transform: translateY(18px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0)    scale(1);     }
        }
      `}</style>
    </div>
  );
}