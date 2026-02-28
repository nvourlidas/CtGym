// src/_nav.ts
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Users, Dumbbell, CalendarClock, BookmarkCheck,
  Layers, CreditCard, BadgeDollarSign, CalendarPlus, Folder,
  Settings,
  Palette,
  ContactRound,
  Info,
  Grid2X2Check,
  ClockCheck,
  EuroIcon,
  QrCode,
  ClipboardList,
  Clock,
} from 'lucide-react';


export type PlanTier = 'free' | 'starter' | 'pro';

type NavItem = {
  type: 'item';
  label: string;
  to: string;
  end?: boolean;
  roles?: string[];
  icon?: LucideIcon;
  minPlan?: Exclude<PlanTier, 'free'>; // ✅ starter | pro
};

type NavGroupChild = {
  label: string;
  to: string;
  end?: boolean;
  roles?: string[];
  icon?: LucideIcon;
  minPlan?: Exclude<PlanTier, 'free'>; // ✅ starter | pro
};

type NavGroup = {
  type: 'group';
  label: string;
  roles?: string[];
  icon?: LucideIcon;
  minPlan?: Exclude<PlanTier, 'free'>; // ✅ optional: gate whole group
  children: NavGroupChild[];
};

export type NavEntry =
  | { type: 'section'; title: string }
  | { type: 'divider' }
  | NavItem
  | NavGroup;

export const NAV: NavEntry[] = [
  { type: 'section', title: 'Κυρια' },
  { type: 'item', label: 'Dashboard', to: '/', end: true, icon: LayoutDashboard },
  { type: 'item', label: 'Μέλη', to: '/members', icon: Users },
  { type: 'item', label: 'Τμήματα', to: '/classes', icon: Layers },
  { type: 'item', label: 'Κατηγορίες', to: '/categories', icon: Folder },
  { type: 'item', label: 'Γυμναστές', to: '/coaches', icon: ContactRound },
  { type: 'item', label: 'QR Check-in', to: '/qrpage', icon: QrCode },



  { type: 'section', title: 'Διαχειριση' },

    {
    type: 'group',
    label: 'Προγραμματισμός',
    icon: CalendarClock,
    children: [
      { label: 'Συνεδρίες', to: '/sessions', icon: Layers },
      { label: 'Προγράμματα', to: '/programs', icon: CalendarPlus },
    ],
  },

  {
    type: 'group',
    label: 'Κρατήσεις',
    icon: Grid2X2Check,
    children: [
      { label: 'Κρατήσεις', to: '/bookings', icon: BookmarkCheck },
      { label: 'Προγραμματισμός Κρατήσεων', to: '/bulkbookings', icon: ClockCheck },
    ],
  },

  { type: 'item', label: 'Προπονήσεις', to: '/workouttemplates', icon: Dumbbell, minPlan: 'starter'  },
  { type: 'item', label: 'Ερωτηματολόγια', to: '/questionnaires', icon: ClipboardList, minPlan: 'starter'  },
  {
    type: 'group',
    label: 'Συνδρομές',
    icon: CreditCard,
    children: [
      { label: 'Πλάνα Συνδρομών', to: '/plans', icon: BadgeDollarSign },
      { label: 'Συνδρομές', to: '/memberships', icon: BookmarkCheck },
    ],
  },
  { type: 'item', label: 'Οικονομικά', to: '/finances', icon: EuroIcon, minPlan: 'starter'  },
    { type: 'section', title: 'ριθμισεισ' },
  
  {
    type: 'group',
    label: 'Ρυθμίσεις',
    icon: Settings,
    children: [
      { label: 'Εμφάνιση εφαρμογής', to: '/settings/themesettings', icon: Palette, minPlan: 'pro'  },
      { label: 'Πληροφορίες Γυμναστηρίου', to: '/settings/gyminfo', icon: Info },
      { label: 'Ωράριο Γυμναστηρίου', to: '/settings/opninghours', icon: Clock },
      { label: 'Διαχείριση Συνδρομής', to: '/settings/billing', icon: CreditCard },
    ],
  },
];
