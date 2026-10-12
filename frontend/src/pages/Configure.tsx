import { useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { AIBadge, KV, PageHeader, PageLoading } from '../components/ui'
import { PRODUCT_TYPES, TENORS, UNDERLYINGS, getUnderlying } from '../lib/market'
import { considerations } from '../lib/insights'
import { validateProduct } from '../lib/validate'
import MarketCard from '../components/MarketCard'
import { formatINR } from '../lib/format'
import type { Analysis, Client, ProductTerms } from '../lib/types'

export default function Configure() {
  const { clientId } = useParams()
  const [params] = useSearchParams()
  const { getClient, getAnalysis, loading } = useStore()
  const client = getClient(clientId)
  const existing = getAnalysis(params.get('analysis') ?? undefined)

  if (loading) return <PageLoading />
  if (!client) return <Navigate to="/clients" replace />
  return <ConfigureForm client={client} existing={existing} />
}

function ConfigureForm({ client, existing }: { client: Client; existing?: Analysis }) {
  const navigate = useNavigate()
  const { addAnalysis, updateAnalysis } = useStore()
  const [p, setP] = useState<ProductTerms>(
    existing?.product ?? {
      underlying: client.profile.preferredUnderlying,
      productType: 'Barrier Reverse Convertible',
      notional: client.profile.investmentAmount,
      tenorMonths: 12,
      couponPct: 10,
      barrierPct: 70,
      strikePct: 100,
    },
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const errors: Record<string, string> = validateProduct(p)
  const c = client.profile
  const set = (k: keyof ProductTerms, v: string) => setP((prev) => ({ ...prev, [k]: typeof p[k] === 'number' ? (v.trim() === '' ? NaN : Number(v)) : v }))

  async function analyze() {
    if (Object.keys(errors).length) return
    setSaving(true)
    setSaveError('')
    try {
      if (existing) {
        await updateAnalysis(existing.id, p)
        navigate(`/analysis/${existing.id}`)
      } else {
        const a = await addAnalysis(client!.id, p)
        navigate(`/analysis/${a.id}`)
      }
    } catch (e) {
      setSaveError((e as Error).message)
      setSaving(false)
    }
  }

  const numField = (k: keyof ProductTerms, label: string, suffix: string, step = 1) => (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        {suffix === '₹' && <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-navy/50">₹</span>}
        <input
          type="number"
          step={step}
          className={`input ${suffix === '₹' ? 'pl-7' : 'pr-8'} ${errors[k] ? 'border-bad' : ''}`}
          value={Number.isNaN(p[k] as number) ? '' : String(p[k])}
          onChange={(e) => set(k, e.target.value)}
        />
        {suffix === '%' && <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-navy/50">%</span>}
      </div>
      {errors[k] && <p className="mt-1 text-xs text-bad">{errors[k]}</p>}
      {(k === 'barrierPct' || k === 'strikePct') && !errors[k] && <p className="mt-1 text-xs text-navy/50">% of the initial level</p>}
    </div>
  )

  return (
    <div>
      <PageHeader
        back={{ to: existing ? `/analysis/${existing.id}` : '/dashboard', label: existing ? 'Back to analysis' : 'Dashboard' }}
        title="Configure Structured Product"
        subtitle={`For ${client.name}`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="card p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label">Underlying</label>
              <select className="input" value={p.underlying} onChange={(e) => set('underlying', e.target.value)}>
                {UNDERLYINGS.map((u) => (
                  <option key={u.ticker} value={u.ticker}>
                    {u.name} ({u.ticker})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-navy/50">
                {getUnderlying(p.underlying).kind} · {getUnderlying(p.underlying).sector}
              </p>
            </div>
            <div>
              <label className="label">Product Type</label>
              <select className="input" value={p.productType} onChange={(e) => set('productType', e.target.value)}>
                {PRODUCT_TYPES.map((t) => (
                  <option key={t.id} value={t.id} disabled={!t.enabled}>
                    {t.id}
                  </option>
                ))}
              </select>
            </div>
            {numField('notional', 'Investment Amount', '₹', 10000)}
            <div>
              <label className="label">Tenor</label>
              <select className="input" value={p.tenorMonths} onChange={(e) => set('tenorMonths', e.target.value)}>
                {TENORS.map((t) => (
                  <option key={t} value={t}>
                    {t} Months
                  </option>
                ))}
              </select>
            </div>
            {numField('couponPct', 'Coupon (p.a.)', '%', 0.5)}
            {numField('barrierPct', 'Barrier', '%')}
            {numField('strikePct', 'Strike', '%')}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
            {saveError && <p className="mr-auto text-sm text-bad">Could not save: {saveError}</p>}
            <button onClick={analyze} disabled={Object.keys(errors).length > 0 || saving} className="btn-primary px-8">
              {existing ? 'Re-analyze product' : 'Analyze product'} →
            </button>
          </div>
        </div>

        <aside className="space-y-4">
          <MarketCard ticker={p.underlying} compact />
          <div className="card p-5">
            <h3 className="mb-2 text-xs font-bold tracking-widest text-navy/60 uppercase">Client snapshot</h3>
            <KV k="Goal" v={c.goal} />
            <KV k="Risk" v={c.riskAppetite} />
            <KV k="Horizon" v={c.horizon} />
            <KV k="Max Loss" v={`${c.maxLossPct}%`} />
            <KV k="Planned" v={formatINR(c.investmentAmount)} />
            <KV k={`${getUnderlying(c.preferredUnderlying).sector.split(' ')[0]} Exp.`} v={`${c.sectorExposurePct}%`} />
          </div>
          <div className="card p-5">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold tracking-widest text-navy/60 uppercase">
              <AIBadge /> AI consideration
            </h3>
            <ul className="space-y-2 text-sm">
              {considerations(c, p).map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="text-warn">•</span>
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-navy/50">Advisory only. Calculations and suitability checks run when you click Analyze.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
