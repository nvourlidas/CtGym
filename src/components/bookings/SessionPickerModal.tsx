import { useEffect, useMemo, useState } from 'react';

export type SessionRow = {
    id: string;
    starts_at: string;
    ends_at: string | null;
    capacity: number | null;
    classes?: {
        id: string;
        title: string;
        class_categories?: {
            name: string;
            color: string | null;
        } | null;
    } | null;
};

function formatDateTime(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const pad = (n: number) => n.toString().padStart(2, '0');
    const dd = pad(d.getDate());
    const mm = pad(d.getMonth() + 1);
    const yyyy = d.getFullYear();
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
}

export default function SessionPickerModal({
    title,
    sessions,
    selectedSessionId,
    initialSearch,
    initialDate,
    onClose,
    onPick,
    onChangeFilters,
}: {
    title: string;
    sessions: SessionRow[];
    selectedSessionId: string;
    initialSearch: string;
    initialDate: string; // yyyy-mm-dd
    onClose: () => void;
    onPick: (s: SessionRow) => void;
    onChangeFilters: (v: { search: string; date: string }) => void;
}) {
    const [search, setSearch] = useState(initialSearch ?? '');
    const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
    const [date, setDate] = useState<string>(() => (initialDate ? initialDate : todayIso));

    const [category, setCategory] = useState<string>('');
    const [classId, setClassId] = useState<string>('');
    const [onlyFuture, setOnlyFuture] = useState(true);

    useEffect(() => {
        onChangeFilters({ search, date });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, date]);

    const classOptions = useMemo(() => {
        const map = new Map<string, string>();
        sessions.forEach((s) => {
            const c = s.classes;
            if (c?.id && c.title) map.set(c.id, c.title);
        });
        return Array.from(map.entries())
            .map(([id, title]) => ({ id, title }))
            .sort((a, b) => a.title.localeCompare(b.title));
    }, [sessions]);

    const categoryOptions = useMemo(() => {
        const map = new Map<string, { name: string; color: string | null }>();
        sessions.forEach((s) => {
            const cat = s.classes?.class_categories;
            if (cat?.name) map.set(cat.name, { name: cat.name, color: cat.color ?? null });
        });
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [sessions]);

    const filteredSessions = useMemo(() => {
        const needle = (search ?? '').toLowerCase().trim();
        const now = Date.now();

        return sessions.filter((s) => {
            const title = (s.classes?.title ?? '').toLowerCase();
            const catName = (s.classes?.class_categories?.name ?? '').toLowerCase();
            const dateLabel = formatDateTime(s.starts_at).toLowerCase();

            const matchesText =
                !needle ||
                title.includes(needle) ||
                dateLabel.includes(needle) ||
                catName.includes(needle);

            if (!matchesText) return false;

            if (date) {
                const d = new Date(s.starts_at);
                if (Number.isNaN(d.getTime())) return false;
                const iso = d.toISOString().slice(0, 10);
                if (iso !== date) return false;
            }

            if (classId && s.classes?.id !== classId) return false;

            if (category && (s.classes?.class_categories?.name ?? '') !== category) return false;

            if (onlyFuture) {
                const d = new Date(s.starts_at);
                if (Number.isNaN(d.getTime())) return false;
                if (d.getTime() < now) return false;
            }

            return true;
        });
    }, [sessions, search, date, classId, category, onlyFuture]);

    // const label = (s: SessionRow) => {
    //     const base = `${s.classes?.title ?? '—'} · ${formatDateTime(s.starts_at)}`;
    //     const cat = s.classes?.class_categories?.name ? ` · ${s.classes.class_categories.name}` : '';
    //     const cap = s.capacity != null ? ` (cap ${s.capacity})` : '';
    //     return base + cat + cap;
    // };

    return (
        <div
            className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4"
            onMouseDown={(e) => {
                // close ONLY if the user clicked the backdrop, not inside the modal
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="w-full max-w-2xl rounded-md border border-border/10 bg-secondary-background text-text-primary shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
                    <div className="font-semibold">{title}</div>

                    <button
                        type="button"
                        className="rounded px-2 py-1 hover:bg-white/5"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onClose();
                        }}
                    >
                        ✕
                    </button>

                </div>

                <div className="p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                            className="input h-10! text-sm!"
                            placeholder="Αναζήτηση (τμήμα, κατηγορία, ώρα)..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />

                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                className="input h-10! text-sm! flex-1"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                            />
                            {date && (
                                <button
                                    type="button"
                                    className="px-2 py-2 rounded border border-border/20 hover:bg-white/5 text-xs"
                                    onClick={() => setDate('')}
                                >
                                    Καθαρ.
                                </button>
                            )}
                            <button
                                type="button"
                                className="px-2 py-2 rounded border border-border/20 hover:bg-white/5 text-xs"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDate(todayIso);
                                }}
                            >
                                Σήμερα
                            </button>
                        </div>

                        <select
                            className="input h-10! text-sm!"
                            value={classId}
                            onChange={(e) => setClassId(e.target.value)}
                        >
                            <option value="">Όλα τα τμήματα</option>
                            {classOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.title}
                                </option>
                            ))}
                        </select>

                        <select
                            className="input h-10! text-sm!"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                        >
                            <option value="">Όλες οι κατηγορίες</option>
                            {categoryOptions.map((c) => (
                                <option key={c.name} value={c.name}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-text-secondary select-none">
                        <input
                            type="checkbox"
                            checked={onlyFuture}
                            onChange={(e) => setOnlyFuture(e.target.checked)}
                        />
                        Εμφάνιση μόνο μελλοντικών συνεδριών
                    </label>

                    <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border/10 p-3">
                        {filteredSessions.length === 0 && (
                            <div className="px-1 py-2 text-sm text-text-secondary">
                                Δεν βρέθηκαν συνεδρίες με αυτά τα φίλτρα.
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {filteredSessions.map((s) => {
                                const active = s.id === selectedSessionId;

                                const title = s.classes?.title ?? '—';
                                const start = formatDateTime(s.starts_at);
                                const end = s.ends_at ? formatDateTime(s.ends_at) : null;

                                const catName = s.classes?.class_categories?.name ?? null;
                                const catColor = s.classes?.class_categories?.color ?? null;

                                const cap = s.capacity != null ? s.capacity : null;

                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        className={
                                            'text-left rounded-lg border p-3 transition ' +
                                            (active
                                                ? 'border-primary/60 bg-primary/10'
                                                : 'border-border/10 bg-secondary-background/60 hover:bg-white/5')
                                        }
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onPick(s);
                                        }}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="font-semibold text-sm leading-snug line-clamp-2">
                                                {title}
                                            </div>

                                            {catColor && (
                                                <span
                                                    className="shrink-0 h-2.5 w-2.5 rounded-full border border-border/20 mt-1"
                                                    style={{ backgroundColor: catColor }}
                                                />
                                            )}
                                        </div>

                                        <div className="mt-2 text-xs text-text-secondary">
                                            <div>{start}</div>
                                            {end && <div className="mt-0.5">Λήξη: {end}</div>}
                                        </div>

                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            {catName ? (
                                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border border-border/20 bg-white/5">
                                                    {catName}
                                                </span>
                                            ) : (
                                                <span className="text-[11px] text-text-secondary">
                                                    Χωρίς κατηγορία
                                                </span>
                                            )}

                                            {cap != null && (
                                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border border-border/20 bg-white/5">
                                                    cap {cap}
                                                </span>
                                            )}

                                            {active && (
                                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border border-primary/40 bg-primary/10 text-primary">
                                                    Επιλεγμένο
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            className="btn-secondary"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onClose();
                            }}
                        >
                            Επιλογή
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
