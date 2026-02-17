// src/pages/OpeningHoursPage.tsx

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth";

import OpeningHoursTab from "../../components/OpeningHours/OpeningHoursTab";
import HolidaysTab from "../../components/OpeningHours/HolidaysTab";
import ClosuresTab from "../../components/OpeningHours/ClosuresTab";

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type Slot = { start: string; end: string };
export type DaySchedule = { open: boolean; slots: Slot[] };
export type WeekSchedule = Record<DayKey, DaySchedule>;

type TenantRow = {
    name: string;
};

type TabKey = "hours" | "holidays" | "closures";

function defaultWeek(): WeekSchedule {
    return {
        mon: { open: true, slots: [{ start: "09:00", end: "21:00" }] },
        tue: { open: true, slots: [{ start: "09:00", end: "21:00" }] },
        wed: { open: true, slots: [{ start: "09:00", end: "21:00" }] },
        thu: { open: true, slots: [{ start: "09:00", end: "21:00" }] },
        fri: { open: true, slots: [{ start: "09:00", end: "21:00" }] },
        sat: { open: true, slots: [{ start: "10:00", end: "18:00" }] },
        sun: { open: false, slots: [] },
    };
}


function TabButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "relative px-3 py-2 rounded-lg text-sm font-medium transition",
                "focus:outline-none focus:ring-2 focus:ring-primary/30",
                active
                    ? "bg-primary border border-white/15 text-white shadow-sm"
                    : "text-text-secondary hover:text-text-primary hover:bg-black/10 border border-transparent",
            ].join(" ")}
        >
            {children}
        </button>
    );
}


export default function OpeningHoursPage() {
    const { profile } = useAuth() as any;
    const tenantId = profile?.tenant_id ?? null;
    const [tenant, setTenant] = useState<TenantRow | null>(null);

    const [activeTab, setActiveTab] = useState<TabKey>("hours");

    const [week, setWeek] = useState<WeekSchedule>(defaultWeek());
    const [exceptions, setExceptions] = useState<any[]>([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const canEdit = useMemo(() => {
        const role = (profile?.role ?? "").toLowerCase();
        return ["admin", "owner", "super_admin"].includes(role);
    }, [profile?.role]);

    useEffect(() => {
        async function load() {
            if (!tenantId) return;

            const { data } = await supabase
                .from("tenant_opening_hours")
                .select("*")
                .eq("tenant_id", tenantId)
                .maybeSingle();

            if (data) {
                setWeek(data.week ?? defaultWeek());
                setExceptions(data.exceptions ?? []);
            }

            setLoading(false);
        }

        load();
    }, [tenantId]);

    useEffect(() => {
        (async () => {
            if (!profile?.tenant_id) {
                setTenant(null);
                return;
            }

            const { data, error } = await supabase
                .from('tenants')
                .select('name')
                .eq('id', profile.tenant_id)
                .maybeSingle();

            if (error) {
                console.error('Failed to load tenant:', error);
                setTenant(null);
            } else {
                setTenant(data as TenantRow | null);
            }
        })();
    }, [profile?.tenant_id]);

    async function handleSave() {
        if (!tenantId) return;

        setSaving(true);
        setError(null);
        setSuccess(null);

        const { error } = await supabase
            .from("tenant_opening_hours")
            .upsert(
                {
                    tenant_id: tenantId,
                    timezone: "Europe/Athens",
                    week,
                    exceptions,
                },
                { onConflict: "tenant_id" }
            );

        setSaving(false);

        if (error) {
            setError(error.message);
            return;
        }

        setSuccess("Αποθηκεύτηκε επιτυχώς.");
    }

    if (loading) return <div className="p-6">Φόρτωση...</div>;

    const tenantNameFromProfile = tenant?.name ?? 'Cloudtec Gym';

    return (
        <div className="p-6 space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-lg font-semibold">Ωράριο & Ημερολόγιο</h1>

                <button
                    onClick={handleSave}
                    disabled={!canEdit || saving}
                    className="px-4 py-2 rounded-lg bg-primary text-white"
                >
                    {saving ? "Αποθήκευση..." : "Αποθήκευση"}
                </button>
            </div>

            {/* Tabs */}
            <div className="rounded-xl border border-border/10 bg-secondary-background p-2">
                <div className="flex flex-wrap gap-2">
                    <TabButton active={activeTab === "hours"} onClick={() => setActiveTab("hours")}>
                        Ωράριο
                    </TabButton>
                    <TabButton active={activeTab === "holidays"} onClick={() => setActiveTab("holidays")}>
                        Αργίες
                    </TabButton>
                    <TabButton active={activeTab === "closures"} onClick={() => setActiveTab("closures")}>
                        Έκτακτα κλειστό
                    </TabButton>
                </div>
            </div>


            {error && <div className="text-danger">{error}</div>}
            {success && <div className="text-emerald-400">{success}</div>}

            <div className="rounded-xl border border-border/10 bg-secondary-background p-4">
                {activeTab === "hours" && (
                    <OpeningHoursTab week={week} setWeek={setWeek} canEdit={canEdit} />
                )}

                {activeTab === "holidays" && (
                    <HolidaysTab tenantId={tenantId} exceptions={exceptions} setExceptions={setExceptions} canEdit={canEdit} tenant_name={tenantNameFromProfile}/>
                )}

                {activeTab === "closures" && (
                    <ClosuresTab tenantId={tenantId} exceptions={exceptions} setExceptions={setExceptions} canEdit={canEdit} tenant_name={tenantNameFromProfile}/>
                )}
            </div>

        </div>
    );
}
