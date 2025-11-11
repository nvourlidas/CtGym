/* @refresh reload */
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AuthContext, type AuthCtx, type Profile, type Session } from './AuthContext';

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  async function loadProfile(s: Session | null) {
    if (!s) { setProfile(null); return; }
    setProfileLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_profile').single();
      if (error) {
        console.warn('get_my_profile error:', error);
        setProfile(null);
      } else {
        setProfile(data as Profile);
      }
    } finally {
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        const sess = data.session ?? null;
        setSession(sess);
        // kick off profile in background; don't block authReady
        loadProfile(sess);
      } catch (e) {
        console.warn('Auth init error', e);
        if (mounted) setProfile(null);
      } finally {
        if (mounted) setAuthReady(true); // ✅ unblock guards quickly
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      loadProfile(s);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({ session, profile, authReady, profileLoading }),
    [session, profile, authReady, profileLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
