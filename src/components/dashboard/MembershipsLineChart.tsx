import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';

type ChartPoint = {
  monthKey: string; // e.g. "2025-01"
  label: string;    // e.g. "Ιαν 25"
  count: number;    // number of memberships started that month
};

export function MembershipsLineChart() {
  const { profile } = useAuth();
  const tenantId = (profile as any)?.tenant_id ?? null;

  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    if (!tenantId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const now = new Date();
        // Start from 11 months ago, at the 1st of that month
        const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        start.setHours(0, 0, 0, 0);

        const { data: rows, error } = await supabase
          .from('memberships')
          .select('id, starts_at')
          .eq('tenant_id', tenantId)
          .not('starts_at', 'is', null)
          .gte('starts_at', start.toISOString());

        if (error) throw error;

        // Bucket memberships per monthKey = "YYYY-MM"
        const buckets = new Map<string, number>();

        for (const row of rows ?? []) {
          const starts_at = (row as any).starts_at as string | null;
          if (!starts_at) continue;

          const d = new Date(starts_at);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
            2,
            '0',
          )}`;

          buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }

        const monthNames = [
          'Ιαν',
          'Φεβ',
          'Μαρ',
          'Απρ',
          'Μάι',
          'Ιουν',
          'Ιουλ',
          'Αυγ',
          'Σεπ',
          'Οκτ',
          'Νοε',
          'Δεκ',
        ];

        const chartData: ChartPoint[] = [];
        for (let i = 0; i < 12; i++) {
          const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
            2,
            '0',
          )}`;
          const label = `${monthNames[d.getMonth()]} ${String(
            d.getFullYear(),
          ).slice(-2)}`;

          chartData.push({
            monthKey: key,
            label,
            count: buckets.get(key) ?? 0,
          });
        }

        setData(chartData);
      } catch (err: any) {
        console.error('Error loading memberships by month:', err);
        setError(err?.message ?? 'Κάτι πήγε στραβά.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tenantId]);

  return (
    <div className="rounded-xl border border-white/10 bg-secondary-background/60 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">
          Συνδρομές ανά μήνα (τελευταίοι 12 μήνες)
        </h2>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-text-muted">
          Φόρτωση δεδομένων...
        </div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-red-400">{error}</div>
      ) : data.every((d) => d.count === 0) ? (
        <div className="py-8 text-center text-sm text-text-muted">
          Δεν βρέθηκαν εγγραφές συνδρομών για τους τελευταίους 12 μήνες.
        </div>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(148,163,184,0.2)"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#fff' }}
                axisLine={{ stroke: 'var(--color-text-muted)' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#fff' }}
                axisLine={{ stroke: 'rgba(148,163,184,0.3)' }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-primary)',
                  border: '1px solid rgba(148,163,184,0.3)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: any) => [`${value} συνδρομές`, 'Σύνολο']}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="var(--color-accent)"
                strokeWidth={2}
                dot={{
                  r: 4,
                  strokeWidth: 1.5,
                  stroke: 'var(--color-accent)',
                  fill: 'var(--color-accent)',
                }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
