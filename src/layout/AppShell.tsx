// src/layout/AppShell.tsx
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { NAV, type NavEntry } from '../_nav';
import type { LucideIcon } from 'lucide-react';
import logo from '../assets/CTGYM.YELLOW 1080x1080.svg';

type Tenant = { name: string };
type ThemeMode = 'light' | 'dark';

function getInitialTheme(): ThemeMode {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') return saved;
  // default
  return 'dark';
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode; // matches :root[data-theme="dark"]
  localStorage.setItem('theme', mode);
}

export default function AppShell() {
  const { profile, subscription } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ✅ Theme toggle state (persisted)
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

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

  const subscriptionBanner = useMemo(() => {
    if (!subscription || profile?.role !== 'admin') return null;

    const now = new Date();

    const endDate =
      subscription.grace_until
        ? new Date(subscription.grace_until)
        : subscription.current_period_end
          ? new Date(subscription.current_period_end)
          : null;

    if (!endDate) return null;

    const daysLeft = Math.ceil(
      (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysLeft < 0) {
      return {
        type: 'expired' as const,
        daysLeft,
        message: 'Η συνδρομή σας έχει λήξει. Οι λειτουργίες είναι περιορισμένες.',
      };
    }

    if (daysLeft <= 7) {
      return {
        type: 'warning' as const,
        daysLeft,
        message: `Η συνδρομή σας λήγει σε ${daysLeft} ημέρες.`,
      };
    }

    return null;
  }, [subscription, profile?.role]);

  const toggleTheme = () => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  };

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
        {subscriptionBanner && (
          <div
            className={[
              'px-4 py-2 text-sm text-center font-medium border-b',
              subscriptionBanner.type === 'expired'
                ? 'bg-danger text-white border-red-700/40'
                : 'bg-accent text-black border-yellow-600/40',
            ].join(' ')}
          >
            {subscriptionBanner.message}{' '}
            <NavLink to="/billing" className="underline font-semibold ml-2">
              Διαχείριση συνδρομής
            </NavLink>
          </div>
        )}

        <header className="h-14 sticky top-0 z-10 bg-secondary-background text-text-primary border-b border-white/10">
          <div className="h-full px-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 hover:bg-white/5"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" >
                  <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>

              <div className="font-semibold flex justify-center gap-1">
                <img src={logo}  className="w-28 sm:w-32 md:w-36 lg:w-42"/>
              </div>

              <div className="hidden sm:block text-sm opacity-60">
                {tenant?.name ? `• ${tenant.name}` : '• —'}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* ✅ Theme toggle */}
              <button
                onClick={toggleTheme}
                className="h-9 rounded-md border border-border/10 px-3 text-sm hover:bg-border/5"
                aria-label="Toggle theme"
                title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
              >
                {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
              </button>

              <UserMenu />
            </div>
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
          return (
            <NavItem
              key={`item-${e.to}-${i}`}
              to={e.to}
              label={e.label}
              end={e.end}
              Icon={e.icon as LucideIcon | undefined}
            />
          );
        }
        // group
        return (
          <SidebarGroup
            key={`group-${e.label}-${i}`}
            entry={e}
            currentPath={location.pathname}
            role={role}
          />
        );
      })}
    </nav>
  );
}

function SidebarGroup({
  entry,
  currentPath,
  role,
}: {
  entry: Extract<NavEntry, { type: 'group' }>;
  currentPath: string;
  role: string;
}) {
  // auto-open if any child matches current path prefix
  const initiallyOpen = entry.children.some((ch) => currentPath.startsWith(ch.to));
  const [open, setOpen] = useState(initiallyOpen);

  const children = entry.children.filter((ch) => !ch.roles || ch.roles.includes(role));
  const GroupIcon = entry.icon as LucideIcon | undefined;

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-md px-3 py-2 text-md opacity-80 hover:opacity-100 hover:bg-secondary/10"
      >
        <span className="flex items-center gap-2">
          {GroupIcon ? <GroupIcon className="h-8 w-4" /> : null}
          {entry.label}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <div className={`overflow-hidden transition-[max-height] duration-200 ${open ? 'max-h-96' : 'max-h-0'}`}>
        <div className="pl-2">
          {children.map((ch, idx) => (
            <NavItem
              key={`${ch.to}-${idx}`}
              to={ch.to}
              label={ch.label}
              end={ch.end}
              Icon={ch.icon as LucideIcon | undefined}
              nested
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function NavItem({
  to,
  label,
  end,
  Icon,
  nested = false,
}: {
  to: string;
  label: string;
  end?: boolean;
  Icon?: LucideIcon;
  nested?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          'rounded-md px-3 py-2 text-md transition-colors flex items-center gap-2',
          nested ? 'ml-1' : '',
          isActive ? 'bg-primary/90 text-white' : 'opacity-80 hover:opacity-100 hover:bg-secondary/10',
        ].join(' ')
      }
    >
      {Icon ? <Icon className="h-8 w-4" /> : null}
      <span>{label}</span>
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
        className="h-9 rounded-md border border-border/10 px-3 text-sm hover:bg-border/5"
      >
        {profile?.full_name || session?.user?.email || 'Account'}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-md border border-border/10 bg-secondary-background text-text-primary shadow-lg">
          <div className="px-3 py-2 text-sm">
            <div className="font-medium">{profile?.full_name || '—'}</div>
            <div className="opacity-70">{session?.user?.email}</div>
            <div className="mt-1 text-[10px] uppercase opacity-60">{profile?.role}</div>
          </div>
          <div className="border-t border-border/10" />
          <button onClick={signOut} className="w-full text-left px-3 py-2 text-sm hover:bg-border/5">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
