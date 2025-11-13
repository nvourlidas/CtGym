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
  { type: 'item', label: 'Μέλη', to: '/members', icon: Users },
  { type: 'item', label: 'Τμήματα', to: '/classes', icon: Dumbbell },

  {
    type: 'group',
    label: 'Προγραμματισμός',
    icon: CalendarClock,
    children: [
      { label: 'Συνεδρίες', to: '/sessions', icon: Layers },
      { label: 'Κρατήσεις', to: '/bookings', icon: BookmarkCheck },
      { label: 'Προγράμματα', to: '/programs', icon: CalendarPlus },
    ],
  },

  {
    type: 'group',
    label: 'Συνδρομές',
    icon: CreditCard,
    children: [
      { label: 'Πλάνα Συνδρομών', to: '/plans', icon: BadgeDollarSign },
      { label: 'Συνδρομές', to: '/memberships', icon: BookmarkCheck },
    ],
  },

  { type: 'section', title: 'Management' },
];
