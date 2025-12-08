// src/pages/ResetPasswordPage.tsx
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import logo from '../assets/CTGYM.YELLOW 1080x1080.svg';

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('');
    const [password2, setPassword2] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [hasSession, setHasSession] = useState<boolean | null>(null);


    const [userEmail, setUserEmail] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            const { data } = await supabase.auth.getUser();
            setUserEmail(data.user?.email ?? null);
            setHasSession(!!data.user);
        };
        load();
    }, []);


    // Check if we have a valid recovery session from the email link
    useEffect(() => {
        const checkSession = async () => {
            const { data } = await supabase.auth.getSession();
            setHasSession(!!data.session);
        };
        checkSession();
    }, []);

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);

        if (!password || !password2) {
            setError('Συμπλήρωσε και τα δύο πεδία κωδικού.');
            return;
        }

        if (password !== password2) {
            setError('Οι κωδικοί δεν ταιριάζουν.');
            return;
        }

        if (password.length < 6) {
            setError('Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.');
            return;
        }

        setPending(true);
        try {
            const { error } = await supabase.auth.updateUser({
                password: password,
            });

            if (error) throw error;

            setSuccess(true);
        } catch (e: any) {
            setError(e?.message || 'Κάτι πήγε στραβά. Δοκίμασε ξανά.');
        } finally {
            setPending(false);
        }
    };

    const showInvalid =
        hasSession === false && !success && !pending;

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background bg-gradient-to-br from-background via-background/80 to-slate-950 text-slate-100 px-4">
            {/* BIG LOGO OUTSIDE CARD - SAME AS LOGIN */}
            <div className="flex flex-col items-center mb-8 text-center">
                <img
                    src={logo}
                    alt="Cloudtec Gym"
                    className="h-100 w-100 object-cover"
                />
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Cloudtec Gym
                    </h1>
                    <p className="text-sm text-slate-400">
                        Όρισε έναν νέο κωδικό πρόσβασης για τον λογαριασμό σου.
                    </p>
                </div>
            </div>

            {/* CARD */}
            <div className="w-full max-w-md bg-slate-900/70 border border-slate-800 rounded-2xl p-8 shadow-xl space-y-4 mb-40">
                {userEmail && (
                    <p className="text-xs text-slate-400 mb-2">
                        Αλλάζεις κωδικό για: <span className="font-semibold">{userEmail}</span>
                    </p>
                )}

                {showInvalid && (
                    <p className="text-red-400 text-sm mb-4">
                        Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει λήξει.
                    </p>
                )}

                {!showInvalid && (
                    <form onSubmit={onSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <label
                                className="text-sm font-medium text-slate-200"
                                htmlFor="password"
                            >
                                Νέος κωδικός
                            </label>
                            <input
                                id="password"
                                className="w-full rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                placeholder="••••••••"
                                type="password"
                                autoComplete="new-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={pending}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label
                                className="text-sm font-medium text-slate-200"
                                htmlFor="password2"
                            >
                                Επιβεβαίωση νέου κωδικού
                            </label>
                            <input
                                id="password2"
                                className="w-full rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                placeholder="••••••••"
                                type="password"
                                autoComplete="new-password"
                                value={password2}
                                onChange={(e) => setPassword2(e.target.value)}
                                disabled={pending}
                            />
                        </div>

                        {error && (
                            <p className="text-red-400 text-sm">
                                {error}
                            </p>
                        )}

                        {success && (
                            <p className="text-emerald-400 text-sm">
                                Ο κωδικός σου άλλαξε με επιτυχία. Μπορείς τώρα να συνδεθείς.
                            </p>
                        )}

                        <button
                            type="submit"
                            className="w-full rounded-xl px-3 py-2 bg-primary-600 hover:bg-primary-500 text-sm font-medium text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
                            disabled={pending || hasSession === false}
                        >
                            {pending ? 'Αποθήκευση…' : 'Αλλαγή κωδικού'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
