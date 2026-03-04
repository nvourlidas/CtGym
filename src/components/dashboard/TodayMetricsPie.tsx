// src/components/widgets/TodayBookingsPieWidget.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Pie } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { CalendarDays, Loader2, AlertTriangle, UserCheck, XCircle, UserX, Clock } from 'lucide-react'

ChartJS.register(ArcElement, Tooltip, Legend)

type Props = { tenantId: string }
type State = {
  sessions: number; totalBookings: number; checkIns: number;
  cancels: number; noShows: number; active: number;
}

function utcMidnightISO(d: Date) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)).toISOString()
}

const STAT_META = [
  { key: 'checkIns' as const, label: 'Check-ins',           color: '#22c55e', icon: UserCheck, textCls: 'text-success',   bgCls: 'bg-success/10  border-success/30'  },
  { key: 'active'   as const, label: 'Ενεργές κρατήσεις',  color: '#38bdf8', icon: Clock,     textCls: 'text-sky-400',   bgCls: 'bg-sky-400/10  border-sky-400/30'  },
  { key: 'cancels'  as const, label: 'Ακυρώσεις',           color: '#f97373', icon: XCircle,   textCls: 'text-danger',    bgCls: 'bg-danger/10   border-danger/30'   },
  { key: 'noShows'  as const, label: 'Απουσίες',            color: '#a855f7', icon: UserX,     textCls: 'text-purple-400', bgCls: 'bg-purple-400/10 border-purple-400/30' },
]

export default function TodayBookingsPieWidget({ tenantId }: Props) {
  const [data, setData]       = useState<State>({ sessions:0, totalBookings:0, checkIns:0, cancels:0, noShows:0, active:0 })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!tenantId) return
    const load = async () => {
      setLoading(true); setError(null)
      try {
        const now   = new Date()
        const from  = utcMidnightISO(now)
        const to    = utcMidnightISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))

        const { count: sessionsCount, error: sessErr } = await supabase
          .from('class_sessions').select('id', { count:'exact', head:true })
          .eq('tenant_id', tenantId).gte('starts_at', from).lt('starts_at', to)
        if (sessErr) throw sessErr

        const { count: totalCount, error: totErr } = await supabase
          .from('bookings').select('id, class_sessions!inner(starts_at)', { count:'exact', head:true })
          .eq('tenant_id', tenantId).gte('class_sessions.starts_at', from).lt('class_sessions.starts_at', to)
        if (totErr) throw totErr

        const [ciRes, cRes, nsRes] = await Promise.all([
          supabase.from('bookings').select('id, class_sessions!inner(starts_at)', { count:'exact', head:true }).eq('tenant_id', tenantId).eq('status','checked_in').gte('class_sessions.starts_at', from).lt('class_sessions.starts_at', to),
          supabase.from('bookings').select('id, class_sessions!inner(starts_at)', { count:'exact', head:true }).eq('tenant_id', tenantId).eq('status','canceled').gte('class_sessions.starts_at', from).lt('class_sessions.starts_at', to),
          supabase.from('bookings').select('id, class_sessions!inner(starts_at)', { count:'exact', head:true }).eq('tenant_id', tenantId).eq('status','no_show').gte('class_sessions.starts_at', from).lt('class_sessions.starts_at', to),
        ])
        if (ciRes.error) throw ciRes.error
        if (cRes.error)  throw cRes.error
        if (nsRes.error) throw nsRes.error

        const checkIns = ciRes.count ?? 0
        const cancels  = cRes.count  ?? 0
        const noShows  = nsRes.count ?? 0
        const total    = totalCount  ?? 0
        setData({ sessions: sessionsCount ?? 0, totalBookings: total, checkIns, cancels, noShows, active: Math.max(total - (checkIns + cancels + noShows), 0) })
      } catch (e: any) {
        setError(e?.message || 'Σφάλμα φόρτωσης')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tenantId])

  const hasBookings = data.totalBookings > 0

  const chartData = {
    labels: STAT_META.map((s) => s.label),
    datasets: [{
      data: hasBookings ? STAT_META.map((s) => data[s.key]) : [1, 0, 0, 0],
      backgroundColor: STAT_META.map((s) => s.color),
      borderWidth: 2,
      borderColor: 'rgba(0,0,0,0.25)',
      hoverBorderColor: 'rgba(255,255,255,0.2)',
    }],
  }

  const options: any = {
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            if (!hasBookings) return 'Καμία κράτηση σήμερα'
            const pct = data.totalBookings ? ((ctx.raw / data.totalBookings) * 100).toFixed(1) : '0.0'
            return `${ctx.label}: ${ctx.raw} (${pct}%)`
          },
        },
        backgroundColor: 'rgba(15,23,42,0.92)',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        padding: 10,
        titleFont: { weight: 'bold' },
        bodyFont: { size: 12 },
        cornerRadius: 10,
      },
    },
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    animation: { animateRotate: true, animateScale: true, duration: 600 },
  }

  // Centre label plugin
  const centerTextPlugin = {
    id: 'centerText',
    afterDraw(chart: any) {
      const { ctx, chartArea: { top, bottom, left, right } } = chart
      const cx = (left + right) / 2
      const cy = (top + bottom) / 2
      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.font = 'bold 22px system-ui'
      ctx.fillText(hasBookings ? String(data.totalBookings) : '0', cx, cy - 8)
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = '11px system-ui'
      ctx.fillText('κρατήσεις', cx, cy + 12)
      ctx.restore()
    },
  }

  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/10 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <CalendarDays className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-black text-text-primary tracking-tight">Παρουσίες & Κρατήσεις Σήμερα</h3>
            <div className="flex items-center gap-3 mt-0.5 text-[11px] text-text-secondary">
              <span>Συνεδρίες: <span className="font-bold text-text-primary">{loading ? '…' : data.sessions}</span></span>
              <span className="opacity-30">·</span>
              <span>Κρατήσεις: <span className="font-bold text-text-primary">{loading ? '…' : data.totalBookings}</span></span>
            </div>
          </div>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-text-secondary shrink-0 mt-1" />}
        {error && (
          <div className="flex items-center gap-1.5 text-xs text-danger shrink-0">
            <AlertTriangle className="h-3.5 w-3.5" />{error}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-5">
        {!hasBookings && !loading && !error && (
          <div className="flex flex-col items-center gap-2 py-6 text-text-secondary">
            <CalendarDays className="h-7 w-7 opacity-20" />
            <span className="text-xs">Δεν υπάρχουν κρατήσεις σήμερα.</span>
          </div>
        )}

        {(hasBookings || loading) && (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-6 items-center">
            {/* Stat chips */}
            <div className="grid grid-cols-2 gap-2">
              {STAT_META.map(({ key, label, icon: Icon, textCls, bgCls }) => {
                const val  = data[key]
                const pct  = hasBookings ? ((val / data.totalBookings) * 100).toFixed(0) : '0'
                return (
                  <div key={key} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border ${bgCls}`}>
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${textCls}`} />
                    <div className="min-w-0">
                      <div className={`text-lg font-black leading-tight ${textCls}`}>{loading ? '…' : val}</div>
                      <div className="text-[10.5px] text-text-secondary leading-snug">{label}</div>
                      {hasBookings && !loading && (
                        <div className={`text-[10px] font-semibold ${textCls} opacity-70`}>{pct}%</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Donut */}
            <div className="h-44 md:h-48 flex items-center justify-center">
              <Pie data={chartData} options={options} plugins={[centerTextPlugin]} />
            </div>
          </div>
        )}

        {/* Compact bar breakdown */}
        {hasBookings && !loading && (
          <div className="mt-4 space-y-1.5">
            {STAT_META.map(({ key, label, color }) => {
              const val = data[key]
              const pct = data.totalBookings ? (val / data.totalBookings) * 100 : 0
              return (
                <div key={key} className="flex items-center gap-2.5">
                  <div className="w-24 shrink-0 text-[11px] text-text-secondary truncate">{label}</div>
                  <div className="flex-1 h-1.5 rounded-full bg-secondary/20 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <div className="w-6 text-right text-[11px] font-bold text-text-primary shrink-0">{val}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}