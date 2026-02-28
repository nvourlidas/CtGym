// src/pages/LoginPage.tsx
import { supabase } from '../lib/supabase';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import logo from '../assets/CTGYM.YELLOW 1080x1080.svg';
import {
  Rocket, Eye, EyeOff, CheckCircle2, ArrowRight,
  BarChart3, Users, CalendarDays, Smartphone, Mail, Lock, ChevronRight,
} from 'lucide-react';
import TenantOnboardingModal from "../components/onboarding/TenantOnboardingModal";
import CreatedInfoModal from "../components/onboarding/CreatedInfoModal";

const FEATURES = [
  { icon: <Users size={14} />,       label: 'Διαχείριση μελών, συνδρομών & πληρωμών'          },
  { icon: <CalendarDays size={14} />, label: 'Προγράμματα, κρατήσεις, παρουσίες & ιστορικό'   },
  { icon: <BarChart3 size={14} />,    label: 'Dashboard εσόδων + reports σε πραγματικό χρόνο'  },
  { icon: <Smartphone size={14} />,   label: 'Mobile εφαρμογή για τους πελάτες σου'            },
];

export default function LoginPage() {
  const [email, setEmail]             = useState('');
  const [pw, setPw]                   = useState('');
  const [error, setError]             = useState<string | null>(null);
  const [pending, setPending]         = useState(false);
  const [params]                      = useSearchParams();
  const navigate                      = useNavigate();

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPassword, setShowPassword]     = useState(false);

  const [showForgot, setShowForgot]   = useState(false);
  const [resetBusy, setResetBusy]     = useState(false);
  const [resetMsg, setResetMsg]       = useState<string | null>(null);

  const [createdInfo, setCreatedInfo] = useState<{ tenantId: string; adminEmail: string } | null>(null);

  useEffect(() => {
    if (params.get('err') === 'unauthorized') {
      setError('Ο λογαριασμός σας δεν έχει πρόσβαση διαχειριστή.');
    }
  }, [params]);

  const onKeyDownLogin = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); onLogin(); }
  };

  const onLogin = async () => {
    setError(null);
    setPending(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) throw new Error('Λανθασμένα στοιχεία εισόδου.');

      const userId = data.user?.id;
      if (!userId) throw new Error('Δεν βρέθηκε συνεδρία χρήστη.');

      const { data: profile, error: pErr } = await supabase
        .from('profiles').select('role').eq('id', userId).maybeSingle();
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

  const onForgotPassword = async () => {
    setResetMsg(null);
    if (!email.trim()) { setResetMsg("Γράψε πρώτα το email σου."); return; }
    setResetBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetMsg("Σου στείλαμε email με οδηγίες για επαναφορά κωδικού.");
    } catch (e: any) {
      setResetMsg(e?.message || "Αποτυχία αποστολής email επαναφοράς.");
    } finally {
      setResetBusy(false);
    }
  };

  // shared input class for dark glass inputs
  const darkInput = `
    w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur
    px-4 py-3 text-sm text-white placeholder:text-slate-500
    outline-none transition-all duration-150
    focus:border-[#ffc947]/60 focus:ring-2 focus:ring-[#ffc947]/15 focus:bg-white/8
    hover:border-white/20
  `;

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-[#1a2736] text-slate-100 px-4 overflow-hidden">

      {/* ── Background ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* base */}
        <div className="absolute inset-0 bg-linear-to-br from-[#1e2f42] via-[#1a2736] to-[#111c28]" />
        {/* gold blob top-left */}
        <div
          className="absolute -top-48 -left-48 h-130 w-130 rounded-full blur-[100px] opacity-20 animate-pulse"
          style={{ background: 'radial-gradient(circle, rgba(255,201,71,0.8) 0%, transparent 65%)' }}
        />
        {/* blue blob bottom-right */}
        <div
          className="absolute -bottom-56 -right-56 h-150 w-150 rounded-full blur-[100px] opacity-15 animate-pulse"
          style={{ animationDelay: '1.5s', background: 'radial-gradient(circle, rgba(59,130,246,0.7) 0%, transparent 65%)' }}
        />
        {/* slow conic spin */}
        <div
          className="absolute left-1/2 top-1/2 h-225 w-225 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px] opacity-[0.07] animate-spin"
          style={{
            animationDuration: '28s',
            background: 'conic-gradient(from 0deg, rgba(255,201,71,1), rgba(59,130,246,1), rgba(34,197,94,0.6), rgba(255,201,71,1))',
          }}
        />
        {/* subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      {/* ── Logo + tagline ── */}
      <div className="relative z-10 flex flex-col items-center mb-10 text-center"
           style={{ animation: 'loginFadeUp 0.5s ease both' }}>
        <div className="relative">
          <img src={logo} alt="Cloudtec Gym" className="h-54 w-54 object-contain drop-shadow-lg" />
          {/* glow ring around logo */}
          
        </div>
        <h1 className="mt-5 text-3xl font-black tracking-tight text-white">Cloudtec Gym</h1>
        <p className="text-sm text-slate-400 mt-1.5 font-light tracking-wide">Admin Platform · Διαχείριση γυμναστηρίου</p>
      </div>

      {/* ── Main card ── */}
      <div
        className="relative z-10 w-full max-w-4xl mb-12"
        style={{ animation: 'loginFadeUp 0.5s 0.1s ease both', opacity: 0 }}
      >
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl shadow-[0_32px_80px_rgba(0,0,0,0.5)] overflow-hidden">

          {/* gold accent top bar */}
          <div className="h-0.75 w-full bg-linear-to-br from-[#4c6fff] via-[#526bcf] to-[#ffc947]" />

          <div className="grid md:grid-cols-2">

            {/* ── LEFT: Login form ── */}
            <div className="p-8 flex flex-col justify-center space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Καλώς ήρθατε</h2>
                <p className="text-sm text-slate-400 mt-1">Συνδεθείτε στο διαχειριστικό σας.</p>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Email</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none flex">
                    <Mail size={15} />
                  </span>
                  <input
                    id="email"
                    className={`${darkInput} pl-10`}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={onKeyDownLogin}
                    type="email"
                    autoComplete="username"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Κωδικός</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none flex">
                    <Lock size={15} />
                  </span>
                  <input
                    id="password"
                    className={`${darkInput} pl-10 pr-11`}
                    placeholder="••••••••"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    onKeyDown={onKeyDownLogin}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all cursor-pointer"
                    aria-label={showPassword ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Forgot */}
              <div className="flex justify-end -mt-2">
                <button
                  type="button"
                  onClick={() => { setShowForgot(true); setResetMsg(null); }}
                  className="text-xs text-slate-400 hover:text-[#ffc947] transition-colors cursor-pointer"
                >
                  Ξέχασες τον κωδικό;
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 px-3.5 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <span className="mt-px shrink-0">⚠</span>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                className="
                  w-full relative inline-flex items-center justify-center gap-2
                  px-4 py-3 rounded-xl text-sm font-bold
                  bg-linear-to-br from-[#4c6fff] to-[#4c6ff3] text-white
                  shadow-lg shadow-[#4c6fff]/20
                  hover:shadow-[#4c6fff]/40 hover:-translate-y-px
                  active:translate-y-0
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-150 cursor-pointer
                  overflow-hidden group
                "
                onClick={onLogin}
                disabled={pending}
              >
                {/* shimmer */}
                <span className="absolute inset-0 bg-linear-to-br from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                <span className="relative z-10 flex items-center gap-2">
                  {pending ? (
                    <>
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-black/60 animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-black/60 animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-black/60 animate-bounce [animation-delay:300ms]" />
                      </span>
                      Γίνεται σύνδεση…
                    </>
                  ) : (
                    <>
                      Σύνδεση
                      <ArrowRight size={15} />
                    </>
                  )}
                </span>
              </button>
            </div>

            {/* ── RIGHT: Marketing / CTA ── */}
            <div className="relative p-8 border-t md:border-t-0 md:border-l border-white/[0.07] overflow-hidden">
              {/* gradient wash */}
              <div className="absolute inset-0 bg-linear-to-br from-[#ffc947]/8 via-transparent to-transparent pointer-events-none" />
              <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full blur-3xl opacity-15 bg-[#ffc947] pointer-events-none" />

              <div className="relative flex flex-col justify-center h-full space-y-6">
                {/* Heading */}
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 bg-[#ffc947]/10 border border-[#ffc947]/20 text-[#ffc947] text-[10.5px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
                    <Rocket size={9} />
                    Νέο γυμναστήριο;
                  </div>
                  <h2 className="text-xl font-black text-white tracking-tight leading-tight">
                    Αναβάθμισε το γυμναστήριό σου σήμερα
                  </h2>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Διαχειρίσου μέλη, συνδρομές, προγράμματα και έσοδα σε ένα σύγχρονο σύστημα.
                  </p>
                </div>

                {/* Feature list */}
                <ul className="space-y-2.5">
                  {FEATURES.map((f) => (
                    <li key={f.label} className="flex items-center gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-lg bg-[#ffc947]/10 border border-[#ffc947]/20 flex items-center justify-center text-[#ffc947]">
                        {f.icon}
                      </span>
                      <span className="text-sm text-slate-300 leading-snug">{f.label}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA button */}
                <div className="pt-1">
                  <button
                    onClick={() => setShowOnboarding(true)}
                    className="
                      group relative inline-flex items-center gap-2.5
                      px-6 py-3 rounded-xl text-sm font-bold text-black
                      bg-linear-to-br from-[#ffc947] via-[#ffd060] to-[#ffc947]
                      bg-size-[200%_100%]
                      shadow-xl shadow-[#ffc947]/25
                      hover:shadow-[#ffc947]/50 hover:-translate-y-px
                      active:translate-y-0
                      transition-all duration-200 cursor-pointer overflow-hidden
                    "
                    style={{ animation: 'gradientSlide 3s linear infinite' }}
                  >
                    {/* shimmer */}
                    <span className="absolute inset-0 bg-linear-to-br from-transparent via-white/35 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                    <Rocket size={16} className="relative z-10 transition-transform duration-300 group-hover:-rotate-12 group-hover:translate-x-0.5" />
                    <span className="relative z-10">Απόκτησέ το</span>
                    <ChevronRight size={15} className="relative z-10 transition-transform duration-200 group-hover:translate-x-0.5" />
                    {/* glow pulse */}
                    <span className="absolute -inset-1 rounded-xl blur-lg opacity-20 bg-[#ffc947] animate-pulse pointer-events-none" />
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      <TenantOnboardingModal
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onDone={(tenantId) => { console.log("Onboarding started for tenant:", tenantId); }}
        onCreated={(info) => setCreatedInfo(info)}
      />

      <CreatedInfoModal
        open={!!createdInfo}
        adminEmail={createdInfo?.adminEmail ?? ""}
        tenantId={createdInfo?.tenantId ?? ""}
        onClose={() => setCreatedInfo(null)}
      />

      {/* ── Forgot Password Modal ── */}
      {showForgot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowForgot(false)} />
          <div
            className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/90 backdrop-blur-xl p-7 shadow-2xl"
            style={{ animation: 'loginFadeUp 0.25s ease both' }}
          >
            {/* top bar */}
            <div className="absolute top-0 left-0 right-0 h-0.75 rounded-t-2xl bg-linear-to-r from-[#ffc947] via-[#ffdd80] to-[#ffc947]" />

            <div className="mb-5">
              <h3 className="text-lg font-black text-white tracking-tight">Επαναφορά κωδικού</h3>
              <p className="mt-1 text-sm text-slate-400">
                Θα σου στείλουμε email με link για να ορίσεις νέο κωδικό.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Email</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none flex">
                  <Mail size={15} />
                </span>
                <input
                  id="reset-email"
                  className={`${darkInput} pl-10`}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                />
              </div>
            </div>

            {resetMsg && (
              <div className={`mt-3 flex items-start gap-2 px-3.5 py-3 rounded-xl text-sm border ${
                resetMsg.includes("Σου στείλαμε")
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : "bg-red-500/10 border-red-500/20 text-red-400"
              }`}>
                {resetMsg.includes("Σου στείλαμε") && <CheckCircle2 size={14} className="shrink-0 mt-px" />}
                {resetMsg}
              </div>
            )}

            <div className="mt-5 flex gap-2.5 justify-end">
              <button
                type="button"
                onClick={() => setShowForgot(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-400 border border-white/10 hover:bg-white/5 hover:text-white transition-all cursor-pointer"
              >
                Άκυρο
              </button>
              <button
                type="button"
                onClick={onForgotPassword}
                disabled={resetBusy}
                className="
                  relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                  text-sm font-bold text-black
                  bg-linear-to-r from-[#ffc947] to-[#ffb700]
                  shadow-lg shadow-[#ffc947]/20 hover:shadow-[#ffc947]/40
                  hover:-translate-y-px active:translate-y-0
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-150 cursor-pointer overflow-hidden group
                "
              >
                <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                <span className="relative z-10">{resetBusy ? "Αποστολή…" : "Στείλε link"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* entrance keyframes */}
      <style>{`
        @keyframes loginFadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes gradientSlide {
          0%   { background-position: 0%   50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0%   50%; }
        }
      `}</style>
    </div>
  );
}