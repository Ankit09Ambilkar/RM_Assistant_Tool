import { useEffect, useState } from 'react'
import { TOOLTIP } from '../../lib/chart'
import { Link } from 'react-router-dom'
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type AdminStats } from '../../lib/api'
import { PageHeader, PageLoading } from '../../components/ui'
import { BackendDown } from './AdminLayout'
import { formatINR } from '../../lib/format'

const STATUS = [
  { key: 'MATCH', label: '✓ Match', color: '#2f7d4f' },
  { key: 'WARNING', label: '⚠ Warning', color: '#a86a12' },
  { key: 'MISMATCH', label: '✕ Mismatch', color: '#b83232' },
] as const

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.adminStats().then(setStats).catch((e) => setError(e.message))
  }, [])

  if (error) return <BackendDown error={error} />
  if (!stats) return <PageLoading />

  const tiles = [
    { label: 'Active RMs', value: `${stats.rms.active}`, sub: `of ${stats.rms.total} total`, to: '/admin/rms' },
    { label: 'Clients', value: `${stats.clients}`, sub: 'across all RMs' },
    { label: 'Analyses', value: `${stats.analyses}`, sub: `${formatINR(stats.totalNotional)} proposed` },
    { label: 'Pending review', value: `${stats.reviews.Pending}`, sub: `${stats.reviews.Flagged} flagged · ${stats.reviews.Approved} approved`, to: '/admin/reviews', tone: 'text-warn' },
    { label: 'With concerns', value: `${stats.withConcerns}`, sub: 'at least one suitability flag', tone: 'text-bad' },
    { label: 'Total AUM', value: `₹${stats.totalAumCr.toLocaleString('en-IN')} Cr`, sub: 'managed by RMs' },
  ]

  const perRm = [...stats.perRm].sort((a, b) => b.analyses - a.analyses).map((r) => ({ ...r, short: r.name.split(' ')[0] }))
  const dims = Object.entries(stats.suitabilityByDimension).map(([dimension, v]) => ({ dimension, ...v }))

  return (
    <div>
      <PageHeader title="Admin Dashboard" subtitle="Platform overview across all relationship managers" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {tiles.map((t) => {
          const inner = (
            <>
              <div className="text-xs font-semibold tracking-wider text-navy/50 uppercase">{t.label}</div>
              <div className={`mt-1 font-serif text-4xl ${t.tone ?? ''}`}>{t.value}</div>
              <div className="mt-0.5 text-xs text-navy/50">{t.sub}</div>
            </>
          )
          return t.to ? (
            <Link key={t.label} to={t.to} className="card p-5 transition hover:border-navy">
              {inner}
            </Link>
          ) : (
            <div key={t.label} className="card p-5">
              {inner}
            </div>
          )
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="text-xs font-bold tracking-widest text-navy/60 uppercase">Analyses per RM</h3>
          <div className="mt-3 h-64">
            <ResponsiveContainer>
              <BarChart data={perRm} layout="vertical" margin={{ left: 10, right: 40 }} barCategoryGap={6}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="short" width={70} tick={{ fontSize: 12, fill: '#1d3340' }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: '#1d33400d' }}
                  contentStyle={TOOLTIP}
                  formatter={(v: number, _n, item) => [`${v} analyses · ${item.payload.clients} clients · ${item.payload.pending} pending`, item.payload.name]}
                  labelFormatter={() => ''}
                />
                <Bar dataKey="analyses" fill="#8c3a24" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  <LabelList dataKey="analyses" position="right" style={{ fontSize: 12, fill: '#1d3340' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold tracking-widest text-navy/60 uppercase">Suitability results by dimension</h3>
            <div className="flex gap-3 text-xs text-navy/70">
              {STATUS.map((s) => (
                <span key={s.key} className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-3 h-64">
            <ResponsiveContainer>
              <BarChart data={dims} layout="vertical" margin={{ left: 10, right: 10 }} barCategoryGap={10}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="dimension" width={120} tick={{ fontSize: 12, fill: '#1d3340' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#1d33400d' }} contentStyle={TOOLTIP} />
                {STATUS.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stackId="a"
                    fill={s.color}
                    stroke="#f8f4ea"
                    strokeWidth={2}
                    maxBarSize={24}
                    radius={i === STATUS.length - 1 ? [0, 4, 4, 0] : 0}
                  >
                    <LabelList dataKey={s.key} position="center" style={{ fontSize: 11, fill: "#ffffff", fontWeight: 700 }} formatter={(v: number) => (v ? v : '')} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card mt-6 overflow-x-auto">
        <div className="flex items-center justify-between border-b border-cream-dark px-5 py-4">
          <h3 className="text-xs font-bold tracking-widest text-navy/60 uppercase">RM workload</h3>
          <Link to="/admin/reviews" className="text-xs font-semibold text-navy/60 hover:text-navy">
            Review queue →
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs tracking-wider text-navy/50 uppercase">
              <th className="px-5 py-2 font-semibold">RM</th>
              <th className="px-5 py-2 text-right font-semibold">Clients</th>
              <th className="px-5 py-2 text-right font-semibold">Analyses</th>
              <th className="px-5 py-2 text-right font-semibold">Pending review</th>
            </tr>
          </thead>
          <tbody>
            {stats.perRm.map((r) => (
              <tr key={r.id} className="border-t border-cream-dark">
                <td className="px-5 py-2.5 font-medium">{r.name}</td>
                <td className="px-5 py-2.5 text-right">{r.clients}</td>
                <td className="px-5 py-2.5 text-right">{r.analyses}</td>
                <td className={`px-5 py-2.5 text-right ${r.pending ? 'font-semibold text-warn' : 'text-navy/40'}`}>{r.pending}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
