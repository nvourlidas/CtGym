import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { QrCode } from "lucide-react";
import { SessionQrModal } from "../../components/SessionQrModal";



type Booking = {
  id: string;
  tenant_id: string;
  session_id: string;
  user_id: string;
  status: "booked" | "checked_in" | "canceled" | "no_show" | string;
  created_at: string;
  // NEW
  booking_type: "membership" | "drop_in" | string;
  drop_in_price: number | null;
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
  // NEW: capacity state
  const [capacity, setCapacity] = useState<number | null>(null);

  const [checkinToken, setCheckinToken] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      // 1) fetch bookings for this session (NOW includes booking_type + drop_in_price)
      const b = await supabase
        .from("bookings")
        .select(
          `
          id,
          tenant_id,
          session_id,
          user_id,
          status,
          created_at,
          booking_type,
          drop_in_price
        `
        )
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

      // 3) fetch session capacity
      const s = await supabase
        .from("class_sessions")
        .select("capacity, checkin_token")
        .eq("tenant_id", tenantId)
        .eq("id", sessionId)
        .maybeSingle();

      if (!s.error && s.data) {
        setCapacity(s.data.capacity ?? null);
        setCheckinToken(s.data.checkin_token ?? null);
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

  // NEW: active bookings (booked + checked_in)
  const activeCount = useMemo(
    () =>
      rows.filter((r) => {
        const s = (r.status || "").toLowerCase();
        return s === "booked" || s === "checked_in";
      }).length,
    [rows]
  );

  const remainingSlots =
    capacity && capacity > 0 ? Math.max(capacity - activeCount, 0) : null;

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
          const isDropIn = (b.booking_type || "").toLowerCase() === "drop_in";
          return (
            <div
              key={b.id}
              className="rounded-md border border-white/10 px-2 py-1 text-sm"
              title={p?.full_name || b.user_id}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium truncate">
                  {p?.full_name ?? "—"}
                </div>

                {/* badge showing membership vs drop-in */}
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${isDropIn
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
                      }`}
                  >
                    {isDropIn ? "Drop-in" : "Μέλος"}
                  </span>
                  {isDropIn && b.drop_in_price != null && (
                    <span className="text-[11px] opacity-80">
                      {b.drop_in_price.toFixed(2)}€
                    </span>
                  )}
                </div>
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
            {!loading && (
              <div className="text-xs opacity-80">
                Συμμετέχοντες:{" "}
                <span className="font-semibold">{activeCount}</span>
                {capacity != null && capacity > 0 && (
                  <>
                    {" "}
                    / <span className="font-semibold">{capacity}</span>
                    {" · "}Ελεύθερες θέσεις:{" "}
                    <span className="font-semibold">
                      {remainingSlots ?? 0}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* QR icon button */}
            <button
              disabled={!checkinToken}
              onClick={() => setQrOpen(true)}
              className="rounded px-2 py-1 hover:bg-white/5 disabled:opacity-40"
              title="QR check-in"
            >
              <QrCode className="w-7 h-6" />
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className="rounded px-2 py-1 hover:bg-white/5"
            >
              ✕
            </button>
          </div>
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
      <SessionQrModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        tenantId={tenantId}
        sessionId={sessionId}
        sessionTitle={sessionTitle}
        token={checkinToken}
      />


    </div>
  );
}
