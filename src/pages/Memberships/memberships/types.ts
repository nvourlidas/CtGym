export type Member = { id: string; full_name: string | null; email?: string | null };
export type Plan = { id: string; name: string; plan_kind: 'duration' | 'sessions' | 'hybrid'; duration_days: number | null; session_credits: number | null; price: number | null };
export type PlanCategory = { id: string; name: string; color: string | null };
export type MembershipRow = {
  id: string; tenant_id: string; user_id: string; plan_id: string | null;
  starts_at: string | null; ends_at: string | null; status: string | null; created_at: string;
  remaining_sessions: number | null; plan_kind: string | null; plan_name: string | null;
  plan_price: number | null; custom_price: number | null; discount_reason?: string | null;
  days_remaining: number | null; debt: number | null;
  plan_categories?: PlanCategory[]; profile?: Member | null;
};
