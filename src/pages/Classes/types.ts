export type CoachRef = { id: string; full_name: string };

export type GymClass = {
  id: string; tenant_id: string; title: string; description: string | null; created_at: string;
  category_id: string | null; drop_in_enabled: boolean; drop_in_price: number | null;
  member_drop_in_price: number | null; coach_id: string | null;
  class_categories?: { id: string; name: string; color: string | null } | null;
  coach?: CoachRef | null;
};

export type Category = { id: string; name: string; color: string | null };
export type Coach    = { id: string; full_name: string };

export type Toast = {
  id: string; title: string; message?: string;
  variant?: 'error' | 'success' | 'info';
  actionLabel?: string; onAction?: () => void;
};
