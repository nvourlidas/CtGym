import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { session, authReady, profile, profileLoading } = useAuth();

  if (!authReady) return <div className="p-6">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;

  // We need role info; show a short loader only while fetching it the first time.
  if (profile === null && profileLoading) {
    return <div className="p-6">Loading…</div>;
  }

  const allowed = !!profile && (profile.role === 'owner' || profile.role === 'admin');
  if (!allowed) return <Navigate to="/login?err=unauthorized" replace />;

  return <>{children}</>;
}
