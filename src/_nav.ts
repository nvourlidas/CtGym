// src/_nav.ts
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Users, Dumbbell, CalendarClock, BookmarkCheck,
  Layers, CreditCard, BadgeDollarSign, CalendarPlus
} from 'lucide-react';

export type NavEntry =
  | { type: 'section'; title: string }
  | { type: 'divider' }
  | { type: 'item'; label: string; to: string; end?: boolean; roles?: string[]; icon?: LucideIcon }
  | {
      type: 'group';
      label: string;
      roles?: string[];
      icon?: LucideIcon; // optional icon for the group header
      children: Array<{ label: string; to: string; end?: boolean; roles?: string[]; icon?: LucideIcon }>;
    };

export const NAV: NavEntry[] = [
  { type: 'section', title: 'Main' },
  { type: 'item', label: 'Dashboard', to: '/', end: true, icon: LayoutDashboard },
  { type: 'item', label: 'Members', to: '/members', icon: Users },
  { type: 'item', label: 'Classes', to: '/classes', icon: Dumbbell },

  {
    type: 'group',
    label: 'Scheduling',
    icon: CalendarClock,
    children: [
      { label: 'Class Sessions', to: '/sessions', icon: Layers },
      { label: 'Bookings', to: '/bookings', icon: BookmarkCheck },
      { label: 'Programs', to: '/programs', icon: CalendarPlus },
    ],
  },

  {
    type: 'group',
    label: 'Memberships',
    icon: CreditCard,
    children: [
      { label: 'Membership Plans', to: '/plans', icon: BadgeDollarSign },
      { label: 'Memberships', to: '/memberships', icon: BookmarkCheck },
    ],
  },

  { type: 'section', title: 'Management' },
];
