/* @refresh reload */
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AuthContext, type AuthCtx, type Profile, type Session, type TenantSubscriptionStatus } from './AuthContext';

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [subscription, setSubscription] = useState<TenantSubscriptionStatus | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);


  async function loadProfile(s: Session | null) {
    if (!s) {
      setProfile(null);
      setSubscription(null);
      return;
    }

    setProfileLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_profile').single();
      if (error) {
        console.warn('get_my_profile error:', error);
        setProfile(null);
        setSubscription(null);
      } else {
        const p = data as Profile;
        setProfile(p);
        await loadSubscription(p?.tenant_id); // ✅ add this
      }
    } finally {
      setProfileLoading(false);
    }
  }


  async function loadSubscription(tenantId: string | null | undefined) {
    if (!tenantId) { setSubscription(null); return; }

    setSubscriptionLoading(true);
    try {
      const { data, error } = await supabase
        .from('tenant_subscription_status')
        .select('tenant_id, status, current_period_end, grace_until, is_active')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) {
        console.warn('tenant_subscription_status error:', error);
        setSubscription(null);
      } else {
        setSubscription((data as TenantSubscriptionStatus) ?? null);
      }
    } finally {
      setSubscriptionLoading(false);
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
    () => ({ session, profile, authReady, profileLoading, subscription, subscriptionLoading }),
    [session, profile, authReady, profileLoading, subscription, subscriptionLoading]
  );


  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
