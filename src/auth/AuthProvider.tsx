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
      const userId = s.user.id;

      const [{ data: profileRow, error: profileErr }, { data: tenantUserRow, error: tenantUserErr }] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, created_at')
          .eq('id', userId)
          .maybeSingle(),

        supabase
          .from('tenant_users')
          .select('tenant_id, role')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      if (profileErr) {
        console.warn('profiles load error:', profileErr);
        setProfile(null);
        setSubscription(null);
        return;
      }

      if (tenantUserErr) {
        console.warn('tenant_users load error:', tenantUserErr);
        setProfile(null);
        setSubscription(null);
        return;
      }

      const email = s.user.email ?? null;
      const fullName =
        (s.user.user_metadata?.full_name as string | undefined) ??
        null;

      const p = profileRow
        ? {
          ...(profileRow as any),
          tenant_id: tenantUserRow?.tenant_id ?? null,
          role: tenantUserRow?.role ?? null,
          email,
          full_name: fullName,
          display_name: fullName ?? email?.split('@')[0] ?? 'Account',
        }
        : null;

      setProfile(p as Profile);
      await loadSubscription(tenantUserRow?.tenant_id);
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
        .select('tenant_id, plan_id, status, current_period_end, grace_until, is_active')
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
