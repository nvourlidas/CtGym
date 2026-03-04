// src/layout/AppShell.tsx
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { NAV, type NavEntry } from '../_nav';
import type { LucideIcon } from 'lucide-react';
import logo from '../assets/CTGYM.YELLOW 1080x1080.svg';
import PlanPickerModal from '../components/billing/PlanPickerModal';
import { LogOut, Rocket, Menu, ChevronDown, Sun, Moon, Crown, Zap, AlertTriangle, Clock } from 'lucide-react';

type Tenant = { name: string };
type ThemeMode = 'light' | 'dark';

function getInitialTheme(): ThemeMode {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return 'dark';
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
  localStorage.setItem('theme', mode);
  window.dispatchEvent(new Event('storage')); 
}

type PlanTier = 'free' | 'starter' | 'pro';

function normalizeTier(raw: any): PlanTier {
  const s = String(raw ?? '').toLowerCase();
  if (s.includes('pro')) return 'pro';
  if (s.includes('starter')) return 'starter';
  return 'free';
}

function tierRank(t: PlanTier) {
  return t === 'free' ? 0 : t === 'starter' ? 1 : 2;
}

function needsUpgrade(userTier: PlanTier, minPlan?: 'starter' | 'pro') {
  if (!minPlan) return false;
  return tierRank(userTier) < tierRank(minPlan);
}

function planBadgeLabel(minPlan?: 'starter' | 'pro') {
  if (!minPlan) return null;
  return minPlan.toUpperCase();
}

export default function AppShell() {
  const { profile, subscription, subscriptionLoading } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showPlansModal, setShowPlansModal] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [plansBusy, setPlansBusy] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());

  useEffect(() => { applyTheme(theme); }, [theme]);

  useEffect(() => {
    (async () => {
      if (!profile?.tenant_id) return;
      const { data } = await supabase
        .from('tenants').select('name').eq('id', profile.tenant_id).maybeSingle();
      setTenant(data ?? null);
    })();
  }, [profile?.tenant_id]);

  const subscriptionBanner = useMemo(() => {
    const isAdminLike = profile?.role === 'admin' || profile?.role === 'owner';
    if (!isAdminLike) return null;
    if (!subscription) return { type: 'expired' as const, daysLeft: null as number | null, message: 'Δεν υπάρχει ενεργή συνδρομή. Απαιτείται επιλογή πλάνου.' };
    const now = new Date();
    const endDate = subscription.grace_until
      ? new Date(subscription.grace_until)
      : subscription.current_period_end ? new Date(subscription.current_period_end) : null;
    if (!endDate) {
      const isActive = subscription.is_active === true || subscription.status === 'active';
      if (!isActive) return { type: 'expired' as const, daysLeft: null as number | null, message: 'Η συνδρομή δεν είναι ενεργή. Απαιτείται επιλογή πλάνου.' };
      return null;
    }
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { type: 'expired' as const, daysLeft, message: 'Η συνδρομή σας έχει λήξει. Οι λειτουργίες είναι περιορισμένες.' };
    if (daysLeft <= 7) return { type: 'warning' as const, daysLeft, message: `Η συνδρομή σας λήγει σε ${daysLeft} ημέρες.` };
    return null;
  }, [subscription, profile?.role]);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    const isAdminLike = profile.role === 'admin' || profile.role === 'owner';
    if (!isAdminLike) return;
    if (subscriptionLoading) return;
    const isActive = subscription?.is_active === true || subscription?.status === 'active';
    if (subscription && isActive) return;
    const key = `shown_plans_modal_${profile.tenant_id}`;
    if (sessionStorage.getItem(key) === '1') return;
    sessionStorage.setItem(key, '1');
    setShowPlansModal(true);
  }, [profile?.tenant_id, profile?.role, subscription, subscriptionLoading]);

  useEffect(() => {
    if (!showPlansModal) return;
    let alive = true;
    (async () => {
      setPlansBusy(true); setPlansError(null);
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
    return () => { alive = false; };
  }, [showPlansModal]);

  const onSubscribe = async (planId: string) => {
    if (!profile?.tenant_id) return;
    setPlansBusy(true); setPlansError(null);
    try {
      const { data, error } = await supabase.functions.invoke('viva-create-checkout', {
        body: {
          tenant_id: profile.tenant_id, plan_id: planId,
          customer_email: profile.email ?? null, customer_full_name: profile.full_name ?? null,
          request_lang: 'el',
        },
      });
      if (error) throw error;
      const url = data?.checkoutUrl ?? data?.checkout_url;
      if (!url) throw new Error('Δεν επιστράφηκε checkout url από Viva.');
      window.open(url, '_blank');
    } catch (e: any) {
      setPlansError(e?.message || 'Αποτυχία εκκίνησης πληρωμής.');
    } finally {
      setPlansBusy(false);
    }
  };

  const isPro = useMemo(() => {
    if (!subscription) return false;
    const tier = String((subscription as any)?.plan_id ?? (subscription as any)?.tier ?? "").toLowerCase();
    return tier === "pro";
  }, [subscription]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <div className="min-h-screen bg-background text-text-primary flex">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:bg-secondary-background lg:border-r lg:border-border/10 lg:sticky lg:top-0 lg:h-screen lg:shrink-0">
        <SidebarNav />
      </aside>

      {/* ── Mobile sidebar ── */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 bg-secondary-background border-r border-border/10 flex flex-col transform transition-transform duration-200 ease-out lg:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarNav />
      </aside>
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Main column ── */}
      <div className="flex-1 min-w-0 flex flex-col">

        {/* Subscription banner */}
        {subscriptionBanner && (
          <div className={[
            'flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border-b',
            subscriptionBanner.type === 'expired'
              ? 'bg-danger/90 text-white border-red-700/30'
              : 'bg-accent/90 text-black border-yellow-600/30',
          ].join(' ')}>
            {subscriptionBanner.type === 'expired'
              ? <AlertTriangle className="h-4 w-4 shrink-0" />
              : <Clock className="h-4 w-4 shrink-0" />
            }
            <span>{subscriptionBanner.message}</span>
            <NavLink to="/settings/billing" className="underline font-bold ml-1">
              Διαχείριση
            </NavLink>
          </div>
        )}

        {/* ── Header ── */}
        <header className="h-14 sticky top-0 z-20 bg-secondary-background border-b border-border/10">
          <div className="h-full px-4 flex items-center justify-between gap-3">

            {/* Left */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                className="lg:hidden inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/10 bg-white/5 hover:bg-white/10 text-text-secondary hover:text-text-primary transition-all cursor-pointer"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <Menu className="h-4 w-4" />
              </button>

              <img src={logo} className="h-25 w-auto object-contain" alt="Cloudtec Gym" />

              {tenant?.name && (
                <div className="hidden sm:flex items-center gap-1.5">
                  <span className="text-border/40 text-sm">•</span>
                  <span className="text-sm font-medium text-text-secondary truncate max-w-40">
                    {tenant.name}
                  </span>
                </div>
              )}
            </div>

            {/* Right */}
            <div className="flex items-center gap-2 shrink-0">
              {!isPro && (
                <button
                  onClick={() => setShowPlansModal(true)}
                  className="
                    group relative inline-flex items-center gap-1.5
                    h-8 px-3 rounded-lg text-xs font-bold text-black
                    bg-linear-to-r from-accent to-yellow-400
                    shadow-md shadow-accent/20
                    hover:shadow-accent/40 hover:-translate-y-px
                    active:translate-y-0
                    transition-all duration-150 cursor-pointer overflow-hidden
                  "
                >
                  <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                  <Rocket className="h-3.5 w-3.5 relative z-10 transition-transform duration-200 group-hover:-rotate-12" />
                  <span className="relative z-10">Αναβάθμιση</span>
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

// ─────────────────────────────────────────────
// SidebarNav
// ─────────────────────────────────────────────
function SidebarNav() {
  const { profile, subscription } = useAuth();
  const role = profile?.role ?? 'member';
  const location = useLocation();

  const userTier = useMemo(() => {
    const raw = (subscription as any)?.plan_id ?? (subscription as any)?.tier ?? 'free';
    return normalizeTier(raw);
  }, [subscription]);

  const visible = useMemo(
    () => NAV.filter((e) => {
      if (e.type === 'item') return !e.roles || e.roles.includes(role);
      if (e.type === 'group') return !e.roles || e.roles.includes(role);
      return true;
    }),
    [role],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Logo area */}
      <div className="px-4 py-4 shrink-0 border-b border-border/10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/20 flex items-center justify-center">
            <Crown className="h-3.5 w-3.5 text-accent" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Admin</div>
            <div className="text-xs font-semibold text-text-primary truncate">
              {profile?.full_name?.split(' ')[0] ?? 'Dashboard'}
            </div>
          </div>
        </div>
      </div>

      {/* Nav scroll */}
      <nav className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-3 py-3 space-y-0.5">
        {visible.map((e, i) => {
          if (e.type === 'section') {
            return (
              <div key={`sec-${i}`} className="px-2 pt-4 pb-1.5 text-[10px] tracking-widest font-bold uppercase text-text-secondary/50">
                {e.title}
              </div>
            );
          }
          if (e.type === 'divider') {
            return <div key={`div-${i}`} className="my-2 border-t border-border/10" />;
          }
          if (e.type === 'item') {
            const badge = needsUpgrade(userTier, (e as any).minPlan) ? planBadgeLabel((e as any).minPlan) : null;
            return (
              <NavItem
                key={`item-${e.to}-${i}`}
                to={e.to} label={e.label} end={e.end}
                Icon={e.icon as LucideIcon | undefined}
                badge={badge}
              />
            );
          }
          return (
            <SidebarGroup
              key={`group-${e.label}-${i}`}
              entry={e} currentPath={location.pathname}
              role={role} userTier={userTier}
            />
          );
        })}
      </nav>

      {/* Bottom user strip */}
      <div className="shrink-0 border-t border-border/10 px-3 py-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl">
          <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary uppercase shrink-0">
            {(profile?.full_name?.[0] ?? profile?.email?.[0] ?? '?')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-text-primary truncate">{profile?.full_name ?? '—'}</div>
            <div className="text-[10px] text-text-secondary truncate">{profile?.role}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SidebarGroup
// ─────────────────────────────────────────────
function SidebarGroup({
  entry, currentPath, role, userTier,
}: {
  entry: Extract<NavEntry, { type: 'group' }>;
  currentPath: string;
  role: string;
  userTier: PlanTier;
}) {
  const initiallyOpen = entry.children.some((ch) => currentPath.startsWith(ch.to));
  const [open, setOpen] = useState(initiallyOpen);
  const children = entry.children.filter((ch) => !ch.roles || ch.roles.includes(role));
  const GroupIcon = entry.icon as LucideIcon | undefined;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={[
          'w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-all duration-150 cursor-pointer',
          open
            ? 'bg-primary/10 text-primary font-semibold'
            : 'text-text-secondary hover:bg-border/5 hover:text-text-primary',
        ].join(' ')}
      >
        <span className="flex items-center gap-2.5">
          {GroupIcon ? <GroupIcon className="h-4 w-4 shrink-0" /> : null}
          <span>{entry.label}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className={`overflow-hidden transition-[max-height] duration-200 ease-out ${open ? 'max-h-96' : 'max-h-0'}`}>
        <div className="pl-3 mt-0.5 space-y-0.5 border-l border-border/10 ml-5">
          {children.map((ch, idx) => {
            const badge = needsUpgrade(userTier, (ch as any).minPlan) ? planBadgeLabel((ch as any).minPlan) : null;
            return (
              <NavItem
                key={`${ch.to}-${idx}`}
                to={ch.to} label={ch.label} end={ch.end}
                Icon={ch.icon as LucideIcon | undefined}
                nested badge={badge}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// NavItem
// ─────────────────────────────────────────────
function NavItem({
  to, label, end, Icon, nested = false, badge = null,
}: {
  to: string; label: string; end?: boolean;
  Icon?: LucideIcon; nested?: boolean; badge?: string | null;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-150',
          nested ? '' : '',
          isActive
            ? 'bg-primary/12 text-primary font-semibold'
            : 'text-text-secondary hover:bg-border/5 hover:text-text-primary',
        ].join(' ')
      }
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      <span className="flex-1 min-w-0 leading-snug wrap-break-word whitespace-normal">{label}</span>
      {badge && (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/8 text-accent px-1.5 py-0.5 text-[9px] font-bold tracking-wider">
          {badge === 'PRO' ? <Crown className="h-2.5 w-2.5" /> : <Zap className="h-2.5 w-2.5" />}
          {badge}
        </span>
      )}
    </NavLink>
  );
}

// ─────────────────────────────────────────────
// UserMenu
// ─────────────────────────────────────────────
function UserMenu({ theme, onToggleTheme }: { theme: ThemeMode; onToggleTheme: () => void }) {
  const { session, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey  = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const signOut = async () => { await supabase.auth.signOut(); window.location.href = '/login'; };

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : (session?.user?.email?.[0] ?? '?').toUpperCase();

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 h-8 pl-1.5 pr-2.5 rounded-lg border border-border/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
      >
        <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center text-[9px] font-bold text-primary uppercase">
          {initials}
        </div>
        <span className="text-xs font-medium text-text-primary hidden sm:block max-w-25 truncate">
          {profile?.full_name?.split(' ')[0] || session?.user?.email?.split('@')[0] || 'Account'}
        </span>
        <ChevronDown className={`h-3 w-3 text-text-secondary transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border/10 bg-secondary-background shadow-xl overflow-hidden z-50"
             style={{ animation: 'menuIn 0.15s ease' }}>

          {/* User info */}
          <div className="px-4 py-3 border-b border-border/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary uppercase shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text-primary truncate">{profile?.full_name || '—'}</div>
                <div className="text-[11px] text-text-secondary truncate">{session?.user?.email}</div>
              </div>
            </div>
            <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-border/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-secondary">
              {profile?.role}
            </div>
          </div>

          {/* Theme toggle */}
          <div className="px-4 py-3 border-b border-border/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-text-primary">
                {theme === 'dark' ? <Moon className="h-3.5 w-3.5 text-text-secondary" /> : <Sun className="h-3.5 w-3.5 text-text-secondary" />}
                <span>{theme === 'dark' ? 'Σκοτεινό' : 'Φωτεινό'}</span>
              </div>
              <button
                type="button"
                onClick={onToggleTheme}
                className={[
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 cursor-pointer',
                  theme === 'dark' ? 'bg-primary' : 'bg-border/20',
                ].join(' ')}
                aria-label="Toggle theme"
              >
                <span className={[
                  'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
                  theme === 'dark' ? 'translate-x-4' : 'translate-x-0.5',
                ].join(' ')} />
              </button>
            </div>
          </div>

          {/* Sign out */}
          <div className="p-1.5">
            <button
              onClick={signOut}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-danger hover:bg-danger/8 transition-all cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              Αποσύνδεση
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes menuIn {
          from { opacity: 0; transform: translateY(6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)  scale(1);     }
        }
      `}</style>
    </div>
  );
}