import { useEffect, useMemo, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { supabase } from '../lib/supabase';
import { RefreshCw, ChevronLeft, ChevronRight, QrCode, AlertTriangle, Loader2, CalendarDays, Clock, Zap } from 'lucide-react';
import { useAuth } from '../auth';

type SessionRow = {
  id: string; tenant_id: string; class_id: string;
  starts_at: string; ends_at: string; checkin_token: string | null;
  classes?: { title: string | null }[] | null;
};

function fmtTimeEL(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateEL(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function isNowBetween(startsAt: string, endsAt: string) {
  const now = Date.now();
  return now >= new Date(startsAt).getTime() && now <= new Date(endsAt).getTime();
}

function startOfTodayISO()    { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); }
function startOfTomorrowISO() { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+1); return d.toISOString(); }

export default function SessionQrPage() {
  const { profile } = useAuth();
const tenantId = profile?.tenant_id ?? null;
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [index, setIndex]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState<string | null>(null);


  async function loadTodaySessions(currentTenantId: string, isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const { data: sessData, error: sessErr } = await supabase
        .from('class_sessions')
        .select('id,tenant_id,class_id,starts_at,ends_at,checkin_token')
        .eq('tenant_id', currentTenantId)
        .gte('starts_at', startOfTodayISO())
        .lt('starts_at', startOfTomorrowISO())
        .order('starts_at', { ascending: true });

      if (sessErr) throw new Error(sessErr.message);

      const baseRows = (sessData ?? []) as Omit<SessionRow,'classes'>[];
      const classIds = Array.from(new Set(baseRows.map((r) => r.class_id))).filter(Boolean);
      const titleMap = new Map<string, string | null>();

      if (classIds.length > 0) {
        const { data: classData, error: classErr } = await supabase.from('classes').select('id,title').eq('tenant_id', currentTenantId).in('id', classIds);
        if (classErr) throw new Error(classErr.message);
        (classData ?? []).forEach((c: any) => titleMap.set(c.id, c.title ?? null));
      }

      const rows: SessionRow[] = baseRows.map((r) => ({ ...r, classes: [{ title: titleMap.get(r.class_id) ?? null }] }));
      setSessions(rows);

      const activeIdx   = rows.findIndex((s) => !!s.checkin_token && isNowBetween(s.starts_at, s.ends_at));
      const upcomingIdx = rows.findIndex((s) => !!s.checkin_token && new Date(s.starts_at).getTime() > Date.now());
      const chosen = activeIdx >= 0 ? activeIdx : upcomingIdx >= 0 ? upcomingIdx : 0;
      setIndex(Math.max(0, Math.min(chosen, Math.max(0, rows.length - 1))));
    } catch (e: any) {
      setError(e?.message || 'Κάτι πήγε στραβά.');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }

  useEffect(() => { if (tenantId) loadTodaySessions(tenantId); }, [tenantId]);

  const selected     = useMemo(() => sessions[index] ?? null, [sessions, index]);
  const classTitle   = selected?.classes?.[0]?.title ?? null;
  const isActiveNow  = selected ? isNowBetween(selected.starts_at, selected.ends_at) : false;
  const canPrev      = index > 0;
  const canNext      = index < sessions.length - 1;
  const headerDate   = fmtDateEL(selected?.starts_at ?? new Date().toISOString());

  const qrValue = useMemo(() => {
    if (!selected || !tenantId || !selected.checkin_token) return null;
    return JSON.stringify({ type: 'session_checkin', tenantId, sessionId: selected.id, token: selected.checkin_token });
  }, [selected, tenantId]);

  return (
    <div className="min-h-dvh bg-background text-text-primary flex flex-col">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-10 bg-secondary-background/90 backdrop-blur-xl border-b border-border/10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
              <QrCode className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-[11px] text-text-secondary capitalize">{fmtDateEL(new Date().toISOString())}</p>
              <h1 className="text-sm font-black text-text-primary tracking-tight leading-none">QR Check-in</h1>
            </div>
          </div>

          <button
            onClick={() => tenantId && loadTodaySessions(tenantId, true)}
            disabled={refreshing}
            className="h-8 w-8 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 disabled:opacity-40 transition-all cursor-pointer"
            title="Ανανέωση"
          >
            <RefreshCw className={['h-3.5 w-3.5', refreshing ? 'animate-spin' : ''].join(' ')} />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 px-4 py-5">
        <div className="max-w-md mx-auto space-y-3">

          {/* ── Session navigator ── */}
          <div className="rounded-2xl border border-border/10 bg-secondary-background overflow-hidden">
            <div className="h-0.75 w-full bg-linear-to-r from-primary/0 via-primary/60 to-primary/0" />

            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-text-secondary text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />Φόρτωση συνεδριών…
                </div>
              ) : error ? (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" />{error}
                </div>
              ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8 text-text-secondary">
                  <CalendarDays className="h-8 w-8 opacity-25" />
                  <span className="text-sm">Δεν υπάρχουν sessions για σήμερα.</span>
                </div>
              ) : (
                <>
                  {/* Date + active badge */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5 text-sm font-bold text-text-primary capitalize">
                      <CalendarDays className="h-3.5 w-3.5 text-text-secondary opacity-60" />
                      {headerDate}
                    </div>
                    {isActiveNow && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2.5 py-1 rounded-full border border-success/30 bg-success/15 text-success animate-pulse">
                        <Zap className="h-2.5 w-2.5" />Ενεργό τώρα
                      </span>
                    )}
                  </div>

                  {/* Prev / counter / next */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIndex((i) => Math.max(0, i - 1))}
                      disabled={!canPrev}
                      className="h-10 w-10 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    {/* Session info */}
                    <div className="flex-1 rounded-xl border border-border/10 bg-secondary/5 px-3.5 py-2.5 min-w-0">
                      <div className="text-sm font-bold text-text-primary truncate">
                        {classTitle ?? 'Μάθημα'}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-text-secondary">
                        <Clock className="h-3 w-3 opacity-60" />
                        {fmtTimeEL(selected?.starts_at)} – {fmtTimeEL(selected?.ends_at)}
                        <span className="opacity-40 mx-1">·</span>
                        <span className="font-medium">{index + 1}/{sessions.length}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => setIndex((i) => Math.min(sessions.length - 1, i + 1))}
                      disabled={!canNext}
                      className="h-10 w-10 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Dot pagination */}
                  {sessions.length > 1 && (
                    <div className="flex items-center justify-center gap-1 mt-3">
                      {sessions.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setIndex(i)}
                          className={[
                            'rounded-full transition-all duration-200 cursor-pointer',
                            i === index ? 'w-4 h-1.5 bg-primary' : 'w-1.5 h-1.5 bg-border/30 hover:bg-border/60',
                          ].join(' ')}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── QR card ── */}
          <div className="rounded-2xl border border-border/10 bg-secondary-background overflow-hidden shadow-xl">
            {!selected ? (
              <div className="flex flex-col items-center gap-3 py-16 text-text-secondary">
                <QrCode className="h-10 w-10 opacity-20" />
                <span className="text-sm">Δεν υπάρχει επιλεγμένο session.</span>
              </div>
            ) : !selected.checkin_token ? (
              <div className="flex flex-col items-center gap-3 py-16 text-text-secondary px-6 text-center">
                <div className="w-12 h-12 rounded-2xl border border-border/10 flex items-center justify-center bg-secondary/10">
                  <QrCode className="h-6 w-6 opacity-30" />
                </div>
                <div>
                  <div className="text-sm font-bold text-text-primary">Δεν υπάρχει token</div>
                  <div className="text-xs text-text-secondary mt-0.5">Αυτό το session δεν έχει check-in token.</div>
                </div>
              </div>
            ) : (
              <>
                {/* QR header */}
                <div className="px-5 pt-5 pb-3">
                  <h2 className="text-base font-black text-text-primary tracking-tight">
                    {classTitle ?? 'QR Check-in'}
                  </h2>
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary mt-0.5">
                    <Clock className="h-3 w-3 opacity-60" />
                    {fmtTimeEL(selected.starts_at)} – {fmtTimeEL(selected.ends_at)}
                    {isActiveNow && (
                      <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-success/15 text-success border border-success/20">
                        <Zap className="h-2 w-2" />LIVE
                      </span>
                    )}
                  </div>
                </div>

                {/* QR code */}
                <div className="px-5 pb-5">
                  <div className="rounded-2xl bg-white p-4 flex items-center justify-center shadow-inner">
                    <QRCodeCanvas value={qrValue!} size={280} includeMargin />
                  </div>
                </div>

                {/* Footer hint */}
                <div className="px-5 pb-5 text-center">
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Οι συμμετέχοντες σκανάρουν αυτό το QR από την εφαρμογή για check-in.
                  </p>
                  <p className="text-[10.5px] text-text-secondary opacity-50 mt-1">
                    Tip: αύξησε τη φωτεινότητα οθόνης αν δεν σκανάρεται εύκολα.
                  </p>
                </div>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}