import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { X, ArrowLeft, ArrowRight, Rocket } from "lucide-react";

type StepKey = "tenant" | "gymInfo" | "admin";

type Props = {
  open: boolean;
  onClose: () => void;
  onDone?: (tenantId: string) => void;
  onCreated?: (info: { tenantId: string; adminEmail: string }) => void;
};

type GymInfoForm = {
  email: string;
  phone: string;
  address: string;
  city: string;
  postal_code: string;
  website: string;
  description: string;
  logo_url: string;
};

type AdminForm = {
  email: string;
  password: string;
  full_name: string;
};



const STEPS: { key: StepKey; title: string }[] = [
  { key: "tenant", title: "Γυμναστήριο" },
  { key: "gymInfo", title: "Στοιχεία" },
  { key: "admin", title: "Διαχειριστής" },
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

  // In your case, ctx IS the Response object
  const res: Response | undefined =
    ctx instanceof Response ? ctx : (ctx?.response instanceof Response ? ctx.response : undefined);

  if (res) {
    try {
      // safest: read JSON directly
      const parsed = await res.clone().json().catch(async () => {
        const text = await res.clone().text();
        try { return JSON.parse(text); } catch { return { error: text }; }
      });

      // If you return a code, map it:
      if (parsed?.code && ERROR_MESSAGES[parsed.code]) return ERROR_MESSAGES[parsed.code];

      // Otherwise show the backend error string:
      if (parsed?.error) return String(parsed.error);
    } catch { }
  }

  return String(err?.message || fallback);
}





export default function TenantOnboardingModal({ open, onClose, onDone, onCreated }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex]?.key ?? "tenant";

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tenantName, setTenantName] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);




  const [gymInfo, setGymInfo] = useState<GymInfoForm>({
    email: "",
    phone: "",
    address: "",
    city: "",
    postal_code: "",
    website: "",
    description: "",
    logo_url: "",
  });

  const [admin, setAdmin] = useState<AdminForm>({
    email: "",
    password: "",
    full_name: "",
  });


  const canClose = !pending;

  const progressPct = useMemo(() => {
    const total = STEPS.length;
    return Math.round(((stepIndex + 1) / total) * 100);
  }, [stepIndex]);

  const resetAll = () => {
    setStepIndex(0);
    setPending(false);
    setError(null);
    setTenantName("");
    setTenantId(null);
    setGymInfo({
      email: "",
      phone: "",
      address: "",
      city: "",
      postal_code: "",
      website: "",
      description: "",
      logo_url: "",
    });
    setAdmin({ email: "", password: "", full_name: "" });
  };

  const close = () => {
    if (!canClose) return;
    resetAll();
    onClose();
  };



  // -------------------------
  // STEP 1: create tenant
  // -------------------------
  const createTenant = async () => {
    const name = tenantName.trim();
    if (name.length < 2) {
      setError("Βάλε ένα όνομα γυμναστηρίου (τουλάχιστον 2 χαρακτήρες).");
      return;
    }
    setError(null);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };


  // -------------------------
  // STEP 2: upsert gym_info
  // -------------------------
  const saveGymInfo = async () => {
    // (optional) validations here if you want
    // e.g. if (gymInfo.email && !isValidEmail(gymInfo.email)) { ... }

    setError(null);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };


  // -------------------------
  // STEP 3: create admin
  // -------------------------
  const createAdmin = async () => {
    const name = tenantName.trim();
    const email = admin.email.trim();
    const pw = admin.password;

    if (name.length < 2) {
      setError("Λείπει όνομα γυμναστηρίου.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Βάλε ένα έγκυρο email για τον διαχειριστή.");
      return;
    }
    if (pw.length < 8) {
      setError("Ο κωδικός πρέπει να είναι τουλάχιστον 8 χαρακτήρες.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke("onboard-tenant", {
        body: {
          action: "commit_before_payment",
          tenant_name: name,

          gym_info: {
            email: gymInfo.email.trim() || null,
            phone: gymInfo.phone.trim() || null,
            address: gymInfo.address.trim() || null,
            city: gymInfo.city.trim() || null,
            postal_code: gymInfo.postal_code.trim() || null,
            website: gymInfo.website.trim() || null,
            description: gymInfo.description.trim() || null,
            logo_url: gymInfo.logo_url.trim() || null,
          },

          admin: {
            email,
            password: pw,
            full_name: admin.full_name.trim() || null,
            role: "owner",
          },
        },
      });

      if (error) throw error;

      if (data?.ok === false) {
        setError(data.error || "Κάτι πήγε στραβά.");
        return;
      }
      if (!data?.tenant_id) throw new Error("Δεν επιστράφηκε tenant_id.");

      const info = { tenantId: data.tenant_id, adminEmail: email };

      // ✅ 1) open CreatedInfo in parent FIRST
      onCreated?.(info);

      // ✅ 2) then close onboarding
      resetAll();
      onClose();

      // optional
      onDone?.(data.tenant_id);

    } catch (e: any) {
      const msg = await resolveFunctionError(
        e,
        "Αποτυχία ολοκλήρωσης εγγραφής."
      );
      setError(msg);
    }
    finally {
      setPending(false);
    }
  };



  const next = async () => {
    if (pending) return;

    if (step === "tenant") return createTenant();
    if (step === "gymInfo") return saveGymInfo();
    if (step === "admin") return createAdmin();
  };

  const back = () => {
    if (pending) return;
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  if (!open) return null;


  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={canClose ? close : undefined}
      />

      {/* modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl border border-blck/10 bg-[#f6f7fb] shadow-2xl overflow-hidden">
          {/* header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
            <div className="space-y-0.5">
              <div className="text-sm text-black/70">Νέα εγγραφή γυμναστηρίου</div>
              <div className="text-lg font-semibold text-black">{STEPS[stepIndex]?.title}</div>
            </div>

            <button
              onClick={close}
              disabled={!canClose}
              className="p-2 rounded-lg hover:bg-black/5 disabled:opacity-50 text-black"
              aria-label="Close"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* progress */}
          <div className="px-6 pt-4">
            <div className="flex items-center justify-between text-xs text-black">
              <span>Βήμα {stepIndex + 1} / {STEPS.length}</span>
              <span>{progressPct}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-black/20 overflow-hidden">
              <div
                className="h-full bg-[#2f55d4] transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* body */}
          <div className="px-6 py-5">
            {error && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/40 px-4 py-3 text-sm text-black">
                {error}
              </div>
            )}

            {step === "tenant" && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-black/70 font-medium">Όνομα γυμναστηρίου</label>
                  <input
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    className="input text-black/70 placeholder:text-black/20"
                    placeholder="π.χ. Cloudtec Gym"
                  />
                </div>
              </div>
            )}

            {step === "gymInfo" && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-black/60 font-medium">Email</label>
                    <input
                      value={gymInfo.email}
                      onChange={(e) => setGymInfo((p) => ({ ...p, email: e.target.value }))}
                      className="input text-black/70 placeholder:text-white"
                      placeholder="info@yourgym.gr"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-black/60 font-medium">Τηλέφωνο</label>
                    <input
                      value={gymInfo.phone}
                      onChange={(e) => setGymInfo((p) => ({ ...p, phone: e.target.value }))}
                      className="input text-black/70 placeholder:text-black/20"
                      placeholder="6900000000"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-sm text-black/60 font-medium">Διεύθυνση</label>
                    <input
                      value={gymInfo.address}
                      onChange={(e) => setGymInfo((p) => ({ ...p, address: e.target.value }))}
                      className="input text-black/70 placeholder:text-black/20"
                      placeholder="Οδός, αριθμός"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-black/60 font-medium">Πόλη</label>
                    <input
                      value={gymInfo.city}
                      onChange={(e) => setGymInfo((p) => ({ ...p, city: e.target.value }))}
                      className="input text-black/70 placeholder:text-black/20"
                      placeholder="Θεσσαλονίκη"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-black/60 font-medium">ΤΚ</label>
                    <input
                      value={gymInfo.postal_code}
                      onChange={(e) => setGymInfo((p) => ({ ...p, postal_code: e.target.value }))}
                      className="input text-black/70 placeholder:text-black/20"
                      placeholder="54622"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-black/60 font-medium">Website</label>
                    <input
                      value={gymInfo.website}
                      onChange={(e) => setGymInfo((p) => ({ ...p, website: e.target.value }))}
                      className="input text-black/70 placeholder:text-black/20"
                      placeholder="https://yourgym.gr"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm text-black/60 font-medium">Περιγραφή</label>
                  <textarea
                    value={gymInfo.description}
                    onChange={(e) => setGymInfo((p) => ({ ...p, description: e.target.value }))}
                    className="inputTextArea text-black/70"
                    placeholder="Σύντομη περιγραφή..."
                  />
                </div>

                <div>
                  <label className="text-sm text-black/60 font-medium">Logo URL (προαιρετικό)</label>
                  <input
                    value={gymInfo.logo_url}
                    onChange={(e) => setGymInfo((p) => ({ ...p, logo_url: e.target.value }))}
                    className="input text-black/70 placeholder:text-black/20"
                    placeholder="https://..."
                  />
                </div>
              </div>
            )}

            {step === "admin" && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-sm text-black/60 font-medium">Ονοματεπώνυμο (προαιρετικό)</label>
                    <input
                      value={admin.full_name}
                      onChange={(e) => setAdmin((p) => ({ ...p, full_name: e.target.value }))}
                      className="input text-black/70 placeholder:text-black/20"
                      placeholder="π.χ. Γιώργος Παπαδόπουλος"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-sm text-black/60 font-medium">Email διαχειριστή</label>
                    <input
                      value={admin.email}
                      onChange={(e) => setAdmin((p) => ({ ...p, email: e.target.value }))}
                      className="input text-black/70 placeholder:text-black/20"
                      placeholder="admin@yourgym.gr"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-sm text-black/60 font-medium">Κωδικός</label>
                    <input
                      value={admin.password}
                      onChange={(e) => setAdmin((p) => ({ ...p, password: e.target.value }))}
                      className="input text-black/70 placeholder:text-black/20"
                      placeholder="••••••••"
                      type="password"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-black/10">
            <button
              onClick={back}
              disabled={pending || stepIndex === 0}
              className="inline-flex items-center gap-2 text-sm text-black px-3 py-2 rounded-xl border border-black/10 bg-black/5 hover:bg-black/10 disabled:opacity-70"
            >
              <ArrowLeft size={16} />
              Πίσω
            </button>
            <button
              onClick={next}
              disabled={pending}
              className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-[#4c6fff] hover:bg-[#ffc947] hover:text-black text-white font-semibold disabled:opacity-60 cursor-pointer"
            >
              <Rocket size={16} className={pending ? "animate-pulse" : ""} />
              {pending
                ? "Παρακαλώ περιμένετε…"
                : step === "admin"
                  ? "Ολοκλήρωση Εγγραφής"
                  : "Επόμενο"}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
