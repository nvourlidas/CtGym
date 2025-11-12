// src/pages/DashboardPage.tsx (snippet)
import MetricWidget from '../components/widgets/MetricWidget';

export default function Dashboard() {
  return (
    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <MetricWidget
        title="Total Members"
        variant="members"
        query={JSON.stringify({ source: "public.profiles", date_field: "created_at", range: "last_year" })}
      />
      <MetricWidget
        title="Sessions Today"
        variant="sessions"
        query={JSON.stringify({ source: "public.class_sessions", date_field: "starts_at", range: "today" })}
      />
      <MetricWidget
        title="Bookings Today"
        variant="bookings"
        query={JSON.stringify({ source: "public.bookings", date_field: "created_at", range: "today" })}
      />
      <MetricWidget
        title="Active Memberships"
        variant="memberships"
        query={JSON.stringify({ source: "public.memberships", date_field: "starts_at", range: "this_month" })}
      />
    </div>
  );
}
