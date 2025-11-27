// src/pages/LoginPage.tsx
import { supabase } from '../lib/supabase';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import logo from '../assets/CTGYM.YELLOW 1080x1080.svg';


export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-background bg-gradient-to-br from-background via-background/80 to-slate-950 text-slate-100 px-4">
      {/* BIG LOGO OUTSIDE CARD */}
      <div className="flex flex-col items-center mb-8 text-center space-y-3">
        {/* Change src to your logo path */}
        <img
          src={logo}
          alt="Cloudtec Gym"
          className="h-40 w-40 object-contain"
        />

        <div className="space-y-1 -mt-22">
          <h1 className="text-2xl font-semibold tracking-tight">
            Cloudtec Gym Admin
          </h1>
          <p className="text-sm text-slate-400">
            Συνδεθείτε για να διαχειριστείτε το γυμναστήριό σας.
          </p>
        </div>
      </div>

      {/* CARD */}
      <div className="w-full max-w-md bg-slate-900/70 border border-slate-800 rounded-2xl p-8 shadow-xl space-y-4 mb-40">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-200" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="w-full rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
            className="w-full rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="••••••••"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </div>

        <button
          className="w-full rounded-xl px-3 py-2 bg-primary-600 hover:bg-primary-500 text-sm font-medium text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={onLogin}
          disabled={pending}
        >
          {pending ? 'Γίνεται σύνδεση…' : 'Σύνδεση'}
        </button>

        {error && (
          <p className="text-red-400 text-sm">
            {error}
          </p>
        )}

        <p className="text-xs text-slate-500 pt-2">
          Το portal αυτό προορίζεται μόνο για διαχειριστές γυμναστηρίου (admin / owner).
        </p>
      </div>
    </div>
  );
}
