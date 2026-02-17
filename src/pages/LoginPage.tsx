// src/pages/LoginPage.tsx
import { supabase } from '../lib/supabase';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import logo from '../assets/CTGYM.YELLOW 1080x1080.svg';
import { Rocket } from 'lucide-react';
import TenantOnboardingModal from "../components/onboarding/TenantOnboardingModal";
import CreatedInfoModal from "../components/onboarding/CreatedInfoModal";


export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [showOnboarding, setShowOnboarding] = useState(false);

  const [createdInfo, setCreatedInfo] = useState<{ tenantId: string; adminEmail: string } | null>(null);


  useEffect(() => {
    if (params.get('err') === 'unauthorized') {
      setError('Ο λογαριασμός σας δεν έχει πρόσβαση διαχειριστή.');
    }
  }, [params]);

  const onLogin = async () => {
    setError(null);
    setPending(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: pw,
      });
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) throw new Error('Δεν βρέθηκε συνεδρία χρήστη.');

      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (pErr) throw pErr;

      const role = profile?.role;
      const isAdmin = role === 'owner' || role === 'admin';
      if (!isAdmin) {
        await supabase.auth.signOut();
        throw new Error('Μόνο διαχειριστές μπορούν να συνδεθούν στην Admin εφαρμογή.');
      }

      navigate('/', { replace: true });
    } catch (e: any) {
      setError(e?.message || 'Αποτυχία σύνδεσης.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-[#253649] text-slate-100 px-4 overflow-hidden">
      {/* Animated / glassy background */}
      <div className="pointer-events-none absolute inset-0">
        {/* soft base gradient */}
        <div className="absolute inset-0 bg-linear-to-br from-[#253649] via-[#253649]/70 to-slate-950" />

        {/* animated blobs */}
        <div
          className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full blur-3xl opacity-30 animate-pulse"
          style={{
            background:
              'radial-gradient(circle at 30% 30%, rgba(255,201,71,0.65), rgba(255,201,71,0) 55%)',
          }}
        />
        <div
          className="absolute -bottom-48 -right-48 h-[620px] w-[620px] rounded-full blur-3xl opacity-25 animate-pulse"
          style={{
            background:
              'radial-gradient(circle at 60% 60%, rgba(59,130,246,0.55), rgba(59,130,246,0) 55%)',
          }}
        />

        {/* subtle rotating conic glow */}
        <div
          className="absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl opacity-[0.10] animate-spin"
          style={{
            animationDuration: '22s',
            background:
              'conic-gradient(from 180deg, rgba(255,201,71,0.9), rgba(59,130,246,0.9), rgba(34,197,94,0.7), rgba(255,201,71,0.9))',
          }}
        />
      </div>

      {/* BIG LOGO OUTSIDE CARD */}
      <div className="relative z-10 flex flex-col items-center mb-8 text-center">
        <img src={logo} alt="Cloudtec Gym" className="h-60 w-60 object-contain" />

        <div className="space-y-1 mt-4">
          <h1 className="text-2xl font-semibold tracking-tight">Cloudtec Gym Admin</h1>
          <p className="text-sm text-slate-400">Συνδεθείτε για να διαχειριστείτε το γυμναστήριό σας.</p>
        </div>
      </div>

      {/* GLASS CARD */}
      <div className="relative z-10 w-full max-w-5xl mb-40">
        <div className="rounded-2xl border border-white/10 bg-slate-900/65 shadow-2xl overflow-hidden">
          <div className="grid md:grid-cols-2">
            {/* LEFT - LOGIN */}
            <div className="p-8 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-200" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/35 backdrop-blur px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#ffc947]/80 focus:border-[#ffc947]/50"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="username"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-200" htmlFor="password">
                  Κωδικός πρόσβασης
                </label>
                <input
                  id="password"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/35 backdrop-blur px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#ffc947]/80 focus:border-[#ffc947]/50"
                  placeholder="••••••••"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                />
              </div>

              <button
                className="w-full rounded-xl px-3 py-2 bg-primary/70 hover:bg-primary text-sm font-medium text-white transition disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-primary-600/20 cursor-pointer"
                onClick={onLogin}
                disabled={pending}
              >
                {pending ? 'Γίνεται σύνδεση…' : 'Σύνδεση'}
              </button>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <p className="text-xs text-slate-500 pt-2">
                Το portal αυτό προορίζεται μόνο για διαχειριστές γυμναστηρίου (admin / owner).
              </p>
            </div>

            {/* RIGHT - CTA / MARKETING */}
            <div className="relative p-8 border-t md:border-t-0 md:border-l border-white/10 bg-linear-to-br from-primary">
              {/* shiny overlay */}
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 opacity-40 bg-linear-to-br from-white/10 via-transparent" />
                <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full blur-3xl opacity-20 bg-primary" />
              </div>

              <div className="relative flex flex-col justify-center h-full text-center md:text-left space-y-6 ">
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold">Δεν έχεις κάνει εγγραφή ακόμα;</h2>
                  <p className="text-slate-300 text-sm">
                    Αναβάθμισε το γυμναστήριό σου και διαχειρίσου μέλη, συνδρομές, προγράμματα και έσοδα σε ένα σύγχρονο
                    σύστημα.
                  </p>
                </div>

                {/* Feature bullets with icons */}
                <ul className="space-y-3 text-sm text-slate-200/90">
                  {[
                    'Διαχείριση μελών, συνδρομών & πληρωμών',
                    'Προγράμματα, κρατήσεις, παρουσίες & ιστορικό',
                    'Dashboard εσόδων + reports σε πραγματικό χρόνο',
                    'Mobile εφαρμογή για τους πελάτες σου',
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-600/25 border border-white/10">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M20 6L9 17l-5-5"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className="leading-6">{t}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA buttons */}
                <div className="flex justify-center pt-4">
                  <button
                    onClick={() => setShowOnboarding(true)}
                    className="
                      group relative inline-flex items-center gap-2
                      px-7 py-3 rounded-xl font-semibold text-sm
                      text-black
                      bg-gradient-to-r from-[#ffc947] via-[#ffb700] to-[#ffc947]
                      bg-[length:200%_100%]
                      animate-[gradientMove_4s_linear_infinite]
                      shadow-xl shadow-[#ffc947]/30
                      transition-all duration-300
                      hover:shadow-[#ffc947]/60
                      hover:scale-[1.05]
                      active:scale-[0.97]
                      overflow-hidden
                      cursor-pointer
                    "
                  >
                    {/* Shimmer sweep */}
                    <span
                      className="
                        pointer-events-none absolute inset-0
                        bg-gradient-to-r from-transparent via-white/40 to-transparent
                        translate-x-[-100%]
                        group-hover:translate-x-[100%]
                        transition-transform duration-700
                      "
                    />

                    {/* Icon */}
                    <Rocket
                      size={18}
                      className="
                          relative z-10
                          transition-all duration-300
                          group-hover:translate-x-1 group-hover:-rotate-12
                        "
                    />

                    <span className="relative z-10">
                      Απόκτησέ το
                    </span>

                    {/* Glow pulse layer */}
                    <span
                      className="
                        absolute -inset-1 rounded-xl blur-lg opacity-30
                        bg-[#ffc947]
                        animate-pulse
                        pointer-events-none
                      "
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <TenantOnboardingModal
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onDone={(tenantId) => {
          // optional: show success toast / redirect to a "check email" page
          console.log("Onboarding started for tenant:", tenantId);
        }}
        onCreated={(info) => setCreatedInfo(info)}
      />

      <CreatedInfoModal
        open={!!createdInfo}
        adminEmail={createdInfo?.adminEmail ?? ""}
        tenantId={createdInfo?.tenantId ?? ""}
        onClose={() => setCreatedInfo(null)}
      />
    </div>
  );


}
