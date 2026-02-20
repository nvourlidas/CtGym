// src/layout/AppShell.tsx
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { NAV, type NavEntry } from '../_nav';
import type { LucideIcon } from 'lucide-react';
import logo from '../assets/CTGYM.YELLOW 1080x1080.svg';
import PlanPickerModal from '../components/billing/PlanPickerModal';
import { Rocket } from "lucide-react";


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
  const { profile, subscription, subscriptionLoading } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [showPlansModal, setShowPlansModal] = useState(false);

  const [plans, setPlans] = useState<any[]>([]);
  const [plansBusy, setPlansBusy] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);


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
    // only admin-like roles should see it
    const isAdminLike = profile?.role === 'admin' || profile?.role === 'owner';
    if (!isAdminLike) return null;

    // ✅ case 1: no row in tenant_subscription_status
    if (!subscription) {
      return {
        type: 'expired' as const,
        daysLeft: null as number | null,
        message: 'Δεν υπάρχει ενεργή συνδρομή. Απαιτείται επιλογή πλάνου.',
      };
    }

    const now = new Date();

    const endDate =
      subscription.grace_until
        ? new Date(subscription.grace_until)
        : subscription.current_period_end
          ? new Date(subscription.current_period_end)
          : null;

    // if we have a row but no dates, still treat as needs attention
    if (!endDate) {
      const isActive = subscription.is_active === true || subscription.status === 'active';
      if (!isActive) {
        return {
          type: 'expired' as const,
          daysLeft: null as number | null,
          message: 'Η συνδρομή δεν είναι ενεργή. Απαιτείται επιλογή πλάνου.',
        };
      }
      return null;
    }

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


  useEffect(() => {
    if (!profile?.tenant_id) return;

    // ✅ allow both admin + owner
    const isAdminLike =
      profile.role === 'admin' || profile.role === 'owner';

    if (!isAdminLike) return;

    // Wait until subscription is resolved (important)
    if (subscriptionLoading) return;

    // No row OR not active = should open
    const isActive =
      subscription?.is_active === true ||
      subscription?.status === 'active';

    const shouldOpen = !subscription || !isActive;

    if (!shouldOpen) return;

    // Open only once per login
    const key = `shown_plans_modal_${profile.tenant_id}`;
    if (sessionStorage.getItem(key) === '1') return;

    sessionStorage.setItem(key, '1');
    setShowPlansModal(true);
  }, [
    profile?.tenant_id,
    profile?.role,
    subscription,
    subscriptionLoading,
  ]);



  useEffect(() => {
    if (!showPlansModal) return;

    let alive = true;

    (async () => {
      setPlansBusy(true);
      setPlansError(null);

      try {
        const { data, error } = await supabase
          .from('subscription_plans')
          .select('id,name,includes_mobile,monthly_price_cents,currency,is_active,max_members,max_classes,max_membership_plans')
          .order('monthly_price_cents', { ascending: true });

        if (error) throw error;
        if (!alive) return;

        setPlans(data ?? []);
      } catch (e: any) {
        if (!alive) return;
        setPlansError(e?.message || 'Αποτυχία φόρτωσης πλάνων.');
      } finally {
        if (!alive) return;
        setPlansBusy(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [showPlansModal]);


  const onSubscribe = async (planId: string) => {
    if (!profile?.tenant_id) return;

    setPlansBusy(true);
    setPlansError(null);

    try {
      const { data, error } = await supabase.functions.invoke('viva-create-checkout', {
        body: {
          tenant_id: profile.tenant_id,
          plan_id: planId,
          customer_email: profile.email ?? null,
          customer_full_name: profile.full_name ?? null,
          request_lang: 'el',
        },
      });

      if (error) throw error;

      const url = data?.checkoutUrl ?? data?.checkout_url;
      if (!url) throw new Error('Δεν επιστράφηκε checkout url από Viva.');

      window.open(url, '_blank');
      // keep modal open until webhook activates subscription (recommended)
      // setShowPlansModal(false);
    } catch (e: any) {
      setPlansError(e?.message || 'Αποτυχία εκκίνησης πληρωμής.');
    } finally {
      setPlansBusy(false);
    }
  };

  const isPro = useMemo(() => {
    if (!subscription) return false;

    const tier = String(
      (subscription as any)?.plan_id ??
      (subscription as any)?.tier ??
      ""
    ).toLowerCase();


    return tier === "pro";
  }, [subscription]);

  console.log("Subscription;", subscription);

  const toggleTheme = () => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div className="min-h-screen bg-background text-text-primary flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:bg-secondary-background lg:text-text-primary lg:border-r lg:border-white/10 lg:sticky lg:top-0 lg:h-screen">
        <SidebarNav />
      </aside>

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-secondary-background text-text-primary border-r border-white/10 transform transition-transform lg:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } flex flex-col`}
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
            <NavLink to="/settings/billing" className="underline font-semibold ml-2">
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
                <img src={logo} className="w-25 sm:w-32 md:w-32 " />
              </div>

              <div className="hidden sm:block text-sm opacity-60">
                {tenant?.name ? `• ${tenant.name}` : '• —'}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isPro && (
                <button
                  onClick={() => setShowPlansModal(true)}
                  className="inline-flex items-center gap-2 h-9 rounded-md px-4 text-sm font-semibold bg-accent hover:bg-accent/80 text-black shadow-md hover:shadow-lg transition-all  cursor-pointer"
                >
                  <Rocket className="h-4 w-4" />
                  Αναβάθμιση
                </button>
              )}

              <UserMenu theme={theme} onToggleTheme={toggleTheme} />
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0">
          <Outlet />
        </main>
      </div>

      <PlanPickerModal
        open={showPlansModal}
        plans={plans as any}
        currentPlanId={(subscription as any)?.plan_id ?? null}
        busy={plansBusy}
        error={plansError}
        onClose={() => setShowPlansModal(false)}
        onSubscribe={onSubscribe}
      />

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
    <div className="flex h-full min-h-0 flex-col">
      {/* Optional: top area (you can keep it empty or add stuff later) */}
      {/* <div className="px-3 py-3 shrink-0">...</div> */}

      {/* Scroll area */}
      <nav className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-3">
        {visible.map((e, i) => {
          if (e.type === 'section') {
            return (
              <div
                key={`sec-${i}`}
                className="px-2 pt-4 pb-2 text-[10px] tracking-wide font-semibold uppercase opacity-60"
              >
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
    </div>
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

function UserMenu({
  theme,
  onToggleTheme,
}: {
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  const { session, profile } = useAuth();
  const [open, setOpen] = useState(false);

  const boxRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      const el = boxRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-9 rounded-md border border-border/10 px-3 text-sm hover:bg-border/5 cursor-pointer"
      >
        {profile?.full_name || session?.user?.email || 'Account'}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-md border border-border/10 bg-secondary-background text-text-primary shadow-lg">
          <div className="px-3 py-2 text-sm">
            <div className="font-medium">{profile?.full_name || '—'}</div>
            <div className="opacity-70">{session?.user?.email}</div>
            <div className="mt-1 text-[10px] uppercase opacity-60">
              {profile?.role}
            </div>
          </div>

          <div className="border-t border-border/10" />

          {/* ✅ Theme toggle inside menu */}
          <div className="px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="text-sm">Θέμα</div>

              <button
                type="button"
                onClick={onToggleTheme}
                className={[
                  "relative inline-flex h-6 w-11 items-center rounded-full transition",
                  theme === "dark" ? "bg-primary" : "bg-black/20",
                ].join(" ")}
                aria-label="Toggle theme"
                title={theme === "dark" ? "Σκοτεινό" : "Φωτεινό"}
              >
                <span
                  className={[
                    "inline-block h-5 w-5 transform rounded-full bg-white transition",
                    theme === "dark" ? "translate-x-5" : "translate-x-1",
                  ].join(" ")}
                />
              </button>
            </div>

            <div className="mt-1 text-[11px] text-text-secondary">
              {theme === "dark" ? "Σκοτεινό" : "Φωτεινό"}
            </div>
          </div>

          <div className="border-t border-border/10" />

          <button
            onClick={signOut}
            className="w-full text-left px-3 py-2 text-sm hover:bg-border/5"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
