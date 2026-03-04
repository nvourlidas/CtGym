// src/pages/OpeningHoursPage.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth";
import {
  Clock, CalendarDays, CalendarX2, Save, Loader2,
  CheckCircle2, AlertTriangle, X,
} from "lucide-react";

import OpeningHoursTab from "../../components/OpeningHours/OpeningHoursTab";
import HolidaysTab from "../../components/OpeningHours/HolidaysTab";
import ClosuresTab from "../../components/OpeningHours/ClosuresTab";

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type Slot = { start: string; end: string };
export type DaySchedule = { open: boolean; slots: Slot[] };
export type WeekSchedule = Record<DayKey, DaySchedule>;

type TenantRow = { name: string };
type TabKey = "hours" | "holidays" | "closures";

function defaultWeek(): WeekSchedule {
  return {
    mon: { open: true,  slots: [{ start: "09:00", end: "21:00" }] },
    tue: { open: true,  slots: [{ start: "09:00", end: "21:00" }] },
    wed: { open: true,  slots: [{ start: "09:00", end: "21:00" }] },
    thu: { open: true,  slots: [{ start: "09:00", end: "21:00" }] },
    fri: { open: true,  slots: [{ start: "09:00", end: "21:00" }] },
    sat: { open: true,  slots: [{ start: "10:00", end: "18:00" }] },
    sun: { open: false, slots: [] },
  };
}

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "hours",    label: "Ωράριο",          icon: Clock         },
  { key: "holidays", label: "Αργίες",           icon: CalendarDays  },
  { key: "closures", label: "Έκτακτα κλειστό", icon: CalendarX2    },
];

export default function OpeningHoursPage() {
  const { profile } = useAuth() as any;
  const tenantId = profile?.tenant_id ?? null;

  const [tenant, setTenant]         = useState<TenantRow | null>(null);
  const [activeTab, setActiveTab]   = useState<TabKey>("hours");
  const [week, setWeek]             = useState<WeekSchedule>(defaultWeek());
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);

  const canEdit = useMemo(() => {
    const role = (profile?.role ?? "").toLowerCase();
    return ["admin", "owner", "super_admin"].includes(role);
  }, [profile?.role]);

  useEffect(() => {
    async function load() {
      if (!tenantId) return;
      const { data } = await supabase
        .from("tenant_opening_hours").select("*")
        .eq("tenant_id", tenantId).maybeSingle();
      if (data) { setWeek(data.week ?? defaultWeek()); setExceptions(data.exceptions ?? []); }
      setLoading(false);
    }
    load();
  }, [tenantId]);

  useEffect(() => {
    (async () => {
      if (!profile?.tenant_id) { setTenant(null); return; }
      const { data, error } = await supabase.from("tenants").select("name").eq("id", profile.tenant_id).maybeSingle();
      if (error) { console.error("Failed to load tenant:", error); setTenant(null); }
      else setTenant(data as TenantRow | null);
    })();
  }, [profile?.tenant_id]);

  async function handleSave() {
    if (!tenantId) return;
    setSaving(true); setError(null); setSuccess(null);
    const { error } = await supabase.from("tenant_opening_hours").upsert(
      { tenant_id: tenantId, timezone: "Europe/Athens", week, exceptions },
      { onConflict: "tenant_id" }
    );
    setSaving(false);
    if (error) { setError(error.message); return; }
    setSuccess("Αποθηκεύτηκε επιτυχώς.");
    setTimeout(() => setSuccess(null), 4000);
  }

  const tenantName = tenant?.name ?? "Cloudtec Gym";

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-16 text-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Φόρτωση…</span>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-black text-text-primary tracking-tight">Ωράριο & Ημερολόγιο</h1>
            <p className="text-xs text-text-secondary mt-px">Διαχείριση ωραρίου, αργιών και έκτακτων κλεισιμάτων.</p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!canEdit || saving}
          className="group relative inline-flex items-center gap-1.5 h-9 px-5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px disabled:opacity-50 disabled:translate-y-0 transition-all cursor-pointer overflow-hidden"
        >
          <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          {saving
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /><span className="relative z-10">Αποθήκευση…</span></>
            : <><Save    className="h-3.5 w-3.5 relative z-10" /><span className="relative z-10">Αποθήκευση</span></>
          }
        </button>
      </div>

      {/* ── Feedback banners ── */}
      {error && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
          <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>
          <button onClick={() => setError(null)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-success/25 bg-success/8 text-success text-sm">
          <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" />{success}</div>
          <button onClick={() => setSuccess(null)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 p-1 rounded-xl border border-border/15 bg-secondary-background w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={[
              "inline-flex items-center gap-1.5 h-8 px-4 rounded-lg text-sm font-semibold transition-all cursor-pointer",
              activeTab === key
                ? "bg-primary text-white shadow-sm shadow-primary/30"
                : "text-text-secondary hover:text-text-primary hover:bg-secondary/30",
            ].join(" ")}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
        {/* Content header strip */}
        <div className="px-5 py-4 border-b border-border/10 flex items-center gap-2">
          {(() => {
            const tab = TABS.find((t) => t.key === activeTab)!;
            const Icon = tab.icon;
            return (
              <>
                <Icon className="h-3.5 w-3.5 text-text-secondary" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">{tab.label}</span>
              </>
            );
          })()}
        </div>

        <div className="p-5">
          {activeTab === "hours" && (
            <OpeningHoursTab week={week} setWeek={setWeek} canEdit={canEdit} />
          )}
          {activeTab === "holidays" && (
            <HolidaysTab tenantId={tenantId} exceptions={exceptions} setExceptions={setExceptions} canEdit={canEdit} tenant_name={tenantName} />
          )}
          {activeTab === "closures" && (
            <ClosuresTab tenantId={tenantId} exceptions={exceptions} setExceptions={setExceptions} canEdit={canEdit} tenant_name={tenantName} />
          )}
        </div>
      </div>
    </div>
  );
}