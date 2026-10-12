// Analysis Review: admin approves or flags RM analyses. Suitability comes from the Python engine.
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { ConcernPill, KV, PageHeader, PageLoading, ReviewBadge, StatusBadge } from '../../components/ui'
import { BackendDown } from './AdminLayout'
import { formatDate, formatINR, formatPct, formatSignedINR } from '../../lib/format'
import { getUnderlying } from '../../lib/market'
import type { Analysis, Client, EngineResult, RM, ReviewStatus } from '../../lib/types'

const FILTERS = ['Pending', 'Flagged', 'Approved', 'All'] as const

export default function AdminReviews() {
  const [analyses, setAnalyses] = useState<Analysis[] | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [rms, setRms] = useState<RM[]>([])
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Pending')
  const [rmFilter, setRmFilter] = useState('All')
  const [open, setOpen] = useState<Analysis | null>(null)

  const load = () =>
    Promise.all([api.analyses(), api.clients(), api.rms()])
      .then(([a, c, r]) => {
        setAnalyses(a)
        setClients(c)
        setRms(r)
      })
      .catch((e) => setError(e.message))

  useEffect(() => {
    load()
  }, [])

  const rows = useMemo(
    () => (analyses ?? []).filter((a) => (filter === 'All' || a.reviewStatus === filter) && (rmFilter === 'All' || a.rmId === rmFilter)),
    [analyses, filter, rmFilter],
  )

  if (error) return <BackendDown error={error} />
  if (!analyses) return <PageLoading />

  const client = (id: string) => clients.find((c) => c.id === id)
  const rm = (id?: string) => rms.find((r) => r.id === id)
  const count = (s: ReviewStatus) => analyses.filter((a) => a.reviewStatus === s).length

  return (
    <div>
      <PageHeader title="Analysis Review" subtitle="Approve analyses or flag them back to the RM with a note" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-cream-dark/70 p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium ${filter === f ? 'bg-white shadow-sm' : 'text-navy/60 hover:text-navy'}`}
            >
              {f}
              {f !== 'All' && <span className="ml-1 text-xs text-navy/50">{count(f)}</span>}
            </button>
          ))}
        </div>
        <select className="input w-auto" value={rmFilter} onChange={(e) => setRmFilter(e.target.value)}>
          <option value="All">All RMs</option>
          {rms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-dark text-left text-xs tracking-wider text-navy/50 uppercase">
              <th className="px-4 py-3 font-semibold">Client</th>
              <th className="px-4 py-3 font-semibold">RM</th>
              <th className="px-4 py-3 font-semibold">Product</th>
              <th className="hidden px-4 py-3 font-semibold sm:table-cell">Amount</th>
              <th className="px-4 py-3 font-semibold">Suitability</th>
              <th className="px-4 py-3 font-semibold">Review</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} onClick={() => setOpen(a)} className="cursor-pointer border-b border-cream-dark last:border-0 hover:bg-cream/60">
                <td className="px-4 py-3 font-semibold">{client(a.clientId)?.name ?? '—'}</td>
                <td className="px-4 py-3 text-navy/70">{rm(a.rmId)?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  {getUnderlying(a.product.underlying).ticker} · {a.product.tenorMonths}M · {a.product.barrierPct}% barrier
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">{formatINR(a.product.notional)}</td>
                <td className="px-4 py-3">
                  <ConcernPill count={a.concerns ?? 0} />
                </td>
                <td className="px-4 py-3">{a.reviewStatus && <ReviewBadge status={a.reviewStatus} />}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-navy/50">
                  Nothing here. {filter === 'Pending' ? 'The review queue is empty.' : ''}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && client(open.clientId) && (
        <ReviewPanel
          analysis={open}
          client={client(open.clientId)!}
          rm={rm(open.rmId)}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function ReviewPanel({ analysis, client, rm, onClose, onDone }: { analysis: Analysis; client: Client; rm?: RM; onClose: () => void; onDone: () => void }) {
  const [result, setResult] = useState<EngineResult | null>(null)
  const [note, setNote] = useState(analysis.reviewNote ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const p = analysis.product
  const c = client.profile
  const u = getUnderlying(p.underlying)

  useEffect(() => {
    api.analyze(c, p).then(setResult).catch((e) => setError(e.message))
  }, [analysis.id])

  async function decide(status: ReviewStatus) {
    if (status === 'Flagged' && !note.trim()) return setError('Add a note so the RM knows what to fix.')
    setSaving(true)
    try {
      await api.review(analysis.id, status, note)
      onDone()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy/40" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-cream p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-serif text-2xl font-normal">{client.name}</h2>
            <p className="text-sm text-navy/60">
              RM: {rm?.name ?? '—'} · submitted {formatDate(analysis.createdAt)}
            </p>
          </div>
          <button onClick={onClose} className="cursor-pointer text-xl text-navy/40 hover:text-navy">
            ✕
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          Current status: {analysis.reviewStatus && <ReviewBadge status={analysis.reviewStatus} />}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="card px-4 py-2">
            <h3 className="pt-2 text-xs font-bold tracking-widest text-navy/60 uppercase">Client</h3>
            <KV k="Goal" v={c.goal} />
            <KV k="Risk" v={c.riskAppetite} />
            <KV k="Horizon" v={c.horizon} />
            <KV k="Max loss" v={`${c.maxLossPct}%`} />
            <KV k="Sector exp." v={`${c.sectorExposurePct}%`} />
          </div>
          <div className="card px-4 py-2">
            <h3 className="pt-2 text-xs font-bold tracking-widest text-navy/60 uppercase">Product</h3>
            <KV k="Underlying" v={u.name} />
            <KV k="Amount" v={formatINR(p.notional)} />
            <KV k="Tenor" v={`${p.tenorMonths}M`} />
            <KV k="Coupon" v={`${p.couponPct}%`} />
            <KV k="Barrier / Strike" v={`${p.barrierPct}% / ${p.strikePct}%`} />
          </div>
        </div>

        <h3 className="mt-6 mb-2 text-xs font-bold tracking-widest text-navy/60 uppercase">Suitability</h3>
        {!result && !error && <p className="text-sm text-navy/50">Calculating…</p>}
        {result && (
          <div className="card divide-y divide-cream-dark">
            {result.suitability.map((s) => (
              <div key={s.dimension} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{s.dimension}</span>
                  <StatusBadge status={s.status} />
                </div>
                <p className="mt-1 text-xs text-navy/70">{s.reason}</p>
                {s.source_rule && <p className="mt-0.5 text-[10px] text-navy/40">rule: {s.source_rule}</p>}
              </div>
            ))}
          </div>
        )}

        {result && (
          <>
            <h3 className="mt-6 mb-2 text-xs font-bold tracking-widest text-navy/60 uppercase">Key scenarios</h3>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {result.scenarios.map((s) => (
                    <tr key={s.name} className="border-b border-cream-dark last:border-0">
                      <td className="px-4 py-1.5">{s.name}</td>
                      <td className={`px-4 py-1.5 text-right ${s.pnl < 0 ? 'text-bad' : ''}`}>{formatSignedINR(s.pnl)}</td>
                      <td className={`px-4 py-1.5 text-right ${s.pnl < 0 ? 'text-bad' : ''}`}>{formatPct(s.returnPct, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <label className="label mt-6">Reviewer note</label>
        <textarea
          className="input min-h-24"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Loss tolerance mismatch. Try a lower barrier or an index underlying."
        />
        {error && <p className="mt-2 text-sm text-bad">{error}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={saving} onClick={() => decide('Approved')} className="btn flex-1 bg-match text-white hover:bg-match/90">
            ✓ Approve
          </button>
          <button disabled={saving} onClick={() => decide('Flagged')} className="btn flex-1 bg-bad text-white hover:bg-bad/90">
            ⚑ Flag to RM
          </button>
          {analysis.reviewStatus !== 'Pending' && (
            <button disabled={saving} onClick={() => decide('Pending')} className="btn-ghost">
              Reset to pending
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
