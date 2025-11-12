// src/layout/AppShell.tsx
import { Outlet, NavLink, useLocation  } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { NAV, type NavEntry } from '../_nav';


type Tenant = { name: string };

export default function AppShell() {
  const { profile } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    (async () => {
      if (!profile?.tenant_id) return;
      const { data } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', profile.tenant_id)
        .maybeSingle();
      setTenant(data ?? null);
    })();
  }, [profile?.tenant_id]);

  return (
    <div className="min-h-screen bg-background text-text-primary flex">
      {/* Desktop sidebar (persistent, full height) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:bg-secondary-background lg:text-text-primary lg:border-r lg:border-white/10 lg:sticky lg:top-0 lg:h-screen">
        <SidebarNav />
      </aside>

      {/* Mobile sidebar (off-canvas) */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-secondary-background text-text-primary border-r border-white/10 transform transition-transform lg:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <SidebarNav />
      </aside>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main column: header sits here so it starts where sidebar ends */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 sticky top-0 z-10 bg-secondary-background text-text-primary border-b border-white/10">
          <div className="h-full px-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 hover:bg-white/5"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <div className="font-semibold">Cloudtec Gym <span className="opacity-60">— Admin</span></div>
              <div className="hidden sm:block text-sm opacity-60">
                {tenant?.name ? `• ${tenant.name}` : '• —'}
              </div>
            </div>
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 min-h-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarNav() {
  const { profile } = useAuth();
  const role = profile?.role ?? 'member';
  const location = useLocation();

  // filter by role if provided
  const visible = useMemo(
    () =>
      NAV.filter((e) => {
        if (e.type === 'item') return !e.roles || e.roles.includes(role);
        if (e.type === 'group') return !e.roles || e.roles.includes(role);
        return true;
      }),
    [role],
  );

  return (
    <nav className="p-3">
      {visible.map((e, i) => {
        if (e.type === 'section') {
          return (
            <div key={`sec-${i}`} className="px-2 pt-4 pb-2 text-[10px] tracking-wide font-semibold uppercase opacity-60">
              {e.title}
            </div>
          );
        }
        if (e.type === 'divider') {
          return <div key={`div-${i}`} className="my-2 border-t border-white/10" />;
        }
        if (e.type === 'item') {
          return <NavItem key={`item-${e.to}-${i}`} to={e.to} label={e.label} end={e.end} />;
        }
        // group
        return <SidebarGroup key={`group-${e.label}-${i}`} entry={e} currentPath={location.pathname} role={role} />;
      })}
    </nav>
  );
}

function SidebarGroup({ entry, currentPath, role }: {
  entry: Extract<NavEntry, { type: 'group' }>;
  currentPath: string;
  role: string;
}) {
  // auto-open if any child matches current path prefix
  const initiallyOpen = entry.children.some(ch => currentPath.startsWith(ch.to));
  const [open, setOpen] = useState(initiallyOpen);

  const children = entry.children.filter(ch => !ch.roles || ch.roles.includes(role));

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm opacity-80 hover:opacity-100 hover:bg-secondary/10"
      >
        <span>{entry.label}</span>
        <svg
          width="16" height="16" viewBox="0 0 24 24"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <div className={`overflow-hidden transition-[max-height] duration-200 ${open ? 'max-h-96' : 'max-h-0'}`}>
        <div className="pl-2">
          {children.map((ch, idx) => (
            <NavLink
              key={`${ch.to}-${idx}`}
              to={ch.to}
              end={ch.end}
              className={({ isActive }) =>
                [
                  'block rounded-md px-3 py-2 text-sm transition-colors',
                  isActive ? 'bg-primary/70 text-text-primary' : 'opacity-80 hover:opacity-100 hover:bg-secondary/10',
                ].join(' ')
              }
            >
              {ch.label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}

function NavItem({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          'block rounded-md px-3 py-2 text-sm transition-colors',
          isActive ? 'bg-primary/70 text-text-primary' : 'opacity-80 hover:opacity-100 hover:bg-secondary/10',
        ].join(' ')
      }
    >
      {label}
    </NavLink>
  );
}

function UserMenu() {
  const { session, profile } = useAuth();
  const [open, setOpen] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-9 rounded-md border border-white/10 px-3 text-sm hover:bg-white/5"
      >
        {profile?.full_name || session?.user?.email || 'Account'}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-md border border-white/10 bg-secondary-background text-text-primary shadow-lg">
          <div className="px-3 py-2 text-sm">
            <div className="font-medium">{profile?.full_name || '—'}</div>
            <div className="opacity-70">{session?.user?.email}</div>
            <div className="mt-1 text-[10px] uppercase opacity-60">{profile?.role}</div>
          </div>
          <div className="border-t border-white/10" />
          <button onClick={signOut} className="w-full text-left px-3 py-2 text-sm hover:bg-white/5">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
