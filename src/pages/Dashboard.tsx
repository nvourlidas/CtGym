// pages/Dashboard.tsx
import ProtectedRoute from '../auth/ProtectedRoute';
import { supabase } from '../lib/supabase';
import { useEffect, useState } from 'react';

export default function Dashboard() {
  const [tenantName, setTenantName] = useState<string>('');

  useEffect(() => {
    (async () => {
      // Load current user's profile + tenant to demo RLS works
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id, full_name')
        .maybeSingle();

      if (profile?.tenant_id) {
        const { data: tenant } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', profile.tenant_id)
          .maybeSingle();
        setTenantName(tenant?.name ?? '');
      }
    })();
  }, []);

  return (
    <ProtectedRoute>
      <div className="p-6">
        <h1 className="text-2xl font-bold">Cloudtec Gym — Admin</h1>
        <p className="mt-2 text-sm text-gray-600">
          Tenant: <span className="font-medium">{tenantName || '—'}</span>
        </p>
        <div className="mt-6 grid gap-4">
          <a className="underline" href="/classes">Manage Classes</a>
          <a className="underline" href="/members">Manage Members</a>
        </div>
      </div>
    </ProtectedRoute>
  );
}
