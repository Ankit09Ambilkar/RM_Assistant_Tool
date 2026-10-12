// Real market context from the backend (Yahoo Finance via yfinance). Historical data, not a prediction.
import { useState } from 'react'
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMarket } from '../lib/api'
import { TOOLTIP } from '../lib/chart'
import type { ProductTerms } from '../lib/types'
import { Spinner } from './ui'

const PERIODS = ['3mo', '6mo', '1y', '2y', '5y'] as const

function money(v: number, currency: string) {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v)
}

export default function MarketCard({ ticker, product, compact = false }: { ticker: string; product?: ProductTerms; compact?: boolean }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('1y')
  const { data, loading, error } = useMarket(ticker, period)

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-widest text-navy/60 uppercase">{compact ? 'Market reference' : 'Historical context'}</h3>
        {!compact && (
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`cursor-pointer rounded-md px-2 py-0.5 text-xs font-semibold ${period === p ? 'bg-accent text-[#ffffff]' : 'text-navy/50 hover:text-navy'}`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <Spinner text="Fetching real market data…" />}
      {error && <p className="text-sm text-navy/60">Market data unavailable ({error}). Is the backend running?</p>}

      {data && !loading && (
        <>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <div className="text-xs text-navy/50">
                {data.name} · {data.symbol}
              </div>
              <div className="text-2xl font-semibold">{money(data.lastPrice, data.currency)}</div>
            </div>
            <div className="text-sm">
              <span className={data.periodChangePct < 0 ? 'text-bad' : 'text-match'}>
                {data.periodChangePct > 0 ? '+' : ''}
                {data.periodChangePct}%
              </span>
              <span className="text-navy/50"> over {data.period.toUpperCase()}</span>
            </div>
            {data.annualVolatilityPct != null && (
              <div className="text-sm">
                <span className="font-semibold">{data.annualVolatilityPct}%</span>
                <span className="text-navy/50"> annualised volatility</span>
              </div>
            )}
          </div>

          <div className={compact ? 'mt-3 h-24' : 'mt-4 h-56'}>
            <ResponsiveContainer>
              <AreaChart data={data.history} margin={{ top: 5, right: compact ? 0 : 60, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`g-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8c3a24" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#8c3a24" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide={compact} tick={{ fontSize: 11, fill: '#1d334099' }} minTickGap={50} />
                <YAxis hide={compact} domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#1d334099' }} width={60} tickFormatter={(v) => Math.round(v).toLocaleString()} />
                <Tooltip formatter={(v: number) => [money(v, data.currency), 'Close']} contentStyle={TOOLTIP} />
                <Area type="monotone" dataKey="close" stroke="#8c3a24" strokeWidth={1.8} fill={`url(#g-${ticker})`} isAnimationActive={false} />
                {product && !compact && (
                  <ReferenceLine y={(data.lastPrice * product.strikePct) / 100} ifOverflow="extendDomain" stroke="#1d3340" strokeDasharray="2 4" label={{ value: `Strike ${product.strikePct}%`, position: 'right', fontSize: 11, fill: '#1d3340' }} />
                )}
                {product && !compact && (
                  <ReferenceLine y={(data.lastPrice * product.barrierPct) / 100} ifOverflow="extendDomain" stroke="#b83232" strokeDasharray="4 4" label={{ value: `Barrier ${product.barrierPct}%`, position: 'right', fontSize: 11, fill: '#b83232' }} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {product && !compact && (
            <p className="mt-2 text-xs text-navy/60">
              If the product started at today's price, the barrier would sit at <b>{money((data.lastPrice * product.barrierPct) / 100, data.currency)}</b>.
              {' '}
              {data.periodLow < (data.lastPrice * product.barrierPct) / 100
                ? `In this period the price did go below that level (low ${money(data.periodLow, data.currency)}).`
                : `In this period the price stayed above that level (low ${money(data.periodLow, data.currency)}).`}
            </p>
          )}
        </>
      )}
    </div>
  )
}
