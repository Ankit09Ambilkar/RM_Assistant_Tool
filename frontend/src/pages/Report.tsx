// Printable summary report. "Export" = browser print → Save as PDF (no server-side generation needed).
import { Navigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { KV, PageHeader, PageLoading, StatusBadge } from '../components/ui'
import { Logo } from '../components/Layout'
import { presetScenarios } from '../lib/payoff'
import { runSuitability } from '../lib/suitability'
import { useExplanation, useInsights } from '../lib/useAnalysisAI'
import type { ClientProfile, ProductTerms, SuitabilityResult } from '../lib/types'
import { getUnderlying } from '../lib/market'
import { formatDate, formatINR, formatPct, formatSignedINR } from '../lib/format'

export default function Report() {
  const { analysisId } = useParams()
  const { getAnalysis, getClient, rmName, loading } = useStore()
  const a = getAnalysis(analysisId)
  const client = getClient(a?.clientId)
  if (loading) return <PageLoading />
  if (!a || !client) return <Navigate to="/reports" replace />

  const p = a.product
  const c = client.profile
  const u = getUnderlying(p.underlying)
  const suit = runSuitability(c, p)

  const H = ({ children }: { children: string }) => <h2 className="mt-8 mb-3 border-b-2 border-navy pb-1 text-sm font-bold tracking-widest uppercase">{children}</h2>

  return (
    <div>
      <div className="no-print">
        <PageHeader
          back={{ to: `/analysis/${a.id}`, label: 'Back to analysis' }}
          title="Report preview"
          right={
            <button onClick={() => window.print()} className="btn-primary">
              Print / Save as PDF
            </button>
          }
        />
      </div>

      <div className="card mx-auto max-w-3xl p-8 print:border-0 print:shadow-none">
        <div className="flex items-start justify-between">
          <Logo />
          <div className="text-right text-xs text-navy/60">
            <div>Generated {formatDate(new Date().toISOString())}</div>
            <div>RM: {rmName}</div>
          </div>
        </div>
        <h1 className="mt-6 font-serif text-2xl font-normal">Structured Product Analysis</h1>
        <p className="text-sm text-navy/60">
          Prepared for {client.name} · {p.tenorMonths}-month {p.productType} on {u.name}
        </p>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <H>Client profile</H>
            <KV k="Goal" v={c.goal} />
            <KV k="Horizon" v={c.horizon} />
            <KV k="Risk appetite" v={c.riskAppetite} />
            <KV k="Max comfortable loss" v={`${c.maxLossPct}%`} />
            <KV k="Sector exposure" v={`${c.sectorExposurePct}%`} />
          </div>
          <div>
            <H>Product terms</H>
            <KV k="Underlying" v={`${u.name} (${u.ticker})`} />
            <KV k="Investment" v={formatINR(p.notional)} />
            <KV k="Coupon" v={`${p.couponPct}% p.a.`} />
            <KV k="Barrier / Strike" v={`${p.barrierPct}% / ${p.strikePct}%`} />
            <KV k="Tenor" v={`${p.tenorMonths} months`} />
          </div>
        </div>

        <H>Scenarios at maturity (illustrative)</H>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-navy/50 uppercase">
              <th className="py-1">Scenario</th>
              <th className="py-1 text-right">Final value</th>
              <th className="py-1 text-right">P/L</th>
              <th className="py-1 text-right">Return</th>
            </tr>
          </thead>
          <tbody>
            {presetScenarios(p).map((s) => (
              <tr key={s.name} className="border-t border-cream-dark">
                <td className="py-1.5">{s.name}</td>
                <td className="py-1.5 text-right">{formatINR(s.finalValue)}</td>
                <td className={`py-1.5 text-right ${s.pnl < 0 ? 'text-bad' : ''}`}>{formatSignedINR(s.pnl)}</td>
                <td className={`py-1.5 text-right ${s.pnl < 0 ? 'text-bad' : ''}`}>{formatPct(s.returnPct, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <H>Suitability</H>
        {suit.map((s) => (
          <div key={s.dimension} className="border-b border-cream-dark py-2 text-sm last:border-0">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{s.dimension}</span>
              <StatusBadge status={s.status} />
            </div>
            <p className="mt-0.5 text-navy/70">{s.reason}</p>
          </div>
        ))}

        <AISections c={c} p={p} suit={suit} H={H} />

      </div>
    </div>
  )
}

function AISections({ c, p, suit, H }: { c: ClientProfile; p: ProductTerms; suit: SuitabilityResult[]; H: (x: { children: string }) => React.ReactElement }) {
  const insights = useInsights(c, p, suit)
  const explanation = useExplanation(c, p, suit)
  return (
    <>
      <H>Key insights</H>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {insights.data.map((i) => (
          <li key={i.title}>
            <span className="font-semibold">{i.title}:</span> {i.text}
          </li>
        ))}
      </ol>
      <H>Client explanation</H>
      <p className="text-sm leading-relaxed">{explanation.data}</p>
    </>
  )
}
