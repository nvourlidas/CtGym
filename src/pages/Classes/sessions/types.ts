export type GymClass = {
  id: string; title: string;
  class_categories?: { id: string; name: string | null; color: string | null } | null;
};

export type SessionRow = {
  id: string; tenant_id: string; class_id: string;
  starts_at: string; ends_at: string;
  capacity: number | null; checkin_token: string | null;
  created_at: string; cancel_before_hours?: number | null;
};

export type DateFilter = '' | 'today' | 'week' | 'month';
