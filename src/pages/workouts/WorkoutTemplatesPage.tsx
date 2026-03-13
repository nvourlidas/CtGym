import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import type { LucideIcon } from 'lucide-react';
import {
  Pencil, Trash2, Loader2, Send, Plus, Search,
  Dumbbell, ChevronLeft, ChevronRight, ChevronDown, X,
  User, MessageSquare, CheckCircle2,
} from 'lucide-react';
import CreateWorkoutTemplateModal from '../../components/workouts/CreateWorkoutTemplateModal';
import EditWorkoutTemplateModal from '../../components/workouts/EditWorkoutTemplateModal';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';
import PlanGate from "../../components/billing/PlanGate";
import { useNavigate } from 'react-router-dom';

type TemplateRow = {
  id: string; tenant_id: string; created_by: string; coach_id: string | null;
  name: string | null; notes: string | null; created_at: string; updated_at: string | null;
  workout_template_exercises?: Array<{ id: string }>;
};
type Member = { id: string; full_name: string | null; email?: string | null };

export default function WorkoutTemplatesPage() {
  const { profile, subscription } = useAuth();
  const navigate = useNavigate();
  const [showSubModal, setShowSubModal] = useState(false);
  const [rows, setRows]       = useState<TemplateRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]             = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow]   = useState<TemplateRow | null>(null);
  const [assignRow, setAssignRow] = useState<TemplateRow | null>(null);
  const [page, setPage]       = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const subscriptionInactive = !subscription?.is_active;
  function requireActive(action: () => void) { if (subscriptionInactive) { setShowSubModal(true); return; } action(); }

  const tier = String((subscription as any)?.plan_id ?? (subscription as any)?.tier ?? (subscription as any)?.plan_name ?? (subscription as any)?.name ?? "").toLowerCase();
  const isFree = !["pro","starter","friend_app"].some((t) => tier.includes(t));

  async function load() {
    if (!profile?.tenant_id) return;
    setLoading(true);
    const { data, error } = await supabase.from('workout_templates')
      .select('id,tenant_id,created_by,coach_id,name,notes,created_at,updated_at,workout_template_exercises(id)')
      .eq('tenant_id', profile.tenant_id).order('created_at', { ascending: false });
    if (!error && data) setRows(data as any[]);
    setLoading(false);
  }
  async function loadMembers() {
    if (!profile?.tenant_id) return;
    const { data, error } = await supabase.from('members').select('id,full_name,email')
      .eq('tenant_id', profile.tenant_id).eq('role', 'member').order('full_name', { ascending: true });
    if (!error && data) setMembers(data as any[]);
  }

  useEffect(() => { load(); loadMembers(); }, [profile?.tenant_id]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const n = q.toLowerCase();
    return rows.filter((r) => (r.name ?? '').toLowerCase().includes(n) || (r.notes ?? '').toLowerCase().includes(n) || r.id.toLowerCase().includes(n));
  }, [rows, q]);

  useEffect(() => { setPage(1); }, [q, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);
  const startIdx  = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx    = Math.min(filtered.length, page * pageSize);

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]">
      <div className={isFree ? "pointer-events-none select-none blur-sm opacity-60" : ""}>
        <div className="p-4 md:p-6 space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                <Dumbbell className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-black text-text-primary tracking-tight">Workout Templates</h1>
                <p className="text-xs text-text-secondary mt-px">Δημιουργία και ανάθεση templates προπόνησης.</p>
              </div>
            </div>
            <button onClick={() => requireActive(() => setShowCreate(true))}
              className="group relative inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px transition-all cursor-pointer overflow-hidden"
            >
              <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
              <Plus className="h-3.5 w-3.5 relative z-10" /><span className="relative z-10">Νέο Template</span>
            </button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background max-w-sm">
            <Search className="h-3.5 w-3.5 text-text-secondary shrink-0" />
            <input className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-secondary" placeholder="Αναζήτηση templates…" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button onClick={() => setQ('')} className="text-text-secondary hover:text-text-primary cursor-pointer"><X className="h-3 w-3" /></button>}
          </div>

          {/* Table card */}
          <div className="rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/10 bg-secondary-background/80">
                    {['Όνομα','Σημειώσεις','Ασκήσεις','Τελευταία ενημέρωση',''].map((h,i) => (
                      <th key={i} className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary ${i===4?'text-right':'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-text-secondary">
                      <div className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…</div>
                    </td></tr>
                  )}
                  {!loading && filtered.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center">
                      <div className="flex flex-col items-center gap-2 text-text-secondary"><Dumbbell className="h-7 w-7 opacity-20" /><span className="text-sm">Δεν υπάρχουν templates</span></div>
                    </td></tr>
                  )}
                  {!loading && paginated.map((w) => {
                    const exCount = w.workout_template_exercises?.length ?? 0;
                    return (
                      <tr key={w.id} className="border-t border-border/5 hover:bg-secondary/5 transition-colors">
                        <td className="px-4 py-3 font-bold text-text-primary">{w.name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-text-secondary max-w-xs">
                          <div className="line-clamp-2">{w.notes ?? '—'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-lg border border-primary/25 bg-primary/10 text-primary">{exCount} ασκήσεις</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-text-secondary">
                          {new Date(w.updated_at ?? w.created_at).toLocaleString('el-GR')}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <ActionBtn icon={Send} label="Ανάθεση" onClick={() => requireActive(() => setAssignRow(w))} />
                            <ActionBtn icon={Pencil} label="Επεξεργασία" onClick={() => requireActive(() => setEditRow(w))} />
                            <DeleteBtn id={w.id} onDeleted={load} guard={() => { if (subscriptionInactive) { setShowSubModal(true); return false; } return true; }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border/5">
              {loading && <div className="flex items-center justify-center gap-2 py-10 text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Φόρτωση…</span></div>}
              {!loading && filtered.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-10 text-text-secondary"><Dumbbell className="h-7 w-7 opacity-20" /><span className="text-sm">Δεν υπάρχουν templates</span></div>
              )}
              {!loading && paginated.map((w) => {
                const exCount = w.workout_template_exercises?.length ?? 0;
                return (
                  <div key={w.id} className="px-4 py-3 hover:bg-secondary/5 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-text-primary text-sm">{w.name ?? 'Template'}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-lg border border-primary/25 bg-primary/10 text-primary">{exCount} ασκήσεις</span>
                          <span className="text-xs text-text-secondary">{new Date(w.updated_at ?? w.created_at).toLocaleDateString('el-GR')}</span>
                        </div>
                        {w.notes && <div className="mt-1.5 text-xs text-text-secondary line-clamp-2">{w.notes}</div>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <ActionBtn icon={Send} label="Ανάθεση" onClick={() => requireActive(() => setAssignRow(w))} />
                        <ActionBtn icon={Pencil} label="Επεξεργασία" onClick={() => requireActive(() => setEditRow(w))} />
                        <DeleteBtn id={w.id} onDeleted={load} guard={() => { if (subscriptionInactive) { setShowSubModal(true); return false; } return true; }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {!loading && filtered.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/10 text-xs text-text-secondary flex-wrap gap-2">
                <span>Εμφάνιση <span className="font-bold text-text-primary">{startIdx}–{endIdx}</span> από <span className="font-bold text-text-primary">{filtered.length}</span></span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span>Ανά σελίδα:</span>
                    <div className="relative">
                      <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
                        className="h-7 pl-2.5 pr-6 rounded-xl border border-border/15 bg-secondary-background text-xs appearance-none outline-none focus:border-primary/40 cursor-pointer"
                      >
                        {[10,25,50].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary pointer-events-none" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                      className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-40 transition-all cursor-pointer"
                    ><ChevronLeft className="h-3.5 w-3.5" /></button>
                    <span className="px-2">Σελίδα <span className="font-bold text-text-primary">{page}</span> / {pageCount}</span>
                    <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount}
                      className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center hover:bg-secondary/30 disabled:opacity-40 transition-all cursor-pointer"
                    ><ChevronRight className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PlanGate overlay */}
      {isFree && (
        <div className="absolute inset-0 z-80 flex items-start justify-center p-6 bg-black/40 pointer-events-auto">
          <div className="w-full max-w-xl">
            <PlanGate blocked asOverlay allow={["starter","pro"]}
              title="Τα Workout Templates είναι διαθέσιμα από Starter"
              description="Αναβάθμισε για να δημιουργείς templates και να τα αναθέτεις σε μέλη."
              onUpgradeClick={() => navigate("/settings/billing")}
            />
          </div>
        </div>
      )}

      {showCreate && <CreateWorkoutTemplateModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={load} />}
      {editRow && <EditWorkoutTemplateModal open templateId={editRow.id} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); load(); }} />}
      {assignRow && <AssignTemplateModal row={assignRow} members={members} onClose={() => { setAssignRow(null); load(); }} />}
      <SubscriptionRequiredModal open={showSubModal} onClose={() => setShowSubModal(false)} />
    </div>
  );
}

/* ── Helpers ── */
function ActionBtn({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
    ><Icon className="h-3.5 w-3.5" /></button>
  );
}

function DeleteBtn({ id, onDeleted, guard }: { id: string; onDeleted: () => void; guard: () => boolean }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (guard && !guard()) return;
    if (!confirm('Διαγραφή αυτού του template; Αυτό δεν μπορεί να αναιρεθεί.')) return;
    setBusy(true);
    await supabase.functions.invoke('workout-template-delete', { body: { id } });
    setBusy(false);
    onDeleted();
  };
  return (
    <button type="button" onClick={onClick} disabled={busy} title="Διαγραφή" aria-label="Διαγραφή"
      className="h-7 w-7 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all disabled:opacity-40 cursor-pointer"
    >{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button>
  );
}

/* ── AssignTemplateModal ── */
function AssignTemplateModal({ row, members, onClose }: { row: TemplateRow; members: Member[]; onClose: () => void }) {
  const { profile } = useAuth();
  const [memberId, setMemberId]   = useState('');
  const [message, setMessage]     = useState('');
  const [busy, setBusy]           = useState(false);
  const [sent, setSent]           = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberOpen, setMemberOpen]   = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.toLowerCase().trim();
    if (!q) return members;
    return members.filter((m) => (m.full_name ?? '').toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q));
  }, [members, memberQuery]);

  useEffect(() => {
    if (!memberOpen) return;
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setMemberOpen(false); };
    const onKey  = (e: KeyboardEvent) => { if (e.key === 'Escape') setMemberOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [memberOpen]);

  const selectedMember = useMemo(() => members.find((m) => m.id === memberId) ?? null, [members, memberId]);

  const submit = async () => {
    if (!profile?.id || !memberId) return;
    setBusy(true);
    const res = await supabase.functions.invoke('workout-template-assign', { body: { tenant_id: profile.tenant_id, template_id: row.id, member_id: memberId, coach_id: row.coach_id ?? null, message: message.trim() || null } });
    if (res.error) { console.error(res.error); alert(res.error.message ?? 'Function error'); }
    else setSent(true);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border/15 bg-secondary-background shadow-2xl overflow-hidden">
        {/* linear top bar */}
        <div className="h-0.75 bg-linear-to-r from-primary via-accent to-primary/50" />

        {/* Header */}
        <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
              <Send className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <div className="text-sm font-black text-text-primary">Ανάθεση Template</div>
              <div className="text-xs text-text-secondary mt-px">{row.name ?? row.id}</div>
            </div>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-xl border border-border/10 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"><X className="h-3.5 w-3.5" /></button>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-3 py-10 px-5">
            <CheckCircle2 className="h-10 w-10 text-success" />
            <div className="text-sm font-bold text-text-primary">Το template στάλθηκε επιτυχώς!</div>
            <div className="text-xs text-text-secondary">{selectedMember?.full_name ?? 'Μέλος'}</div>
            <button onClick={onClose} className="mt-2 h-8 px-5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-all cursor-pointer">Κλείσιμο</button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Member picker */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary flex items-center gap-1.5"><User className="h-3 w-3" />Μέλος *</label>
              <div className="relative" ref={boxRef}>
                <input className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary"
                  placeholder="Αναζήτηση μέλους…"
                  value={memberId ? `${selectedMember?.full_name ?? 'Μέλος'}${selectedMember?.email ? ` · ${selectedMember.email}` : ''}` : memberQuery}
                  onChange={(e) => { setMemberQuery(e.target.value); setMemberId(''); setMemberOpen(true); }}
                  onFocus={() => setMemberOpen(true)}
                />
                {memberOpen && (
                  <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-xl border border-border/15 bg-secondary-background shadow-xl">
                    <div className="sticky top-0 bg-secondary-background/95 backdrop-blur-sm border-b border-border/10 px-3 py-2 flex items-center justify-between">
                      <span className="text-xs text-text-secondary">{filteredMembers.length} αποτελέσματα</span>
                      <button type="button" onClick={() => setMemberOpen(false)} className="text-xs px-2 py-0.5 rounded-lg border border-border/10 hover:bg-secondary/20 cursor-pointer">Κλείσιμο</button>
                    </div>
                    {filteredMembers.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-text-secondary">Δεν βρέθηκαν μέλη</div>
                    ) : filteredMembers.map((m) => (
                      <button key={m.id} type="button" onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setMemberId(m.id); setMemberQuery(''); setMemberOpen(false); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-secondary/20 transition-colors cursor-pointer"
                      >
                        <div className="text-sm font-semibold text-text-primary">{m.full_name ?? 'Μέλος'}</div>
                        {m.email && <div className="text-xs text-text-secondary">{m.email}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {memberId && (
                <button type="button" onClick={() => { setMemberId(''); setMemberQuery(''); }} className="text-xs text-text-secondary hover:text-text-primary underline cursor-pointer">Καθαρισμός επιλογής</button>
              )}
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary flex items-center gap-1.5"><MessageSquare className="h-3 w-3" />Μήνυμα (προαιρετικό)</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="π.χ. Κάνε αυτό το πρόγραμμα 3 φορές την εβδομάδα…"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all resize-none placeholder:text-text-secondary"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer">Ακύρωση</button>
              <button onClick={submit} disabled={busy || !memberId}
                className="group relative h-9 px-5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm disabled:opacity-50 transition-all cursor-pointer overflow-hidden inline-flex items-center gap-1.5"
              >
                <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /> : <Send className="h-3.5 w-3.5 relative z-10" />}
                <span className="relative z-10">{busy ? 'Αποστολή…' : 'Αποστολή'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}