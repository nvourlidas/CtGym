// src/components/members/details/types.ts
export type Member = {
  id: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  email: string | null;
  birth_date?: string | null;
  address?: string | null;
  afm?: string | null;
  max_dropin_debt?: number | null;
};

export type HistoryRow = {
  id: string;
  status: string | null;
  created_at: string;
  session_start: string | null;
  session_end: string | null;
  class_title: string | null;
};

export type EconomicSummary = {
  membershipDebt: number;
  dropinDebt: number;
  membershipTotal: number;
  dropinTotal: number;
  combinedTotal: number;
};

export type MembershipDebtRow = {
  id: string;
  debt: number;
  planPrice: number | null;
  customPrice: number | null;
};

export type DropinDebtRow = {
  id: string;
  price: number;
  sessionTitle: string | null;
  sessionDate: string | null;
};

export type BookingStatus = 'booked' | 'checked_in' | 'canceled' | 'no_show';
