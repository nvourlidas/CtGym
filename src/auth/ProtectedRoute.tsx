import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, authReady } = useAuth();

  if (!authReady) return <div className="p-6">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
