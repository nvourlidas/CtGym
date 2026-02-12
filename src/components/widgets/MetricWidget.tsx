import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase"; // ← adjust path if needed
import {
  Activity,
  Users,
  Grid3X3,
  BarChart3,
  PieChart,
  Package,
  FileText,
  Euro,
  Eye,
  EyeOff,
  type LucideIcon,
} from "lucide-react";

/* ---- Fixed presets (icon + color) ------------------------------------ */
type Variant =
  | "members"
  | "sessions"
  | "bookings"
  | "memberships"
  | "classes"
  | "revenue"
  | "activity"
  | "files"
  | "inventory";

const VARIANT_ICON: Record<Variant, LucideIcon> = {
  members: Users,
  sessions: Grid3X3,
  bookings: BarChart3,
  memberships: PieChart,
  classes: Grid3X3,
  revenue: Euro,
  activity: Activity,
  files: FileText,
  inventory: Package,
};

const VARIANT_COLOR: Record<Variant, string> = {
  members: "#3b82f6", // blue
  sessions: "#22c55e", // green
  bookings: "#f59e0b", // amber
  memberships: "#8b5cf6", // violet
  classes: "#14b8a6", // teal
  revenue: "#22c55e", // green (comment said red before)
  activity: "#64748b", // slate
  files: "#0ea5e9", // sky
  inventory: "#f97316", // orange
};

function hexToRgba(hex: string, alpha = 0.12) {
  const m = hex.replace("#", "");
  const bigint = parseInt(
    m.length === 3 ? m.split("").map((c) => c + c).join("") : m,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function utcMidnightISO(d: Date) {
  return new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0),
  ).toISOString();
}

/* ---- Query helpers (compatible with your previous widget) ------------- */
function parsePayload(
  query: string,
):
  | { source?: string; date_field?: string; range?: string; kind?: string; status?: string }
  | null {
  try {
    const obj = JSON.parse(query);
    return typeof obj === "object" && obj ? (obj as any) : null;
  } catch {
    return null;
  }
}

function computeRange(range?: string): { start: string | null; end: string | null } {
  const now = new Date();
  const startOf = (d: Date, unit: "day" | "month" | "year") => {
    const x = new Date(d);
    if (unit === "day") x.setHours(0, 0, 0, 0);
    if (unit === "month") {
      x.setDate(1);
      x.setHours(0, 0, 0, 0);
    }
    if (unit === "year") {
      x.setMonth(0, 1);
      x.setHours(0, 0, 0, 0);
    }
    return x;
  };
  const add = (d: Date, spec: { days?: number; months?: number; years?: number }) => {
    const x = new Date(d);
    if (spec.years) x.setFullYear(x.getFullYear() + spec.years);
    if (spec.months) x.setMonth(x.getMonth() + spec.months);
    if (spec.days) x.setDate(x.getDate() + spec.days);
    return x;
  };
  switch (range) {
    case "today": {
      const s = startOf(now, "day");
      return { start: s.toISOString(), end: add(s, { days: 1 }).toISOString() };
    }
    case "yesterday": {
      const e = startOf(now, "day");
      return { start: add(e, { days: -1 }).toISOString(), end: e.toISOString() };
    }
    case "last_7_days":
      return { start: add(now, { days: -7 }).toISOString(), end: now.toISOString() };
    case "last_30_days":
      return { start: add(now, { days: -30 }).toISOString(), end: now.toISOString() };
    case "this_month": {
      const s = startOf(now, "month");
      return { start: s.toISOString(), end: add(s, { months: 1 }).toISOString() };
    }
    case "last_month": {
      const e = startOf(now, "month");
      return { start: add(e, { months: -1 }).toISOString(), end: e.toISOString() };
    }
    case "this_year": {
      const s = startOf(now, "year");
      return { start: s.toISOString(), end: add(s, { years: 1 }).toISOString() };
    }
    case "last_year": {
      const e = startOf(now, "year");
      return { start: add(e, { years: -1 }).toISOString(), end: e.toISOString() };
    }
    default:
      return { start: null, end: null };
  }
}

/* ---- Component --------------------------------------------------------- */
type Props = {
  id?: string;
  title: string;
  variant: Variant;
  /** Either builder JSON payload or raw SQL (handled via RPC in your env) */
  query: string;
  tenantId: string;
};

export default function MetricWidget({id, title, variant, query, tenantId }: Props) {
  const payload = useMemo(() => parsePayload(query), [query]);
  const isRawSQL = !payload;

  const source = payload?.source || "";
  const [schemaName, tableName] = useMemo(() => {
    const [s, t] = (source || "").split(".");
    return [s || "", t || ""];
  }, [source]);
  const dateField = useMemo(
    () => (payload?.date_field || "").replace(/^s\./, ""),
    [payload?.date_field],
  );
  const { start, end } = useMemo(
    () => computeRange(payload?.range),
    [payload?.range],
  );

  const color = VARIANT_COLOR[variant];
  const IconCmp = VARIANT_ICON[variant] || Activity;


const widgetKey = useMemo(() => {
  // prefer explicit id if you have it
  const base = id?.trim() || `${variant}:${title}`; // fallback
  // make it safe for localStorage key
  return base.replace(/\s+/g, "_").toLowerCase();
}, [id, variant, title]);

const REVENUE_VIS_KEY = useMemo(
  () => `ctgym:metric:show:${widgetKey}`,
  [widgetKey],
);

const [showValue, setShowValue] = useState<boolean>(() => {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(REVENUE_VIS_KEY);
  if (raw === "0") return false;
  if (raw === "1") return true;
  return true;
});


useEffect(() => {
  if (variant !== "revenue") return;
  window.localStorage.setItem(REVENUE_VIS_KEY, showValue ? "1" : "0");
}, [variant, showValue, REVENUE_VIS_KEY]);





  const [value, setValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        /* ⭐ SPECIAL CASE: TOTAL MEMBERS (no date filter)
           - counts all profiles with tenant_id = tenantId
           - role = 'member'
        */
        if (variant === "members") {
          const { count, error } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("role", "member");

          if (error) throw error;
          setValue(count ?? 0);
          return;
        }

        // ⭐ NEW: active memberships (no date filter)
        if (payload?.kind === "active_memberships") {
          const { count, error } = await supabase
            .from("memberships")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("status", "active");

          if (error) throw error;
          setValue(count ?? 0);
          return;
        }

        // ⭐ Unified: status_today (checked_in | canceled | no_show)
        if (payload?.kind === "status_today" && payload.status) {
          const status = String(payload.status).toLowerCase(); // "checked_in" | "canceled" | "no_show"
          const now = new Date();
          const fromISO = utcMidnightISO(now);
          const toISO = utcMidnightISO(
            new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
          );

          const { data, error } = await supabase
            .from("bookings")
            .select("id, status, class_sessions!inner(starts_at)")
            .eq("status", status)
            .gte("class_sessions.starts_at", fromISO)
            .lt("class_sessions.starts_at", toISO);

          if (error) throw error;
          setValue((data ?? []).length);
          return;
        }

        // ---- REVENUE: cash today (or generic range) ----
        if (
          payload?.kind === "revenue_cash_today" ||
          payload?.kind === "revenue_cash_range"
        ) {
          let startISO: string;
          let endISO: string;

          if (payload.kind === "revenue_cash_today") {
            const now = new Date();
            startISO = utcMidnightISO(now);
            endISO = utcMidnightISO(
              new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
            );
          } else {
            const r = computeRange(payload.range || "this_month");
            startISO = r.start!;
            endISO = r.end!;
          }

          const { data, error } = await supabase.rpc("time_series_revenue_cash", {
            p_tenant_id: tenantId,
            p_start_at: startISO,
            p_end_at: endISO,
            p_granularity: "day",
          });

          if (error) throw error;
          const total =
            (data as any[] | null)?.reduce(
              (s, r) => s + Number(r.amount || 0),
              0,
            ) ?? 0;
          setValue(total);
          return;
        }

        // ---- REVENUE: MRR / ARR ----
        if (payload?.kind === "mrr" || payload?.kind === "arr") {
          const fn = payload.kind === "mrr" ? "mrr_for_tenant" : "arr_for_tenant";
          const { data, error } = await supabase.rpc(fn, {
            p_tenant_id: tenantId,
          });
          if (error) throw error;
          setValue(Number(data ?? 0));
          return;
        }

        // ---- existing raw SQL / time_series_count logic ----
        if (isRawSQL) {
          const { data, error } = await (supabase.rpc as any)(
            "execute_metric_query",
            { p_query: query },
          );
          if (error) throw error;
          setValue(Number(data?.[0]?.value ?? 0));
        } else {
          if (!schemaName || !tableName || !dateField) {
            setValue(null);
            return;
          }
          const { data, error } = await supabase.rpc("time_series_count", {
            p_schema: schemaName,
            p_table: tableName,
            p_date_field: dateField,
            p_granularity: "day",
            p_start_at: start,
            p_end_at: end,
          });
          if (error) throw error;
          const total =
            (data as any[] | null)?.reduce(
              (acc, r) => acc + (Number(r.value) || 0),
              0,
            ) ?? 0;
          setValue(total);
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load metric");
      } finally {
        setLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isRawSQL, schemaName, tableName, dateField, start, end, tenantId, variant]);

  return (
    <div
      className="flex items-center justify-between rounded-xl p-4"
      style={{
        backgroundColor: hexToRgba(color, 0.12),
        borderLeft: `4px solid ${color}`,
      }}
    >
      {/* LEFT SIDE */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: hexToRgba(color, 0.18), color }}
        >
          <IconCmp className="h-5 w-5" />
        </div>

        <div>
          <div
            className={`text-2xl font-semibold leading-none transition ${variant === "revenue" && !showValue
              ? "blur-sm select-none"
              : ""
              }`}
          >
            {loading ? "…" : value ?? "--"}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{title}</p>
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="flex items-center gap-3">
        {variant === "revenue" && (
          <button
            type="button"
            onClick={() => setShowValue((prev) => !prev)}
            className="text-muted-foreground hover:text-foreground transition"
          >
            {showValue ? (
              <Eye className="h-5 w-5" />
            ) : (
              <EyeOff className="h-5 w-5" />
            )}
          </button>
        )}

        {error && (
          <span className="text-xs text-red-500">{error}</span>
        )}
      </div>
    </div>
  );

}
