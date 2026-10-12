import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { ConcernPill, PageHeader, PageLoading, ReviewBadge } from '../components/ui'
import { concernCount, runSuitability } from '../lib/suitability'
import { getUnderlying } from '../lib/market'
import { formatDate, formatINR } from '../lib/format'

export function AnalysesTable({ limit, linkTo = 'analysis' }: { limit?: number; linkTo?: 'analysis' | 'report' }) {
  const { analyses, getClient, loading } = useStore()
  const navigate = useNavigate()
  const rows = limit ? analyses.slice(0, limit) : analyses

  if (loading) return <PageLoading />
  if (rows.length === 0) return <div className="card p-8 text-center text-sm text-navy/60">No analyses yet.</div>

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cream-dark text-left text-xs tracking-wider text-navy/50 uppercase">
            <th className="px-4 py-3 font-semibold">Client</th>
            <th className="px-4 py-3 font-semibold">Product</th>
            <th className="px-4 py-3 font-semibold">Underlying</th>
            <th className="hidden px-4 py-3 font-semibold sm:table-cell">Amount</th>
            <th className="hidden px-4 py-3 font-semibold md:table-cell">Date</th>
            <th className="px-4 py-3 font-semibold">Suitability</th>
            <th className="hidden px-4 py-3 font-semibold sm:table-cell">Review</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const c = getClient(a.clientId)
            if (!c) return null
            const concerns = a.concerns ?? concernCount(runSuitability(c.profile, a.product))
            return (
              <tr
                key={a.id}
                onClick={() => navigate(`/${linkTo}/${a.id}`)}
                className="cursor-pointer border-b border-cream-dark last:border-0 hover:bg-cream/60"
              >
                <td className="px-4 py-3 font-semibold">{c.name}</td>
                <td className="px-4 py-3">{a.product.tenorMonths}M Barrier RC</td>
                <td className="px-4 py-3">{getUnderlying(a.product.underlying).ticker}</td>
                <td className="hidden px-4 py-3 sm:table-cell">{formatINR(a.product.notional)}</td>
                <td className="hidden px-4 py-3 text-navy/60 md:table-cell">{formatDate(a.createdAt)}</td>
                <td className="px-4 py-3">
                  <ConcernPill count={concerns} />
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">{a.reviewStatus ? <ReviewBadge status={a.reviewStatus} /> : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function Analyses() {
  return (
    <div>
      <PageHeader title="Analyses" subtitle="Every product analysis you have run. Click a row to reopen it." />
      <AnalysesTable />
    </div>
  )
}
