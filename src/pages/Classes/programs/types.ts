export type SessionRowFromDb = {
  id: string; tenant_id: string; class_id: string;
  starts_at: string; ends_at: string | null;
  capacity: number | null;
  classes?: { title: string }[] | null;
  cancel_before_hours: number | null;
};

export type SessionRow = {
  id: string; tenant_id: string; class_id: string;
  starts_at: string; ends_at: string | null;
  capacity: number | null;
  classes?: { title: string } | null;
  cancel_before_hours: number | null;
};

export type CalendarView = 'month' | 'week' | 'day';

export type SimpleClassRow = { id: string; title: string };
export type SessionIdRow   = { id: string; starts_at: string };

export type ProgramDeleteModalProps = {
  open: boolean;
  onClose: () => void;
  tenantId: string | null;
  onDeleted: () => void;
};
