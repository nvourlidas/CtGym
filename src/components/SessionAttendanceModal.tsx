import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Booking = {
  id: string;
  tenant_id: string;
  session_id: string;
  user_id: string;
  status: "booked" | "checked_in" | "canceled" | "no_show" | string;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
};

export default function SessionAttendanceModal({
  tenantId,
  sessionId,
  sessionTitle,
  sessionTime, // optional display line like "Tue 19:00–20:00"
  onClose,
}: {
  tenantId: string;
  sessionId: string;
  sessionTitle?: string;
  sessionTime?: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Booking[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      // 1) fetch bookings for this session
      const b = await supabase
        .from("bookings")
        .select("id, tenant_id, session_id, user_id, status, created_at")
        .eq("tenant_id", tenantId)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (b.error) {
        setError(b.error.message);
        setLoading(false);
        return;
      }

      const bookings = (b.data as Booking[]) ?? [];
      setRows(bookings);

      // 2) fetch minimal profiles for involved users
      const userIds = Array.from(new Set(bookings.map((r) => r.user_id)));
      if (userIds.length) {
        const p = await supabase
          .from("profiles")
          .select("id, full_name, phone")
          .in("id", userIds);
        if (!p.error && p.data) {
          const map: Record<string, Profile> = {};
          for (const pr of p.data as Profile[]) map[pr.id] = pr;
          setProfiles(map);
        }
      }
      setLoading(false);
    })();
  }, [tenantId, sessionId]);

  const grouped = useMemo(() => {
    const g: Record<string, Booking[]> = {
      booked: [],
      checked_in: [],
      canceled: [],
      no_show: [],
    };
    for (const r of rows) {
      const key = (r.status || "booked").toLowerCase();
      if (!g[key]) g[key] = [];
      g[key].push(r);
    }
    return g;
  }, [rows]);

  const Section = ({
    title,
    items,
  }: {
    title: string;
    items: Booking[];
  }) => (
    <div className="flex-1 min-w-[220px]">
      <div className="text-xs uppercase tracking-wide opacity-70 mb-2">
        {title} <span className="opacity-60">({items.length})</span>
      </div>
      <div className="space-y-1">
        {items.length === 0 && (
          <div className="text-sm opacity-50 italic">—</div>
        )}
        {items.map((b) => {
          const p = profiles[b.user_id];
          return (
            <div
              key={b.id}
              className="rounded-md border border-white/10 px-2 py-1 text-sm"
              title={p?.full_name || b.user_id}
            >
              <div className="font-medium truncate">
                {p?.full_name ?? "—"}
              </div>
              <div className="text-xs opacity-70 truncate">
                {p?.phone ?? b.user_id}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl rounded-md border border-white/10 bg-secondary-background text-text-primary shadow-xl">
        {/* header */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="font-semibold">
              {sessionTitle ?? "Class session"}
            </div>
            {sessionTime && (
              <div className="text-xs opacity-70">{sessionTime}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 hover:bg-white/5"
          >
            ✕
          </button>
        </div>

        {/* body */}
        <div className="p-4">
          {error && (
            <div className="mb-3 text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">
              {error}
            </div>
          )}
          {loading ? (
            <div className="text-sm opacity-70">Loading…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Section title="Booked" items={grouped.booked} />
              <Section title="Checked in" items={grouped.checked_in} />
              <Section title="Canceled" items={grouped.canceled} />
              <Section title="No show" items={grouped.no_show} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
