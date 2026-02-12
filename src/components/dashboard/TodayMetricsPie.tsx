// src/components/widgets/TodayBookingsPieWidget.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Pie } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

type Props = {
  tenantId: string
}

type State = {
  sessions: number
  totalBookings: number
  checkIns: number
  cancels: number
  noShows: number
  active: number
}

function utcMidnightISO(d: Date) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)).toISOString()
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-xs text-text-primary/80">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span>{label}</span>
      </div>
      <span className="font-semibold text-text-primary/90">{value}</span>
    </div>
  )
}

export default function TodayBookingsPieWidget({ tenantId }: Props) {
  const [data, setData] = useState<State>({
    sessions: 0,
    totalBookings: 0,
    checkIns: 0,
    cancels: 0,
    noShows: 0,
    active: 0,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantId) return

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const now = new Date()
        const fromISO = utcMidnightISO(now)
        const toISO = utcMidnightISO(
          new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
        )

        // 1) Sessions today (class_sessions.starts_at in [today, tomorrow))
        const { count: sessionsCount, error: sessionsError } = await supabase
          .from('class_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .gte('starts_at', fromISO)
          .lt('starts_at', toISO)

        if (sessionsError) throw sessionsError

        // 2) Total bookings today (by session date)
        const { count: totalBookingsCount, error: totalBookingsError } = await supabase
          .from('bookings')
          .select('id, class_sessions!inner(starts_at)', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .gte('class_sessions.starts_at', fromISO)
          .lt('class_sessions.starts_at', toISO)

        if (totalBookingsError) throw totalBookingsError

        // 3) Bookings per status
        const [checkInsRes, cancelsRes, noShowsRes] = await Promise.all([
          supabase
            .from('bookings')
            .select('id, class_sessions!inner(starts_at)', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('status', 'checked_in')
            .gte('class_sessions.starts_at', fromISO)
            .lt('class_sessions.starts_at', toISO),
          supabase
            .from('bookings')
            .select('id, class_sessions!inner(starts_at)', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('status', 'canceled')
            .gte('class_sessions.starts_at', fromISO)
            .lt('class_sessions.starts_at', toISO),
          supabase
            .from('bookings')
            .select('id, class_sessions!inner(starts_at)', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('status', 'no_show')
            .gte('class_sessions.starts_at', fromISO)
            .lt('class_sessions.starts_at', toISO),
        ])

        if (checkInsRes.error) throw checkInsRes.error
        if (cancelsRes.error) throw cancelsRes.error
        if (noShowsRes.error) throw noShowsRes.error

        const sessions = sessionsCount ?? 0
        const totalBookings = totalBookingsCount ?? 0
        const checkIns = checkInsRes.count ?? 0
        const cancels = cancelsRes.count ?? 0
        const noShows = noShowsRes.count ?? 0

        const active = Math.max(totalBookings - (checkIns + cancels + noShows), 0)

        setData({
          sessions,
          totalBookings,
          checkIns,
          cancels,
          noShows,
          active,
        })
      } catch (e: any) {
        console.error('Error loading today bookings pie:', e)
        setError(e?.message || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [tenantId])

  const hasBookings = data.totalBookings > 0

  const chartData = {
    labels: ['Check-ins', 'Ακυρώσεις', 'Απουσίες', 'Ενεργές κρατήσεις'],
    datasets: [
      {
        data: hasBookings
          ? [data.checkIns, data.cancels, data.noShows, data.active]
          : [1, 0, 0, 0], // dummy for empty
        backgroundColor: [
          '#22c55e', // check-ins
          '#f97373', // cancels
          '#a855f7', // no-shows
          '#38bdf8', // active
        ],
        borderWidth: 1,
        borderColor: 'rgba(15,23,42,0.5)',
      },
    ],
  }

  const options: any = {
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            if (!hasBookings) return 'Καμία κράτηση σήμερα'
            const label = ctx.label || ''
            const value = ctx.raw as number
            const percent = data.totalBookings
              ? ((value / data.totalBookings) * 100).toFixed(1)
              : '0.0'
            return `${label}: ${value} (${percent}%)`
          },
        },
      },
    },
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
  }

  return (
    <div className="rounded-md border border-border/10 bg-secondary-background/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold opacity-80">
            Παρουσίες & Κρατήσεις Σήμερα
          </h3>
          <p className="mt-1 text-xs text-text-primary">
            Συνεδρίες σήμερα:{' '}
            <span className="font-semibold ">
              {loading ? '…' : data.sessions}
            </span>
            {' · '}
            Κρατήσεις σήμερα:{' '}
            <span className="font-semibold ">
              {loading ? '…' : data.totalBookings}
            </span>
          </p>
        </div>
        {error && (
          <span className="text-xs text-red-400">
            {error}
          </span>
        )}
      </div>

      {!hasBookings && !loading && !error && (
        <p className="text-xs text-text-primary/50">
          Δεν υπάρχουν κρατήσεις σήμερα.
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 items-center">
        {/* Legend / numbers */}
        <div className="space-y-2">
          <LegendRow color="#22c55e" label="Check-ins" value={data.checkIns} />
          <LegendRow color="#f97373" label="Ακυρώσεις" value={data.cancels} />
          <LegendRow color="#a855f7" label="Απουσίες" value={data.noShows} />
          <LegendRow color="#38bdf8" label="Ενεργές κρατήσεις" value={data.active} />
        </div>

        {/* Pie */}
        <div className="h-64 md:h-72">
          <Pie data={chartData} options={options} />
        </div>
      </div>
    </div>
  )
}
