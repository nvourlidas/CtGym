import { createContext } from 'react';
import { supabase } from '../lib/supabase';

export type Session = Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'];

export type Profile =
  | {
      id: string;
      created_at?: string | null;
      tenant_id: string | null;
      role: 'owner' | 'admin' | 'staff' | 'member' | 'super_admin' | null;
      email: string | null;
      full_name: string | null;
      display_name: string;
    }
  | null;

export type AuthCtx = {
  session: Session | null;
  profile: Profile;
  authReady: boolean;
  profileLoading: boolean;
  subscription: TenantSubscriptionStatus | null;
  subscriptionLoading: boolean;
};

export type TenantSubscriptionStatus = {
  tenant_id: string;
  plan_id?: string | null;
  status: string;
  current_period_end: string | null;
  grace_until: string | null;
  is_active: boolean;
};

export const AuthContext = createContext<AuthCtx | undefined>(undefined);