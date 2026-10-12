import { useState } from 'react'
import { TOOLTIP } from '../lib/chart'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '../store'
import { AIBadge, KV, PageHeader, PageLoading, Spinner, StatusBadge, StatusIcon, Why } from '../components/ui'
import { useInsights, useExplanation } from '../lib/useAnalysisAI'
import { api, browserEngine, useEngine } from '../lib/api'
import MarketCard from '../components/MarketCard'
import BreachRiskCard from '../components/BreachRiskCard'
import { concernCount } from '../lib/suitability'
import { validateProduct } from '../lib/validate'
import { ReviewBadge } from '../components/ui'
import { clientExplanation } from '../lib/insights'
import { TENORS, UNDERLYINGS, getUnderlying } from '../lib/market'
import { formatINR, formatLakh, formatPct, formatSignedINR } from '../lib/format'
import type { Analysis as AnalysisT, Client, ClientProfile, EngineResult, ProductTerms, ScenarioResult, SuitabilityResult } from '../lib/types'

const TABS = ['Overview', 'Payoff', 'Suitability', 'AI Insights', 'Explain to Client'] as const
type Tab = (typeof TABS)[number]

export default function Analysis() {
  const { analysisId } = useParams()
  const { getAnalysis, getClient, loading } = useStore()
  const analysis = getAnalysis(analysisId)
  const client = getClient(analysis?.clientId)

  if (loading) return <PageLoading />
  if (!analysis || !client) return <Navigate to="/analyses" replace />
  return <AnalysisView analysis={analysis} client={client} />
}

function AnalysisView({ analysis, client }: { analysis: AnalysisT; client: Client }) {
  const [tab, setTab] = useState<Tab>('Overview')
  const p = analysis.product
  const c = client.profile
  // Payoff + suitability come from the Python engine and are recalculated whenever the terms change.
  const { result } = useEngine(c, p)
  const suit = result.suitability
  const u = getUnderlying(p.underlying)

  return (
    <div>
      <PageHeader
        back={{ to: '/dashboard', label: 'Dashboard' }}
        title="Product Analysis"
        subtitle={`${client.name} · ${p.tenorMonths}-month ${p.productType} on ${u.name}`}
        right={
          <div className="no-print flex gap-2">
            <Link to={`/configure/${client.id}?analysis=${analysis.id}`} className="btn-ghost">
              Edit terms
            </Link>
            <Link to={`/report/${analysis.id}`} className="btn-primary">
              Export report
            </Link>
          </div>
        }
      />

      <div className="no-print mb-4 flex flex-wrap items-center gap-3 text-xs">
        {analysis.reviewStatus && (
          <span className="flex items-center gap-1.5 text-navy/60">
            Admin review: <ReviewBadge status={analysis.reviewStatus} />
          </span>
        )}
      </div>
      {analysis.reviewStatus === 'Flagged' && analysis.reviewNote && (
        <div className="no-print mb-4 rounded-lg border border-bad/30 bg-bad/5 px-4 py-3 text-sm">
          <span className="font-semibold text-bad">Flagged by reviewer:</span> {analysis.reviewNote}
        </div>
      )}

      <div className="no-print mb-6 flex gap-1 overflow-x-auto rounded-full bg-cream-dark/70 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 cursor-pointer rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition ${
              tab === t ? 'bg-white shadow-sm' : 'text-navy/60 hover:text-navy'
            }`}
          >
            {t}
            {t === 'Suitability' && result.concerns > 0 && (
              <span className="ml-1.5 rounded-full bg-warn/15 px-1.5 text-xs text-warn">{result.concerns}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <Overview p={p} c={c} r={result} go={setTab} />}
      {tab === 'Payoff' && <Payoff p={p} r={result} />}
      {tab === 'Suitability' && <Suitability suit={suit} />}
      {tab === 'AI Insights' && <Insights p={p} c={c} suit={suit} analysisId={analysis.id} />}
      {tab === 'Explain to Client' && <Explain p={p} c={c} suit={suit} analysisId={analysis.id} />}
    </div>
  )
}

function Overview({ p, c, r, go }: { p: ProductTerms; c: ClientProfile; r: EngineResult; go: (t: Tab) => void }) {
  const u = getUnderlying(p.underlying)
  const suit = r.suitability
  const concerns = r.concerns
  const flat = r.scenarios.find((s) => s.movePct === 0)!
  const breach = r.scenarios[r.scenarios.length - 1]
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="card p-5">
        <h3 className="mb-2 text-xs font-bold tracking-widest text-navy/60 uppercase">Product terms</h3>
        <KV k="Underlying" v={`${u.name} (${u.ticker})`} />
        <KV k="Type" v={p.productType} />
        <KV k="Investment" v={formatINR(p.notional)} />
        <KV k="Tenor" v={`${p.tenorMonths} months`} />
        <KV k="Coupon" v={`${p.couponPct}% p.a.`} />
        <KV k="Barrier" v={`${p.barrierPct}%`} />
        <KV k="Strike" v={`${p.strikePct}%`} />
      </div>
      <div className="space-y-4 lg:col-span-2">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Max return" value={formatINR(flat.pnl)} sub={`${formatPct(flat.returnPct, true)} if barrier holds`} tone="good" />
          <Stat label="Loss at barrier breach" value={`~${Math.abs(breach.returnPct).toFixed(0)}%`} sub={`Client limit: ${c.maxLossPct}%`} tone="bad" />
          <Stat label="Suitability" value={concerns === 0 ? 'All clear' : `${concerns} concerns`} sub="4 dimensions checked" tone={concerns ? 'warn' : 'good'} />
        </div>
        <BreachRiskCard product={p} />
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold tracking-widest text-navy/60 uppercase">Suitability summary</h3>
            <button onClick={() => go('Suitability')} className="cursor-pointer text-xs font-semibold text-navy/60 hover:text-navy">
              Details →
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {suit.map((s) => (
              <div key={s.dimension} className="flex items-center justify-between rounded-lg bg-cream/60 px-3 py-2 text-sm">
                <span className="font-medium">{s.dimension}</span>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold tracking-widest text-navy/60 uppercase">Quick scenarios</h3>
            <button onClick={() => go('Payoff')} className="cursor-pointer text-xs font-semibold text-navy/60 hover:text-navy">
              Simulator →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {r.scenarios
              .filter((s) => [10, 0, -20, -40].includes(s.movePct))
              .map((s) => (
                <ScenarioCard key={s.name} s={s} />
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'good' | 'warn' | 'bad' }) {
  const color = { good: 'text-match', warn: 'text-warn', bad: 'text-bad' }[tone]
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold tracking-wider text-navy/50 uppercase">{label}</div>
      <div className={`mt-1 font-serif text-2xl whitespace-nowrap ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs text-navy/50">{sub}</div>
    </div>
  )
}

function ScenarioCard({ s, active, onClick }: { s: ScenarioResult; active?: boolean; onClick?: () => void }) {
  const loss = s.returnPct < 0
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition ${onClick ? 'cursor-pointer hover:border-navy' : 'cursor-default'} ${
        active ? 'border-navy bg-accent text-[#ffffff]' : 'border-cream-dark bg-white'
      }`}
    >
      <div className={`text-[11px] font-bold tracking-wider uppercase ${active ? 'text-[#ffffff]/70' : 'text-navy/50'}`}>{s.name}</div>
      <div className="mt-1 text-lg font-semibold">{formatLakh(s.finalValue)}</div>
      <div className={`text-sm font-semibold ${active ? '' : loss ? 'text-bad' : 'text-match'}`}>
        {loss && '⚠ '}
        {formatPct(s.returnPct, true)}
      </div>
    </button>
  )
}

function Payoff({ p, r }: { p: ProductTerms; r: EngineResult }) {
  const [move, setMove] = useState(-20)
  const curve = r.curve
  const presets = r.scenarios
  // Custom scenario is read off the engine's payoff curve (1% steps), so the browser does no payoff maths.
  const point = curve.find((pt) => pt.level === 100 + move) ?? curve[curve.length - 1]
  const pnl = point.value - p.notional
  const sel = { finalValue: point.value, pnl, returnPct: (pnl / p.notional) * 100, barrierBreached: 100 + move < p.barrierPct }

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold tracking-widest text-navy/60 uppercase">Payoff simulator</h3>
          <span className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-semibold text-navy/60">Illustrative · value at maturity</span>
        </div>
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart data={curve} margin={{ top: 28, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid stroke="#d9cdb2" strokeDasharray="3 3" />
              <XAxis
                dataKey="level"
                type="number"
                domain={[0, 150]}
                ticks={[0, 25, 50, 75, 100, 125, 150]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 12, fill: '#1d334099' }}
                label={{ value: 'Underlying at maturity (% of initial)', position: 'insideBottom', offset: -12, fontSize: 12, fill: '#1d334099' }}
              />
              <YAxis tickFormatter={(v) => formatLakh(v)} tick={{ fontSize: 12, fill: '#1d334099' }} width={70} />
              <Tooltip
                formatter={(v: number) => [formatINR(v), 'Final value']}
                labelFormatter={(l) => `Underlying at ${l}%`}
                contentStyle={TOOLTIP}
              />
              <ReferenceLine y={p.notional} stroke="#1d334055" strokeDasharray="4 4" label={{ value: 'Invested', position: 'insideTopLeft', fontSize: 11, fill: '#1d334099' }} />
              <ReferenceLine x={p.barrierPct} stroke="#b83232" strokeDasharray="4 4" label={{ value: `Barrier ${p.barrierPct}%`, position: 'top', fontSize: 11, fill: '#b83232' }} />
              <ReferenceLine x={p.strikePct} stroke="#1d3340" strokeDasharray="2 4" label={{ value: `Strike ${p.strikePct}%`, position: 'top', fontSize: 11, fill: '#1d3340' }} />
              <Line type="linear" dataKey="value" stroke="#8c3a24" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              <ReferenceDot x={100 + move} y={sel.finalValue} r={7} fill={sel.returnPct < 0 ? '#b83232' : '#2f7d4f'} stroke="white" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs font-semibold text-navy/60">
            <span>−60%</span>
            <span>
              Market scenario: <span className="text-navy">{formatPct(move, true)}</span>
            </span>
            <span>+50%</span>
          </div>
          <input type="range" min={-60} max={50} value={move} onChange={(e) => setMove(Number(e.target.value))} className="w-full accent-navy" />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4 rounded-lg bg-cream/60 p-4 text-center">
          <div>
            <div className="text-xs text-navy/50">Final value</div>
            <div className="text-lg font-semibold">{formatINR(sel.finalValue)}</div>
          </div>
          <div>
            <div className="text-xs text-navy/50">Profit / Loss</div>
            <div className={`text-lg font-semibold ${sel.pnl < 0 ? 'text-bad' : 'text-match'}`}>{formatSignedINR(sel.pnl)}</div>
          </div>
          <div>
            <div className="text-xs text-navy/50">Return</div>
            <div className={`text-lg font-semibold ${sel.pnl < 0 ? 'text-bad' : 'text-match'}`}>{formatPct(sel.returnPct, true)}</div>
          </div>
        </div>
        {sel.barrierBreached && <p className="mt-2 text-center text-xs font-semibold text-bad">Barrier breached: capital is no longer protected</p>}
      </div>

      <div>
        <h3 className="mb-3 text-xs font-bold tracking-widest text-navy/60 uppercase">Preset scenarios (click to simulate)</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {presets.map((s) => (
            <ScenarioCard key={s.name} s={s} active={s.movePct === move} onClick={() => setMove(s.movePct)} />
          ))}
        </div>
      </div>
      <MarketCard ticker={p.underlying} product={p} />
    </div>
  )
}

function Suitability({ suit }: { suit: SuitabilityResult[] }) {
  const n = concernCount(suit)
  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-cream-dark px-5 py-4">
        <h3 className="text-xs font-bold tracking-widest text-navy/60 uppercase">Client suitability</h3>
        <span className={`text-sm font-bold ${n ? 'text-warn' : 'text-match'}`}>{n ? `${n} CONCERNS` : 'NO CONCERNS'}</span>
      </div>
      {suit.map((s) => (
        <div key={s.dimension} className="flex gap-4 border-b border-cream-dark px-5 py-4 last:border-0">
          <StatusIcon status={s.status} />
          <div className="flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{s.dimension}</span>
              <StatusBadge status={s.status} />
            </div>
            <p className="mt-1 text-sm text-navy/70">{s.reason}</p>
            {s.action && <p className="mt-1 text-sm font-medium text-navy">→ Next step: {s.action}</p>}
          </div>
        </div>
      ))}
      <p className="px-5 py-3 text-xs text-navy/50">Rule-based checks. The RM makes the final judgment.</p>
    </div>
  )
}

function Insights({ p, c, suit, analysisId }: { p: ProductTerms; c: ClientProfile; suit: SuitabilityResult[]; analysisId: string }) {
  const [exploring, setExploring] = useState(false)
  const ai = useInsights(c, p, suit)
  const insights = ai.data
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2 border-b border-cream-dark px-5 py-4">
        <AIBadge source={ai.loading ? undefined : ai.source} />
        <h3 className="text-xs font-bold tracking-widest text-navy/60 uppercase">AI insights</h3>
        <div className="ml-auto flex items-center gap-3">
          {ai.loading ? (
            <Spinner text="AI is analysing the results…" />
          ) : (
            <button onClick={ai.regenerate} className="cursor-pointer text-xs font-semibold text-navy/50 hover:text-navy">
              ↻ Regenerate
            </button>
          )}
        </div>
      </div>
      {ai.error && <p className="border-b border-cream-dark px-5 py-2 text-xs text-warn">Grok unavailable ({ai.error}). Showing demo insights.</p>}
      {insights.map((ins, i) => (
        <div key={ins.title + i} className={`border-b border-cream-dark px-5 py-4 transition last:border-0 ${ai.loading ? 'opacity-40' : ''}`}>
          <div className="flex gap-4">
            <span className="font-serif text-2xl font-normal text-navy/25">{String(i + 1).padStart(2, '0')}</span>
            <div className="flex-1">
              <div className="text-sm font-bold tracking-wide uppercase">{ins.title}</div>
              <p className="mt-1 text-sm text-navy/80">{ins.text}</p>
              {ins.why && <Why text={ins.why} />}
            </div>
          </div>
        </div>
      ))}
      <div className="flex justify-center p-5">
        <button onClick={() => setExploring(true)} className="btn-primary">
          Explore alternatives
        </button>
      </div>
      {exploring && <Alternatives p={p} c={c} analysisId={analysisId} onClose={() => setExploring(false)} />}
    </div>
  )
}

function Alternatives({ p, c, analysisId, onClose }: { p: ProductTerms; c: ClientProfile; analysisId: string; onClose: () => void }) {
  const { updateAnalysis } = useStore()
  const navigate = useNavigate()
  const [alt, setAlt] = useState<ProductTerms>({
    ...p,
    underlying: getUnderlying(p.underlying).kind === 'Index' ? p.underlying : 'SPX',
    barrierPct: Math.max(40, p.barrierPct - 10),
    couponPct: Math.max(1, p.couponPct - 3),
    tenorMonths: 18,
  })
  const [calculated, setCalculated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [applyError, setApplyError] = useState('')
  const altErrors = Object.values(validateProduct(alt))
  const num = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const show = (n: number) => (Number.isNaN(n) ? '' : n)
  const [results, setResults] = useState<{ cur: SuitabilityResult[]; alt: SuitabilityResult[] } | null>(null)
  const curSuit = results?.cur ?? []
  const altSuit = results?.alt ?? []

  async function recalculate() {
    if (altErrors.length) return
    const run = (prod: ProductTerms) => api.analyze(c, prod).catch(() => browserEngine(c, prod))
    const [cur, next] = await Promise.all([run(p), run(alt)])
    setResults({ cur: cur.suitability, alt: next.suitability })
    setCalculated(true)
  }

  const row = (label: string, cur: string, input: React.ReactNode) => (
    <div className="grid grid-cols-[1fr_1fr_auto_1.3fr] items-center gap-3 border-b border-cream-dark py-2.5 text-sm">
      <span className="text-navy/60">{label}</span>
      <span className="font-semibold">{cur}</span>
      <span className="text-navy/40">→</span>
      {input}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-navy/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-xl font-normal">Explore alternatives</h3>
        <p className="mb-4 text-sm text-navy/60">Change the terms and recalculate to compare the fit.</p>
        <div className="grid grid-cols-[1fr_1fr_auto_1.3fr] gap-3 text-xs font-bold tracking-wider text-navy/50 uppercase">
          <span />
          <span>Current</span>
          <span />
          <span>Alternative</span>
        </div>
        {row(
          'Underlying',
          getUnderlying(p.underlying).name,
          <select className="input py-1.5" value={alt.underlying} onChange={(e) => (setAlt((prev) => ({ ...prev, underlying: e.target.value })), setCalculated(false))}>
            {UNDERLYINGS.map((u) => (
              <option key={u.ticker} value={u.ticker}>
                {u.name}
              </option>
            ))}
          </select>,
        )}
        {row('Barrier', `${p.barrierPct}%`, <input type="number" className="input py-1.5" value={show(alt.barrierPct)} onChange={(e) => (setAlt((prev) => ({ ...prev, barrierPct: num(e.target.value) })), setCalculated(false))} />)}
        {row('Coupon', `${p.couponPct}%`, <input type="number" step={0.5} className="input py-1.5" value={show(alt.couponPct)} onChange={(e) => (setAlt((prev) => ({ ...prev, couponPct: num(e.target.value) })), setCalculated(false))} />)}
        {row(
          'Tenor',
          `${p.tenorMonths} mo`,
          <select className="input py-1.5" value={alt.tenorMonths} onChange={(e) => (setAlt((prev) => ({ ...prev, tenorMonths: Number(e.target.value) })), setCalculated(false))}>
            {TENORS.map((t) => (
              <option key={t} value={t}>
                {t} mo
              </option>
            ))}
          </select>,
        )}

        {altErrors.length > 0 && (
          <ul className="mt-3 space-y-0.5 text-sm text-bad">
            {altErrors.map((e) => (
              <li key={e}>• {e}</li>
            ))}
          </ul>
        )}
        {applyError && <p className="mt-3 text-sm text-bad">Could not apply: {applyError}</p>}
        {calculated && (
          <div className="mt-4 rounded-lg bg-cream/60 p-4">
            <div className="mb-2 grid grid-cols-3 text-xs font-bold tracking-wider text-navy/50 uppercase">
              <span>Dimension</span>
              <span>Current</span>
              <span>Alternative</span>
            </div>
            {curSuit.map((s, i) => (
              <div key={s.dimension} className="grid grid-cols-3 items-center py-1 text-sm">
                <span>{s.dimension}</span>
                <span>
                  <StatusBadge status={s.status} />
                </span>
                <span>
                  <StatusBadge status={altSuit[i].status} />
                </span>
              </div>
            ))}
            <div className="mt-2 grid grid-cols-3 border-t border-cream-dark pt-2 text-sm font-semibold">
              <span>Concerns</span>
              <span>{concernCount(curSuit)}</span>
              <span>{concernCount(altSuit)}</span>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">
            Close
          </button>
          {!calculated ? (
            <button onClick={recalculate} disabled={altErrors.length > 0} className="btn-primary">
              Recalculate
            </button>
          ) : (
            <button
              disabled={busy || altErrors.length > 0}
              onClick={async () => {
                setBusy(true)
                setApplyError('')
                try {
                  await updateAnalysis(analysisId, alt)
                  onClose()
                  navigate(`/analysis/${analysisId}`)
                } catch (e) {
                  setApplyError((e as Error).message)
                  setBusy(false)
                }
              }}
              className="btn-primary"
            >
              Apply alternative
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Explain({ p, c, suit, analysisId }: { p: ProductTerms; c: ClientProfile; suit: SuitabilityResult[]; analysisId: string }) {
  const ex = clientExplanation(c, p, suit)
  const ai = useExplanation(c, p, suit)
  const loading = ai.loading

  return (
    <div className="card mx-auto max-w-3xl">
      <div className="flex items-center gap-2 border-b border-cream-dark px-5 py-4">
        <AIBadge source={loading ? undefined : ai.source} />
        <h3 className="text-xs font-bold tracking-widest text-navy/60 uppercase">Explain to client</h3>
        <div className="ml-auto">{loading && <Spinner text="AI is writing…" />}</div>
      </div>
      {ai.error && <p className="border-b border-cream-dark px-5 py-2 text-xs text-warn">Grok unavailable ({ai.error}). Showing demo text.</p>}
      <div className="p-6">
        <p className={`text-[15px] leading-relaxed text-navy/90 transition ${loading ? 'opacity-30' : ''}`}>{ai.data}</p>
        <div className="mt-6 rounded-lg bg-cream/60 px-4 py-2">
          {ex.rows.map(([k, v]) => (
            <KV key={k} k={k} v={v} />
          ))}
        </div>
        <div className="mt-6 flex justify-between">
          <button onClick={ai.regenerate} disabled={loading} className="btn-ghost">
            ↻ Regenerate
          </button>
          <Link to={`/report/${analysisId}`} className="btn-primary">
            Export report
          </Link>
        </div>
      </div>
    </div>
  )
}
