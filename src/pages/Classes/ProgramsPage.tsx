import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';

type GymClass = { id: string; title: string };
type Rule = {
    id: string;
    tenant_id: string;
    class_id: string;
    weekday: number; // 0..6
    start_time: string; // HH:MM:SS
    end_time: string;   // HH:MM:SS
    capacity: number;
    starts_on: string;  // yyyy-mm-dd
    ends_on: string | null;
    repeat_every_weeks: number;
    timezone: string;
    is_active: boolean;
    created_at: string;
};
type ExceptionRow = {
    id: string;
    tenant_id: string;
    rule_id: string;
    on_date: string; // yyyy-mm-dd
    skip: boolean;
    override_start_time: string | null;
    override_end_time: string | null;
    override_capacity: number | null;
    note: string | null;
};

const WEEKDAYS = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
];

export default function ProgramsPage() {
    const { profile } = useAuth();
    const tenantId = profile?.tenant_id ?? null;

    const [loading, setLoading] = useState(true);
    const [rules, setRules] = useState<Rule[]>([]);
    const [classes, setClasses] = useState<GymClass[]>([]);
    const [q, setQ] = useState('');
    const [err, setErr] = useState<string | null>(null);

    const [showCreate, setShowCreate] = useState(false);
    const [editRow, setEditRow] = useState<Rule | null>(null);
    const [manageExceptionsFor, setManageExceptionsFor] = useState<Rule | null>(null);
    const [genFrom, setGenFrom] = useState<string>(() => new Date().toISOString().slice(0, 10));
    const [genTo, setGenTo] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() + 42); // 6 weeks
        return d.toISOString().slice(0, 10);
    });
    const [genBusy, setGenBusy] = useState(false);

    async function load() {
        if (!tenantId) return;
        setLoading(true);
        setErr(null);

        const [{ data: ruleData, error: rErr }, { data: classData, error: cErr }] = await Promise.all([
            supabase
                .from('class_schedule_rules')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false }),
            supabase
                .from('classes')
                .select('id, title')
                .eq('tenant_id', tenantId)
                .order('title'),
        ]);

        if (rErr || cErr) setErr(rErr?.message ?? cErr?.message ?? 'Failed to load');
        setRules((ruleData as Rule[]) ?? []);
        setClasses((classData as GymClass[]) ?? []);
        setLoading(false);
    }

    useEffect(() => { load(); }, [tenantId]);

    const filtered = useMemo(() => {
        if (!q) return rules;
        const needle = q.toLowerCase();
        return rules.filter(r => {
            const cls = classes.find(c => c.id === r.class_id)?.title ?? '';
            return cls.toLowerCase().includes(needle)
                || WEEKDAYS.find(w => w.value === r.weekday)?.label.toLowerCase().includes(needle)
                || (r.timezone ?? '').toLowerCase().includes(needle);
        });
    }, [q, rules, classes]);

    const classTitle = (id: string) => classes.find(c => c.id === id)?.title ?? '—';

    const generateRange = async () => {
        if (!tenantId) return;
        setGenBusy(true);
        const res = await supabase.functions.invoke('schedule-generate', {
            body: { tenant_id: tenantId, from: genFrom, to: genTo },
        });
        setGenBusy(false);
        if (res.error || (res.data as any)?.error) {
            alert(res.error?.message ?? (res.data as any)?.error ?? 'Generation failed');
            return;
        }
        alert(`Generated ${((res.data as any)?.created ?? 0)} sessions`);
    };

    return (
        <div className="p-6">
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <input
                    className="h-9 rounded-md border border-white/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
                    placeholder="Search by class/weekday/timezone…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
                <button
                    className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white"
                    onClick={() => setShowCreate(true)}
                >
                    New Rule
                </button>

                <div className="ml-auto flex items-center gap-2">
                    <input type="date" className="input !h-9" value={genFrom} onChange={e => setGenFrom(e.target.value)} />
                    <span className="opacity-60 text-sm">to</span>
                    <input type="date" className="input !h-9" value={genTo} onChange={e => setGenTo(e.target.value)} />
                    <button className="h-9 rounded-md px-3 text-sm border border-white/10 hover:bg-white/5"
                        onClick={generateRange} disabled={genBusy}>
                        {genBusy ? 'Generating…' : 'Generate Sessions'}
                    </button>
                </div>
            </div>

            {err && <div className="mb-3 text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">{err}</div>}

            <div className="rounded-md border border-white/10 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-secondary-background/60">
                        <tr className="text-left">
                            <Th>Class</Th>
                            <Th>Weekday</Th>
                            <Th>Time</Th>
                            <Th>Cap.</Th>
                            <Th>Every</Th>
                            <Th>Date Range</Th>
                            <Th>TZ</Th>
                            <Th>Active</Th>
                            <Th className="text-right pr-3">Actions</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td className="px-3 py-4 opacity-60" colSpan={9}>Loading…</td></tr>}
                        {!loading && filtered.length === 0 && (
                            <tr><td className="px-3 py-4 opacity-60" colSpan={9}>No rules</td></tr>
                        )}
                        {filtered.map(r => (
                            <tr key={r.id} className="border-t border-white/10 hover:bg-secondary/10">
                                <Td className="font-medium">{classTitle(r.class_id)}</Td>
                                <Td>{WEEKDAYS.find(w => w.value === r.weekday)?.label ?? r.weekday}</Td>
                                <Td>{fmtTime(r.start_time)}–{fmtTime(r.end_time)}</Td>
                                <Td>{r.capacity}</Td>
                                <Td>{r.repeat_every_weeks} wk</Td>
                                <Td>{r.starts_on} → {r.ends_on ?? '—'}</Td>
                                <Td>{r.timezone}</Td>
                                <Td>{r.is_active ? 'Yes' : 'No'}</Td>
                                <Td className="text-right">
                                    <button className="px-2 py-1 text-sm rounded hover:bg-secondary/10"
                                        onClick={() => setManageExceptionsFor(r)}>
                                        Exceptions
                                    </button>
                                    <button className="ml-2 px-2 py-1 text-sm rounded hover:bg-secondary/10"
                                        onClick={() => setEditRow(r)}>
                                        Edit
                                    </button>
                                    <DeleteRuleButton id={r.id} onDeleted={load} />
                                </Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showCreate && tenantId && (
                <RuleModal
                    mode="create"
                    tenantId={tenantId}
                    classes={classes}
                    onClose={() => { setShowCreate(false); load(); }}
                />
            )}
            {editRow && tenantId && (
                <RuleModal
                    mode="edit"
                    tenantId={tenantId}
                    classes={classes}
                    row={editRow}
                    onClose={() => { setEditRow(null); load(); }}
                />
            )}
            {manageExceptionsFor && (
                <ExceptionsModal
                    rule={manageExceptionsFor}
                    onClose={() => setManageExceptionsFor(null)}
                />
            )}
        </div>
    );
}

/* ---------- UI bits ---------- */
function Th({ children, className = '' }: any) {
    return <th className={`px-3 py-2 font-semibold ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: any) {
    return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
function fmtTime(t: string) {
    // t = "HH:MM:SS"
    return t?.slice(0, 5);
}

/* ---------- Delete button ---------- */
function DeleteRuleButton({ id, onDeleted }: { id: string; onDeleted: () => void }) {
    const [busy, setBusy] = useState(false);
    const onClick = async () => {
        if (!confirm('Delete this rule? This cannot be undone.')) return;
        setBusy(true);
        const { error } = await supabase.from('class_schedule_rules').delete().eq('id', id);
        setBusy(false);
        if (error) alert(error.message);
        else onDeleted();
    };
    return (
        <button className="ml-2 px-2 py-1 text-sm rounded text-danger hover:bg-danger/10 disabled:opacity-50"
            onClick={onClick} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete'}
        </button>
    );
}

/* ---------- Create / Edit Rule Modal ---------- */
function RuleModal({
    mode, tenantId, classes, row, onClose,
}: {
    mode: 'create' | 'edit';
    tenantId: string;
    classes: { id: string; title: string }[];
    row?: Rule;
    onClose: () => void;
}) {
    const [classId, setClassId] = useState<string>(row?.class_id ?? (classes[0]?.id ?? ''));
    // MULTI weekdays
    const [weekdays, setWeekdays] = useState<number[]>(
        row ? [row.weekday] : [1, 3] // default Mon/Wed if creating
    );

    const [startTime, setStartTime] = useState<string>(row?.start_time?.slice(0, 5) ?? '18:00');
    const [endTime, setEndTime] = useState<string>(row?.end_time?.slice(0, 5) ?? '19:00');
    const [capacity, setCapacity] = useState<number>(row?.capacity ?? 12);
    const [startsOn, setStartsOn] = useState<string>(row?.starts_on ?? new Date().toISOString().slice(0, 10));
    const [endsOn, setEndsOn] = useState<string>(row?.ends_on ?? '');
    const [repeatEvery, setRepeatEvery] = useState<number>(row?.repeat_every_weeks ?? 1);
    const [tz, setTz] = useState<string>(row?.timezone ?? 'Europe/Athens');
    const [active, setActive] = useState<boolean>(row?.is_active ?? true);
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (!tenantId || !classId || weekdays.length === 0) return;
        setBusy(true);

        const base = {
            tenant_id: tenantId,
            class_id: classId,
            start_time: startTime + ':00',
            end_time: endTime + ':00',
            capacity,
            starts_on: startsOn,
            ends_on: endsOn || null,
            repeat_every_weeks: repeatEvery,
            timezone: tz,
            is_active: active,
        };

        let error;

        if (mode === 'create') {
            // insert one row per weekday
            const payload = weekdays.map(w => ({ ...base, weekday: w }));
            ({ error } = await supabase.from('class_schedule_rules').insert(payload));
        } else {
            // EDIT MODE:
            // If the selection is exactly the same single weekday, do a normal update.
            if (weekdays.length === 1 && weekdays[0] === row!.weekday) {
                ({ error } = await supabase
                    .from('class_schedule_rules')
                    .update({ ...base, weekday: weekdays[0] })
                    .eq('id', row!.id));
            } else {
                // Replace: delete the old row, insert the new rows
                const del = await supabase.from('class_schedule_rules').delete().eq('id', row!.id);
                if (del.error) error = del.error;
                else {
                    const payload = weekdays.map(w => ({ ...base, weekday: w }));
                    const ins = await supabase.from('class_schedule_rules').insert(payload);
                    error = ins.error ?? null;
                }
            }
        }

        setBusy(false);
        if (error) { alert(error.message); return; }
        onClose();
    };

    return (
        <Modal onClose={onClose} title={mode === 'create' ? 'New Rule' : 'Edit Rule'}>
            <FormRow label="Class *">
                <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
            </FormRow>

            {/* Multi-weekday picker */}
            <FormRow label="Weekdays">
                <WeekdayMulti value={weekdays} onChange={setWeekdays} />
            </FormRow>

            <div className="grid grid-cols-2 gap-3">
                <FormRow label="Repeat every (weeks)">
                    <input className="input" type="number" min={1} value={repeatEvery}
                        onChange={e => setRepeatEvery(Number(e.target.value))} />
                </FormRow>
                <FormRow label="Timezone">
                    <input className="input" value={tz} onChange={e => setTz(e.target.value)} />
                </FormRow>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <FormRow label="Start time">
                    <input className="input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                </FormRow>
                <FormRow label="End time">
                    <input className="input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                </FormRow>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <FormRow label="Capacity">
                    <input className="input" type="number" min={0} value={capacity}
                        onChange={e => setCapacity(Number(e.target.value))} />
                </FormRow>
                <FormRow label="Starts on">
                    <input className="input" type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} />
                </FormRow>
                <FormRow label="Ends on (optional)">
                    <input className="input" type="date" value={endsOn ?? ''} onChange={e => setEndsOn(e.target.value)} />
                </FormRow>
            </div>

            <FormRow label="Active">
                <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                    <span>Enabled</span>
                </label>
            </FormRow>

            <div className="mt-4 flex justify-end gap-2">
                <button className="btn-secondary" onClick={onClose}>Cancel</button>
                <button className="btn-primary" onClick={submit} disabled={busy}>
                    {busy ? (mode === 'create' ? 'Creating…' : 'Saving…') : (mode === 'create' ? 'Create' : 'Save')}
                </button>
            </div>
        </Modal>
    );
}


function WeekdayMulti({
    value, onChange,
}: { value: number[]; onChange: (v: number[]) => void }) {
    const toggle = (w: number) => {
        onChange(value.includes(w) ? value.filter(x => x !== w) : [...value, w].sort((a, b) => a - b));
    };
    return (
        <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map(w => {
                const active = value.includes(w.value);
                return (
                    <button
                        key={w.value}
                        type="button"
                        onClick={() => toggle(w.value)}
                        className={[
                            "px-3 py-1 rounded-md border text-sm",
                            active
                                ? "bg-primary/70 border-transparent text-text-primary"
                                : "border-white/10 hover:bg-secondary/10"
                        ].join(" ")}
                    >
                        {w.label}
                    </button>
                );
            })}
        </div>
    );
}



/* ---------- Exceptions Modal ---------- */
function ExceptionsModal({ rule, onClose }: { rule: Rule; onClose: () => void }) {
    const [rows, setRows] = useState<ExceptionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    // form
    const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
    const [skip, setSkip] = useState<boolean>(false);
    const [oStart, setOStart] = useState<string>('');
    const [oEnd, setOEnd] = useState<string>('');
    const [oCap, setOCap] = useState<number | ''>('');
    const [note, setNote] = useState<string>('');
    const [busy, setBusy] = useState(false);

    async function load() {
        setLoading(true);
        setErr(null);
        const { data, error } = await supabase
            .from('class_schedule_exceptions')
            .select('*')
            .eq('rule_id', rule.id)
            .order('on_date', { ascending: true });
        if (error) setErr(error.message);
        setRows((data as ExceptionRow[]) ?? []);
        setLoading(false);
    }
    useEffect(() => { load(); }, [rule.id]);

    const submit = async () => {
        setBusy(true);
        const payload = {
            tenant_id: rule.tenant_id,
            rule_id: rule.id,
            on_date: date,
            skip,
            override_start_time: oStart ? oStart + ':00' : null,
            override_end_time: oEnd ? oEnd + ':00' : null,
            override_capacity: oCap === '' ? null : Number(oCap),
            note: note || null,
        };
        const { error } = await supabase.from('class_schedule_exceptions').upsert(payload, {
            onConflict: 'rule_id,on_date',
        });
        setBusy(false);
        if (error) { alert(error.message); return; }
        // reset small form
        setSkip(false); setOStart(''); setOEnd(''); setOCap(''); setNote('');
        await load();
    };

    const del = async (id: string) => {
        if (!confirm('Delete this exception?')) return;
        const { error } = await supabase.from('class_schedule_exceptions').delete().eq('id', id);
        if (error) { alert(error.message); return; }
        await load();
    };

    return (
        <Modal title={`Exceptions — ${rule.starts_on} → ${rule.ends_on ?? '—'}`} onClose={onClose}>
            {err && <div className="mb-3 text-sm border border-danger/30 bg-danger/10 text-danger rounded p-3">{err}</div>}

            <div className="rounded-md border border-white/10 p-3 mb-4">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <FormRow label="Date">
                        <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
                    </FormRow>
                    <FormRow label="Skip this date">
                        <label className="inline-flex items-center gap-2">
                            <input type="checkbox" checked={skip} onChange={e => setSkip(e.target.checked)} />
                            <span>Skip</span>
                        </label>
                    </FormRow>
                    <FormRow label="Override Capacity">
                        <input className="input" type="number" min={0}
                            value={oCap} onChange={e => setOCap(e.target.value === '' ? '' : Number(e.target.value))} />
                    </FormRow>
                    <FormRow label="Override Start time">
                        <input className="input" type="time" value={oStart} onChange={e => setOStart(e.target.value)} />
                    </FormRow>
                    <FormRow label="Override End time">
                        <input className="input" type="time" value={oEnd} onChange={e => setOEnd(e.target.value)} />
                    </FormRow>
                    <FormRow label="Note">
                        <input className="input" value={note} onChange={e => setNote(e.target.value)} />
                    </FormRow>
                </div>
                <div className="mt-3 flex justify-end">
                    <button className="btn-primary" onClick={submit} disabled={busy}>
                        {busy ? 'Saving…' : 'Save Exception'}
                    </button>
                </div>
            </div>

            <div className="rounded-md border border-white/10 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-secondary-background/60">
                        <tr className="text-left">
                            <Th>Date</Th>
                            <Th>Skip</Th>
                            <Th>Start</Th>
                            <Th>End</Th>
                            <Th>Capacity</Th>
                            <Th>Note</Th>
                            <Th className="text-right pr-3">Actions</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td className="px-3 py-4 opacity-60" colSpan={7}>Loading…</td></tr>}
                        {!loading && rows.length === 0 && <tr><td className="px-3 py-4 opacity-60" colSpan={7}>No exceptions</td></tr>}
                        {rows.map(x => (
                            <tr key={x.id} className="border-t border-white/10 hover:bg-secondary/10">
                                <Td>{x.on_date}</Td>
                                <Td>{x.skip ? 'Yes' : 'No'}</Td>
                                <Td>{x.override_start_time ? fmtTime(x.override_start_time) : '—'}</Td>
                                <Td>{x.override_end_time ? fmtTime(x.override_end_time) : '—'}</Td>
                                <Td>{x.override_capacity ?? '—'}</Td>
                                <Td>{x.note ?? '—'}</Td>
                                <Td className="text-right">
                                    <button className="px-2 py-1 text-sm rounded text-danger hover:bg-danger/10"
                                        onClick={() => del(x.id)}>Delete</button>
                                </Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-4 flex justify-end">
                <button className="btn-secondary" onClick={onClose}>Close</button>
            </div>
        </Modal>
    );
}

/* ---------- Shared tiny UI helpers (same style as other pages) ---------- */
function Modal({ title, children, onClose }: any) {
    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl rounded-md border border-white/10 bg-secondary-background text-text-primary shadow-xl">
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                    <div className="font-semibold">{title}</div>
                    <button onClick={onClose} className="rounded px-2 py-1 hover:bg-white/5">✕</button>
                </div>
                <div className="p-4">{children}</div>
            </div>
        </div>
    );
}
function FormRow({ label, children }: any) {
    return (
        <label className="block mb-3">
            <div className="mb-1 text-sm opacity-80">{label}</div>
            {children}
        </label>
    );
}
