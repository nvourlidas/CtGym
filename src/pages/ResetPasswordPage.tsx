// src/pages/ResetPasswordPage.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ResetPasswordPage() {
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [show, setShow] = useState(false);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      password.length >= 8 &&
      password2.length >= 8 &&
      password === password2 &&
      !busy
    );
  }, [password, password2, busy]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // Supabase will often set a session automatically when landing here from the email link.
        const { data } = await supabase.auth.getSession();

        if (!mounted) return;

        setHasSession(Boolean(data.session));
      } finally {
        if (mounted) setChecking(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (password !== password2) {
      setMsg('Οι κωδικοί δεν ταιριάζουν.');
      return;
    }
    if (password.length < 8) {
      setMsg('Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setMsg('✅ Ο κωδικός άλλαξε επιτυχώς. Μπορείς να συνδεθείς.');
      // Optional: sign out so they login fresh
      await supabase.auth.signOut();

      // Take them to login after a moment
      setTimeout(() => navigate('/login'), 900);
    } catch (err: any) {
      console.error('updateUser password error:', err);
      setMsg(err?.message ?? 'Κάτι πήγε στραβά. Προσπάθησε ξανά.');
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#253649] text-white grid place-items-center px-6">
        <div className="text-sm text-white/80">Έλεγχος συνδέσμου…</div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen bg-[#253649] text-white grid place-items-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#1f2f40] p-6 shadow">
          <h1 className="text-xl font-semibold mb-2">Ο σύνδεσμος δεν είναι ενεργός</h1>
          <p className="text-sm text-white/70 mb-4">
            Άνοιξε ξανά το email επαναφοράς και πάτησε τον σύνδεσμο. Αν έχει λήξει,
            ζήτησε νέο email επαναφοράς κωδικού.
          </p>

          <button
            onClick={() => navigate('/login')}
            className="w-full rounded-full bg-accent` text-[#020617] font-semibold py-3"
          >
            Πίσω στη σύνδεση
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#253649] text-white grid place-items-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#1f2f40] p-6 shadow">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-10 w-10 rounded-xl bg-white/10 grid place-items-center">
            <Lock className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Νέος κωδικός</h1>
            <p className="text-xs text-white/60">Ορίσε τον νέο σου κωδικό πρόσβασης</p>
          </div>
        </div>

        {msg ? (
          <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/80">
            {msg}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-white/70">Νέος κωδικός</label>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent outline-none text-sm"
                placeholder="Τουλάχιστον 8 χαρακτήρες"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="text-white/60 hover:text-white"
                aria-label="toggle password visibility"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-white/70">Επιβεβαίωση νέου κωδικού</label>
            <div className="mt-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <input
                type={show ? 'text' : 'password'}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                className="w-full bg-transparent outline-none text-sm"
                placeholder="Ξανά τον ίδιο κωδικό"
                autoComplete="new-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-full bg-accent` text-white font-semibold py-3 disabled:opacity-60"
          >
            {busy ? 'Αποθήκευση…' : 'Αλλαγή κωδικού'}
          </button>
        </form>

        <div className="mt-4 text-xs text-white/50">
          Tip: Αν ο σύνδεσμος λήξει, ζήτησε νέο “Επαναφορά κωδικού” από τη σελίδα σύνδεσης.
        </div>
      </div>
    </div>
  );
}
