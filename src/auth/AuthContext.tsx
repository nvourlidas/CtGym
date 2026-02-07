import { createContext } from 'react';
import { supabase } from '../lib/supabase';

export type Session = Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'];
export type Profile =
  | { id: string; tenant_id: string | null; full_name: string | null; role: 'owner' | 'admin' | 'staff' | 'member' | null; email: string | null }
  | null;

export type AuthCtx = {
  session: Session | null;
  profile: Profile;
  authReady: boolean;    // ✅ only initial session hydration
  profileLoading: boolean; // ✅ profile fetch in background
  subscription: TenantSubscriptionStatus | null;
  subscriptionLoading: boolean;
};

export type TenantSubscriptionStatus = {
  tenant_id: string;
  status: string;
  current_period_end: string | null;
  grace_until: string | null;
  is_active: boolean;
};


export const AuthContext = createContext<AuthCtx | undefined>(undefined);
