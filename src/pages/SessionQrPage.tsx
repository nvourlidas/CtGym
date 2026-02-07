import { useEffect, useMemo, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "../lib/supabase";

type SessionRow = {
    id: string;
    tenant_id: string;
    class_id: string;
    starts_at: string;
    ends_at: string;
    checkin_token: string | null;
    classes?: { title: string | null }[] | null;
};

function fmtTimeEL(iso?: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateEL(iso?: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    // e.g. "Σάββατο 7 Φεβρουαρίου"
    return d.toLocaleDateString("el-GR", {
        weekday: "long",
        day: "numeric",
        month: "long",
    });
}

function isNowBetween(startsAt: string, endsAt: string) {
    const now = Date.now();
    return now >= new Date(startsAt).getTime() && now <= new Date(endsAt).getTime();
}

function startOfTodayISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

function startOfTomorrowISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    return d.toISOString();
}

export default function SessionQrPage() {
    const [tenantId, setTenantId] = useState<string | null>(null);

    const [sessions, setSessions] = useState<SessionRow[]>([]);
    const [index, setIndex] = useState(0);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ✅ Load tenantId (replace with your AuthProvider if you already have profile.tenant_id)
    useEffect(() => {
        let cancelled = false;

        async function loadTenant() {
            const { data: auth } = await supabase.auth.getUser();
            const userId = auth?.user?.id;

            if (!userId) {
                if (!cancelled) {
                    setTenantId(null);
                    setLoading(false);
                }
                return;
            }

            const { data, error } = await supabase
                .from("profiles")
                .select("tenant_id")
                .eq("id", userId)
                .single();

            if (!cancelled) {
                if (error) {
                    setError("Δεν βρέθηκε tenant.");
                    setLoading(false);
                    return;
                }
                setTenantId(data?.tenant_id ?? null);
            }
        }

        loadTenant();
        return () => {
            cancelled = true;
        };
    }, []);

    async function loadTodaySessions(currentTenantId: string) {
        setLoading(true);
        setError(null);

        try {
            const from = startOfTodayISO();
            const to = startOfTomorrowISO();

            // 1) Get today's sessions
            const { data: sessData, error: sessErr } = await supabase
                .from("class_sessions")
                .select("id, tenant_id, class_id, starts_at, ends_at, checkin_token")
                .eq("tenant_id", currentTenantId)
                .gte("starts_at", from)
                .lt("starts_at", to)
                .order("starts_at", { ascending: true });

            if (sessErr) throw new Error(sessErr.message);

            const baseRows = (sessData ?? []) as Omit<SessionRow, "classes">[];

            // 2) Fetch class titles for those class_ids
            const classIds = Array.from(new Set(baseRows.map((r) => r.class_id))).filter(Boolean);

            let titleMap = new Map<string, string | null>();

            if (classIds.length > 0) {
                const { data: classData, error: classErr } = await supabase
                    .from("classes")
                    .select("id, title")
                    .eq("tenant_id", currentTenantId)
                    .in("id", classIds);

                if (classErr) throw new Error(classErr.message);

                (classData ?? []).forEach((c: any) => {
                    titleMap.set(c.id, c.title ?? null);
                });
            }

            // 3) Merge into the shape your UI expects
            const rows: SessionRow[] = baseRows.map((r) => ({
                ...r,
                classes: [{ title: titleMap.get(r.class_id) ?? null }],
            }));

            setSessions(rows);

            // Auto index
            const activeIdx = rows.findIndex(
                (s) => !!s.checkin_token && isNowBetween(s.starts_at, s.ends_at)
            );

            const upcomingIdx = rows.findIndex(
                (s) => !!s.checkin_token && new Date(s.starts_at).getTime() > Date.now()
            );

            const chosen = activeIdx >= 0 ? activeIdx : upcomingIdx >= 0 ? upcomingIdx : 0;
            setIndex(Math.max(0, Math.min(chosen, Math.max(0, rows.length - 1))));

            setLoading(false);
        } catch (e: any) {
            setError(e?.message || "Κάτι πήγε στραβά.");
            setLoading(false);
        }
    }


    useEffect(() => {
        if (!tenantId) return;
        loadTodaySessions(tenantId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId]);

    const selected = useMemo(() => sessions[index] ?? null, [sessions, index]);

    const classTitle = selected?.classes?.[0]?.title ?? null;
    const isActiveNow = selected ? isNowBetween(selected.starts_at, selected.ends_at) : false;

    const qrValue = useMemo(() => {
        if (!selected || !tenantId || !selected.checkin_token) return null;

        // ✅ Same payload as your modal
        return JSON.stringify({
            type: "session_checkin",
            tenantId,
            sessionId: selected.id,
            token: selected.checkin_token,
        });
    }, [selected, tenantId]);

    const canPrev = index > 0;
    const canNext = index < sessions.length - 1;

    const headerDate = selected?.starts_at
        ? fmtDateEL(selected.starts_at)
        : fmtDateEL(new Date().toISOString());

    return (
        <div className="min-h-[100dvh] bg-primary-background text-white flex flex-col">
            {/* Top bar */}
            <div className="sticky top-0 z-10 bg-primary-background/80 backdrop-blur border-b border-white/10">
                <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm opacity-70">Σήμερα</div>
                        <div className="text-base font-semibold">QR Check-in</div>
                    </div>

                    <button
                        onClick={() => tenantId && loadTodaySessions(tenantId)}
                        className="rounded-lg px-3 py-2 text-sm bg-white/10 hover:bg-white/15 border border-white/10"
                    >
                        Ανανέωση
                    </button>
                </div>
            </div>

            <div className="w-full flex-1 px-4 py-5">
                <div className="max-w-md mx-auto space-y-4">
                    {/* Navigation */}
                    <div className="bg-secondary-background border border-white/10 rounded-2xl p-4">
                        {loading ? (
                            <div className="text-sm opacity-70 py-2">Φόρτωση σημερινών sessions…</div>
                        ) : error ? (
                            <div className="text-sm text-red-300 py-2">{error}</div>
                        ) : sessions.length === 0 ? (
                            <div className="text-sm opacity-70 py-2">Δεν υπάρχουν sessions για σήμερα.</div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-sm font-semibold">{headerDate}</div>

                                    {isActiveNow && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-200">
                                            Ενεργό τώρα
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <button
                                        onClick={() => setIndex((i) => Math.max(0, i - 1))}
                                        disabled={!canPrev}
                                        className={[
                                            "flex-1 rounded-xl px-3 py-3 text-sm border",
                                            canPrev
                                                ? "bg-white/10 hover:bg-white/15 border-white/10"
                                                : "bg-white/5 border-white/5 opacity-50 cursor-not-allowed",
                                        ].join(" ")}
                                    >
                                        Προηγούμενο
                                    </button>

                                    <div className="text-xs opacity-70 px-2">
                                        {index + 1}/{sessions.length}
                                    </div>

                                    <button
                                        onClick={() => setIndex((i) => Math.min(sessions.length - 1, i + 1))}
                                        disabled={!canNext}
                                        className={[
                                            "flex-1 rounded-xl px-3 py-3 text-sm border",
                                            canNext
                                                ? "bg-white/10 hover:bg-white/15 border-white/10"
                                                : "bg-white/5 border-white/5 opacity-50 cursor-not-allowed",
                                        ].join(" ")}
                                    >
                                        Επόμενο
                                    </button>
                                </div>

                                {selected && (
                                    <div className="mt-3 text-xs opacity-70">
                                        <span className="opacity-95 font-semibold">
                                            {classTitle || "Μάθημα"}
                                        </span>
                                        {" • "}
                                        {fmtTimeEL(selected.starts_at)}–{fmtTimeEL(selected.ends_at)}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* QR Card */}
                    <div className="bg-secondary-background border border-white/10 rounded-2xl shadow-xl p-5">
                        {!selected ? (
                            <div className="py-10 text-center text-sm opacity-70">
                                Δεν υπάρχει επιλεγμένο session.
                            </div>
                        ) : !selected.checkin_token ? (
                            <div className="py-10 text-center">
                                <div className="text-base font-semibold mb-1">Δεν υπάρχει token</div>
                                <div className="text-sm opacity-70">
                                    Αυτό το session δεν έχει check-in token.
                                </div>
                            </div>
                        ) : (
                            <>
                                <h1 className="text-lg font-semibold mb-1">
                                    {classTitle || "QR Check-in"}
                                </h1>
                                <div className="text-sm opacity-70 mb-4">
                                    {fmtTimeEL(selected.starts_at)} – {fmtTimeEL(selected.ends_at)}
                                </div>

                                <div className="flex justify-center mb-4">
                                    <div className="bg-white rounded-2xl p-4">
                                        <QRCodeCanvas value={qrValue!} size={300} includeMargin />
                                    </div>
                                </div>

                                <p className="text-xs opacity-70 text-center">
                                    Οι συμμετέχοντες σκανάρουν αυτό το QR από την εφαρμογή για να κάνουν check-in.
                                </p>
                            </>
                        )}
                    </div>

                    <div className="text-center text-xs opacity-50">
                        Tip: αν δεν σκανάρεται εύκολα, αύξησε τη φωτεινότητα οθόνης.
                    </div>
                </div>
            </div>
        </div>
    );
}
