import { useEffect, useState } from 'react';
import {
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Area, AreaChart,
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import { BookOpen, Loader2, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';

type ChartPoint = { monthKey: string; label: string; count: number };

const MONTH_NAMES = ['Ιαν','Φεβ','Μαρ','Απρ','Μάι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

function buildMonthBuckets(rows: any[], dateField: string): ChartPoint[] {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  start.setHours(0,0,0,0);

  const buckets = new Map<string,number>();
  for (const row of rows ?? []) {
    const iso = (row as any)[dateField] as string | null;
    if (!iso) continue;
    const d   = new Date(iso);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return Array.from({ length: 12 }, (_, i) => {
    const d   = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    return { monthKey: key, label: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`, count: buckets.get(key) ?? 0 };
  });
}

// Custom dot
function CustomDot({ cx, cy, value }: any) {
  if (value === 0) return null;
  return <circle cx={cx} cy={cy} r={4} fill="var(--color-accent)" stroke="rgba(0,0,0,0.3)" strokeWidth={1.5} />;
}

// Custom tooltip
function CustomTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/15 bg-secondary-background/95 backdrop-blur shadow-xl px-3.5 py-2.5 text-sm">
      <div className="font-bold text-text-primary mb-0.5">{label}</div>
      <div className="text-accent font-semibold">{payload[0].value} {unit}</div>
    </div>
  );
}

function TrendBadge({ data }: { data: ChartPoint[] }) {
  const last  = data[data.length - 1]?.count ?? 0;
  const prev  = data[data.length - 2]?.count ?? 0;
  if (prev === 0 && last === 0) return null;
  const diff  = last - prev;
  const pct   = prev > 0 ? Math.round((diff / prev) * 100) : null;
  if (diff > 0) return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success bg-success/10 border border-success/25 px-2 py-0.5 rounded-full"><TrendingUp className="h-3 w-3" />{pct !== null ? `+${pct}%` : `+${diff}`}</span>;
  if (diff < 0) return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-danger bg-danger/10 border border-danger/25 px-2 py-0.5 rounded-full"><TrendingDown className="h-3 w-3" />{pct !== null ? `${pct}%` : `${diff}`}</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-text-secondary bg-secondary/20 border border-border/20 px-2 py-0.5 rounded-full"><Minus className="h-3 w-3" />0%</span>;
}

export function BookingsLineChart() {
  const { profile } = useAuth();
  const tenantId = (profile as any)?.tenant_id ?? null;

  const [data, setData]       = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const fetchData = async () => {
      setLoading(true); setError(null);
      try {
        const start = new Date();
        start.setMonth(start.getMonth() - 11);
        start.setDate(1); start.setHours(0,0,0,0);

        const PAGE = 1000;
        let allRows: any[] = [];
        let from = 0;
        while (true) {
          const { data: page, error } = await supabase
            .from('bookings_list').select('starts_at')
            .eq('tenant_id', tenantId).gte('starts_at', start.toISOString())
            .range(from, from + PAGE - 1);
          if (error) throw error;
          allRows = allRows.concat(page ?? []);
          if (!page || page.length < PAGE) break;
          from += PAGE;
        }

        setData(buildMonthBuckets(allRows, 'starts_at'));
      } catch (err: any) {
        setError(err?.message ?? 'Κάτι πήγε στραβά.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [tenantId]);

  const isEmpty   = !loading && !error && data.every((d) => d.count === 0);
  const total     = data.reduce((s, d) => s + d.count, 0);
  const maxVal    = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/10 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <BookOpen className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-black text-text-primary tracking-tight">Κρατήσεις ανά μήνα</h2>
            <p className="text-[11px] text-text-secondary mt-0.5">Τελευταίοι 12 μήνες</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!loading && !error && !isEmpty && <TrendBadge data={data} />}
          {loading && <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />}
          {error && <div className="flex items-center gap-1 text-xs text-danger"><AlertTriangle className="h-3.5 w-3.5" />{error}</div>}
        </div>
      </div>

      {/* Summary strip */}
      {!loading && !error && !isEmpty && (
        <div className="px-5 py-3 border-b border-border/5 flex items-center gap-6">
          <div>
            <div className="text-xl font-black text-text-primary">{total.toLocaleString()}</div>
            <div className="text-[11px] text-text-secondary">Σύνολο κρατήσεων</div>
          </div>
          <div>
            <div className="text-xl font-black text-text-primary">{maxVal}</div>
            <div className="text-[11px] text-text-secondary">Κορυφή μήνα</div>
          </div>
          <div>
            <div className="text-xl font-black text-text-primary">{Math.round(total / 12)}</div>
            <div className="text-[11px] text-text-secondary">Μέσος όρος/μήνα</div>
          </div>
        </div>
      )}

      {/* Chart body */}
      <div className="px-4 pb-4 pt-3">
        {loading && (
          <div className="h-56 flex items-center justify-center gap-2 text-text-secondary text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />Φόρτωση δεδομένων…
          </div>
        )}
        {isEmpty && (
          <div className="h-56 flex flex-col items-center justify-center gap-2 text-text-secondary">
            <BookOpen className="h-7 w-7 opacity-20" />
            <span className="text-sm">Δεν βρέθηκαν κρατήσεις για τους τελευταίους 12 μήνες.</span>
          </div>
        )}
        {!loading && !error && !isEmpty && (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="bookingsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-text-primary)" opacity={0.08} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} dy={6} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip unit="κρατήσεις" />} cursor={{ stroke: 'var(--color-accent)', strokeWidth: 1, strokeDasharray: '4 2', strokeOpacity: 0.5 }} />
                <Area type="monotone" dataKey="count" stroke="var(--color-accent)" strokeWidth={2.5} fill="url(#bookingsGrad)" dot={<CustomDot />} activeDot={{ r: 6, fill: 'var(--color-accent)', stroke: 'rgba(0,0,0,0.3)', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}