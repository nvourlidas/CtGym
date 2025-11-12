// src/_nav.ts
export type NavEntry =
  | { type: 'section'; title: string }
  | { type: 'divider' }
  | { type: 'item'; label: string; to: string; end?: boolean; roles?: string[] }
  | {
      type: 'group';
      label: string;
      roles?: string[];
      children: Array<{ label: string; to: string; end?: boolean; roles?: string[] }>;
    };

export const NAV: NavEntry[] = [
  { type: 'section', title: 'Main' },
  { type: 'item', label: 'Dashboard', to: '/', end: true },
  { type: 'item', label: 'Members', to: '/members' },
  { type: 'item', label: 'Classes', to: '/classes' },

  {
    type: 'group',
    label: 'Scheduling',
    children: [
      { label: 'Class Sessions', to: '/sessions' },
      { label: 'Bookings', to: '/bookings' },
    ],
  },

  { type: 'item', label: 'Membership Plans', to: '/plans' },

  { type: 'section', title: 'Management' },
  // { type: 'item', label: 'Settings', to: '/settings', roles: ['admin'] },
];
