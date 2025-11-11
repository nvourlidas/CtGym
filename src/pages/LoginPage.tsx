// src/pages/LoginPage.tsx
import { supabase } from '../lib/supabase';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (params.get('err') === 'unauthorized') {
      setError('Your account does not have admin access.');
    }
  }, [params]);

  const onLogin = async () => {
    setError(null);
    setPending(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) throw error;

      // Check role immediately
      const userId = data.user?.id;
      if (!userId) throw new Error('No user session');

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
        throw new Error('Only admins can sign in to the Admin app.');
      }

      navigate('/', { replace: true });
    } catch (e: any) {
      setError(e?.message || 'Login failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center">
      <div className="w-full max-w-sm border rounded-lg p-6 space-y-3">
        <h1 className="text-xl font-semibold">Admin Login</h1>
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="username"
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="••••••••"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          type="password"
          autoComplete="current-password"
        />
        <button
          className="w-full rounded px-3 py-2 bg-black text-white disabled:opacity-50"
          onClick={onLogin}
          disabled={pending}
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <p className="text-xs text-gray-500 pt-1">
          This portal is for gym admins only.
        </p>
      </div>
    </div>
  );
}
