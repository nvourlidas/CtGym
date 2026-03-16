export type Member = { id: string; full_name: string | null; email: string | null };

export type SessionClassRel = {
  id: string; title: string;
  drop_in_enabled: boolean | null; drop_in_price: number | null; member_drop_in_price: number | null;
};

export type BookingWithMember = {
  id: string; user_id: string; status: string | null; booking_type: string | null;
  drop_in_price: number | null; drop_in_paid: boolean | null;
  members: { id: string; full_name: string | null; email: string | null } | null;
};

export type SessionWithRelations = {
  id: string; tenant_id: string; class_id: string | null;
  starts_at: string; ends_at: string | null;
  classes: SessionClassRel | SessionClassRel[] | null;
  bookings: BookingWithMember[];
};

export type Feedback = { type: 'success' | 'error'; message: string } | null;
export type DropInPromptState = { memberId: string; sessionId: string } | null;
export type BulkPreview = {
  matchingCount: number; alreadyBookedCount: number; toCreateCount: number;
  sessionsToCreate: { id: string; starts_at: string }[];
};
