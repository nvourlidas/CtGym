export type PlanKind = 'duration' | 'sessions' | 'hybrid';
export type Category = { id: string; name: string; color: string | null };
export type Plan = {
  id: string; tenant_id: string; name: string; description: string | null;
  price: number | null; plan_kind: PlanKind; duration_days: number | null;
  session_credits: number | null; created_at: string; categories: Category[];
};
export type Toast = {
  id: string; title: string; message?: string; variant?: 'error' | 'success' | 'info';
  actionLabel?: string; onAction?: () => void;
};
