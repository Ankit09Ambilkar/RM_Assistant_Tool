// ML estimate of the chance the underlying closes below the barrier at maturity (backend/ml/).
// Shown next to the volatility-only estimate so the RM can compare.
import { useEffect, useState } from 'react'
import { api, type BreachRisk } from '../lib/api'
import { getUnderlying } from '../lib/market'
import type { ProductTerms } from '../lib/types'
import { Spinner } from './ui'

const pct = (p: number) => `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`

export default function BreachRiskCard({ product }: { product: ProductTerms }) {
  const [data, setData] = useState<BreachRisk | null>(null)
  const [error, setError] = useState('')
  const key = `${product.underlying}|${product.barrierPct}|${product.tenorMonths}`

  useEffect(() => {
    let alive = true
    setData(null)
    setError('')
    api
      .breachRisk(product)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [key])

  const u = getUnderlying(product.underlying)
  const tone = !data ? '' : data.probability < 0.05 ? 'text-match' : data.probability < 0.15 ? 'text-warn' : 'text-bad'

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-widest text-navy/60 uppercase">Barrier-breach risk</h3>
        <span className="bg-accent rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-[#fbf3e6]">ML</span>
      </div>

      {!data && !error && (
        <div className="mt-4">
          <Spinner text="Scoring with the breach-risk model…" />
        </div>
      )}
      {error && <p className="mt-3 text-sm text-navy/60">Model unavailable ({error}).</p>}

      {data && (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <div className={`font-serif text-4xl ${tone}`}>{pct(data.probability)}</div>
              <div className="mt-1 text-xs text-navy/60">
                chance {u.name} closes below the {product.barrierPct}% barrier at maturity ({product.tenorMonths} months)
              </div>
            </div>
            <div className="text-sm">
              <div className="text-navy/55">Volatility-only estimate</div>
              <div className="font-semibold">{pct(data.baselineProbability)}</div>
            </div>
          </div>

          {data.factors.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-cream-dark pt-3">
              {data.factors.map((f) => (
                <li key={f.feature} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-navy/75">{f.label}</span>
                  <span className={`font-semibold ${f.effect > 0 ? 'text-bad' : 'text-match'}`}>
                    {f.effect > 0 ? '↑' : '↓'} {f.effect > 0 ? '+' : '−'}
                    {Math.abs(f.effect * 100).toFixed(1)} pts
                  </span>
                </li>
              ))}
            </ul>
          )}
          {data.outOfRange && <p className="mt-2 text-xs text-navy/55">Estimated at the nearest trained terms (barrier 50–90%, tenor 6–24 months).</p>}

          <p className="mt-3 text-[11px] text-navy/50">
            Gradient boosting · {data.model.nAssets} assets · {(data.model.nExamples / 1000).toFixed(0)}k historical examples · out-of-sample AUC{' '}
            {data.model.auc} (volatility-only {data.model.baselineAuc})
          </p>
        </>
      )}
    </div>
  )
}
