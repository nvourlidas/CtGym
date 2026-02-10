// src/pages/DashboardPage.tsx
import { useCallback, useState } from 'react';
import MetricWidget from '../components/widgets/MetricWidget';
import { useAuth } from '../auth';
import { CalendarMonth } from '../components/CalendarMonth';
import SessionAttendanceModal from "../components/Programs/SessionAttendanceModal";
import TodayBookingsPieWidget from '../components/dashboard/TodayMetricsPie';
import { MembershipsLineChart } from '../components/dashboard/MembershipsLineChart';
import { BookingsLineChart } from '../components/dashboard/BookingsLineChart';

type SessionForModal = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  classes?: { title: string }[] | { title: string } | null;
};

function titleFromSession(s: SessionForModal) {
  const c = s.classes;
  if (!c) return "Class";
  return Array.isArray(c) ? (c[0]?.title ?? "Class") : (c.title ?? "Class");
}

function fmtHM(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ✅ HOISTED OUTSIDE Dashboard: stable identity, no remounting subtrees
function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-text-primary/80">
          {title}
        </h2>
        {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id!;
  const [selected, setSelected] = useState<SessionForModal | null>(null);

  // ✅ stable callback (helps avoid extra rerenders in CalendarMonth if it memoizes props)
  const handleSessionClick = useCallback((s: SessionForModal) => {
    setSelected(s);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelected(null);
  }, []);

  return (
    <div className="p-6 space-y-6">
      <Section title="Σύνολα & Δραστηριότητα">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4">
          <MembershipsLineChart />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
            <MetricWidget
              title="Συνολικά Μέλη"
              tenantId={tenantId}
              variant="members"
              query={JSON.stringify({ source: "public.profiles", date_field: "created_at", range: "this_year" })}
            />
            <MetricWidget
              title="Ενεργές Συνδρομές"
              tenantId={tenantId}
              variant="inventory"
              query={JSON.stringify({ kind: "active_memberships" })}
            />
          </div>
        </div>
      </Section>

      <Section title="Παρουσίες / Κρατήσεις">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4">
          <TodayBookingsPieWidget tenantId={tenantId} />
          <BookingsLineChart />
        </div>
      </Section>

      <Section title="Έσοδα">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <MetricWidget
            title="Έσοδα Σήμερα"
            tenantId={tenantId}
            variant="revenue"
            query={JSON.stringify({ kind: "revenue_cash_today" })}
          />
          <MetricWidget
            title="Έσοδα Τρέχον Μήνας"
            tenantId={tenantId}
            variant="revenue"
            query={JSON.stringify({ kind: "revenue_cash_range", range: "this_month" })}
          />
          <MetricWidget
            title="Έσοδα Τρέχον Χρόνος"
            tenantId={tenantId}
            variant="revenue"
            query={JSON.stringify({ kind: "revenue_cash_range", range: "this_year" })}
          />
        </div>
      </Section>

      <Section title="Ημερολόγιο">
        <div className="rounded-md border border-border/10 bg-secondary-background/60 mt-2">
          <div className="px-4 py-3 border-b border-border/10">
            <h2 className="text-sm font-semibold opacity-80">Ημερολόγιο</h2>
          </div>
          <div className="p-3">
            <CalendarMonth tenantId={tenantId} onSessionClick={handleSessionClick} />
          </div>
        </div>
      </Section>

      {selected && (
        <SessionAttendanceModal
          tenantId={tenantId}
          sessionId={selected.id}
          sessionTitle={titleFromSession(selected)}
          sessionTime={`${new Date(selected.starts_at).toLocaleDateString()} • ${fmtHM(selected.starts_at)}–${fmtHM(selected.ends_at)}`}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}
