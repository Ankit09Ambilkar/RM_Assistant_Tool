import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../../lib/api'
import { KV, PageHeader, PageLoading, ReviewBadge } from '../../components/ui'
import { BackendDown } from './AdminLayout'
import { formatDate, formatINR } from '../../lib/format'
import { getUnderlying } from '../../lib/market'
import type { Analysis, Client, RM } from '../../lib/types'

const STATUS_STYLE: Record<RM['status'], string> = {
  Active: 'bg-match/10 text-match',
  'On Leave': 'bg-warn/10 text-warn',
  Inactive: 'bg-navy/10 text-navy/60',
}

const EMPTY: Partial<RM> = {
  name: '',
  email: '',
  phone: '',
  employee_id: '',
  designation: 'Relationship Manager',
  branch: '',
  region: 'West',
  joined_on: new Date().toISOString().slice(0, 10),
  status: 'Active',
  aum_cr: 0,
  certifications: [],
  notes: '',
}

export default function AdminRMs() {
  const [rms, setRms] = useState<RM[] | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [region, setRegion] = useState('All')
  const [status, setStatus] = useState('All')
  const [editing, setEditing] = useState<Partial<RM> | null>(null)
  const [viewing, setViewing] = useState<RM | null>(null)

  const load = () => api.rms().then(setRms).catch((e) => setError(e.message))
  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(
    () =>
      (rms ?? []).filter(
        (r) =>
          (region === 'All' || r.region === region) &&
          (status === 'All' || r.status === status) &&
          `${r.name} ${r.email} ${r.branch} ${r.employee_id}`.toLowerCase().includes(q.toLowerCase()),
      ),
    [rms, q, region, status],
  )

  if (error) return <BackendDown error={error} />
  if (!rms) return <PageLoading />

  return (
    <div>
      <PageHeader
        title="RM Management"
        subtitle={`${rms.length} relationship managers · ${rms.filter((r) => r.status === 'Active').length} active`}
        right={
          <button onClick={() => setEditing({ ...EMPTY })} className="btn-primary">
            + Add RM
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search name, email, branch, ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={region} onChange={(e) => setRegion(e.target.value)}>
          {['All', 'North', 'South', 'East', 'West'].map((r) => (
            <option key={r} value={r}>
              {r === 'All' ? 'All regions' : r}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          {['All', 'Active', 'On Leave', 'Inactive'].map((s) => (
            <option key={s} value={s}>
              {s === 'All' ? 'All statuses' : s}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-dark text-left text-xs tracking-wider text-navy/50 uppercase">
              <th className="px-4 py-3 font-semibold">RM</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Branch</th>
              <th className="hidden px-4 py-3 font-semibold sm:table-cell">Region</th>
              <th className="px-4 py-3 text-right font-semibold">Clients</th>
              <th className="hidden px-4 py-3 text-right font-semibold sm:table-cell">AUM</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} onClick={() => setViewing(r)} className="cursor-pointer border-b border-cream-dark last:border-0 hover:bg-cream/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-[#ffffff]">
                      {r.name
                        .split(' ')
                        .map((p) => p[0])
                        .join('')}
                    </div>
                    <div>
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-xs text-navy/50">
                        {r.designation} · {r.employee_id}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-navy/70 md:table-cell">{r.branch}</td>
                <td className="hidden px-4 py-3 sm:table-cell">{r.region}</td>
                <td className="px-4 py-3 text-right">{r.clientCount ?? 0}</td>
                <td className="hidden px-4 py-3 text-right sm:table-cell">₹{r.aum_cr} Cr</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-navy/50">
                  No RMs match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {viewing && (
        <RMDetail
          rm={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing)
            setViewing(null)
          }}
        />
      )}
      {editing && (
        <RMForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function RMDetail({ rm, onClose, onEdit }: { rm: RM; onClose: () => void; onEdit: () => void }) {
  const [clients, setClients] = useState<Client[]>([])
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  useEffect(() => {
    api.clients(rm.id).then(setClients).catch(() => {})
    api.analyses(rm.id).then(setAnalyses).catch(() => {})
  }, [rm.id])
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? '—'

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-cream p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-serif text-2xl font-normal">{rm.name}</h2>
            <p className="text-sm text-navy/60">
              {rm.designation} · {rm.employee_id}
            </p>
          </div>
          <button onClick={onClose} className="cursor-pointer text-xl text-navy/40 hover:text-navy">
            ✕
          </button>
        </div>
        <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[rm.status]}`}>{rm.status}</span>

        <div className="card mt-4 px-4 py-2">
          <KV k="Email" v={rm.email} />
          <KV k="Phone" v={rm.phone || '—'} />
          <KV k="Branch" v={rm.branch || '—'} />
          <KV k="Region" v={rm.region} />
          <KV k="Joined" v={rm.joined_on ? formatDate(rm.joined_on) : '—'} />
          <KV k="AUM" v={`₹${rm.aum_cr} Cr`} />
          <KV k="Certifications" v={rm.certifications.length ? rm.certifications.join(', ') : '—'} />
        </div>
        {rm.notes && <p className="mt-3 rounded-lg bg-white/70 p-3 text-sm text-navy/70">{rm.notes}</p>}

        <h3 className="mt-6 mb-2 text-xs font-bold tracking-widest text-navy/60 uppercase">Clients ({clients.length})</h3>
        <div className="space-y-2">
          {clients.map((c) => (
            <div key={c.id} className="card flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-navy/60">
                {c.profile.goal} · {c.profile.riskAppetite} · {formatINR(c.profile.investmentAmount)}
              </span>
            </div>
          ))}
          {clients.length === 0 && <p className="text-sm text-navy/50">No clients yet.</p>}
        </div>

        <h3 className="mt-6 mb-2 text-xs font-bold tracking-widest text-navy/60 uppercase">Analyses ({analyses.length})</h3>
        <div className="space-y-2">
          {analyses.map((a) => (
            <div key={a.id} className="card flex items-center justify-between px-4 py-2.5 text-sm">
              <span>
                <span className="font-medium">{clientName(a.clientId)}</span>
                <span className="text-navy/60">
                  {' '}
                  · {getUnderlying(a.product.underlying).ticker} · {a.product.tenorMonths}M
                </span>
              </span>
              {a.reviewStatus && <ReviewBadge status={a.reviewStatus} />}
            </div>
          ))}
          {analyses.length === 0 && <p className="text-sm text-navy/50">No analyses yet.</p>}
        </div>

        <button onClick={onEdit} className="btn-primary mt-6 w-full">
          Edit RM
        </button>
      </div>
    </div>
  )
}

function RMForm({ initial, onClose, onSaved }: { initial: Partial<RM>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<RM>>(initial)
  const [certs, setCerts] = useState((initial.certifications ?? []).join(', '))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const isNew = !initial.id
  const set = (k: keyof RM, v: string | number) => setF((prev) => ({ ...prev, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.name?.trim() || f.name.trim().length > 100) return setError('Name is required (max 100 characters).')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email?.trim() ?? '')) return setError('A valid email is required.')
    if (f.phone && !/^[0-9+\-\s()]*$/.test(f.phone)) return setError('Phone can only contain digits, spaces, +, - and brackets.')
    if (!Number.isFinite(f.aum_cr) || (f.aum_cr ?? 0) < 0) return setError('AUM must be zero or more.')
    if (f.joined_on && f.joined_on > new Date().toISOString().slice(0, 10)) return setError('Joined date cannot be in the future.')
    setSaving(true)
    const body = { ...f, certifications: certs.split(',').map((c) => c.trim()).filter(Boolean) }
    delete (body as Partial<RM>).clientCount
    delete (body as Partial<RM>).analysisCount
    try {
      if (isNew) await api.createRm(body)
      else await api.updateRm(initial.id!, body)
      onSaved()
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  const text = (k: keyof RM, label: string, type = 'text') => (
    <div>
      <label className="label">{label}</label>
      <input type={type} className="input" value={String(f[k] ?? '')} onChange={(e) => set(k, type === 'number' ? Number(e.target.value) : e.target.value)} />
    </div>
  )
  const select = (k: keyof RM, label: string, options: string[]) => (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={String(f[k] ?? '')} onChange={(e) => set(k, e.target.value)}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-navy/50 p-4" onClick={onClose}>
      <form onSubmit={submit} className="card w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-xl font-normal">{isNew ? 'Add relationship manager' : `Edit ${initial.name}`}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {text('name', 'Full name')}
          {text('email', 'Email', 'email')}
          {text('phone', 'Phone')}
          {text('employee_id', 'Employee ID')}
          {select('designation', 'Designation', ['Associate Relationship Manager', 'Relationship Manager', 'Senior Relationship Manager', 'Team Lead'])}
          {text('branch', 'Branch')}
          {select('region', 'Region', ['North', 'South', 'East', 'West'])}
          {select('status', 'Status', ['Active', 'On Leave', 'Inactive'])}
          {text('joined_on', 'Joined on', 'date')}
          {text('aum_cr', 'AUM (₹ Cr)', 'number')}
          <div className="sm:col-span-2">
            <label className="label">Certifications (comma separated)</label>
            <input className="input" value={certs} onChange={(e) => setCerts(e.target.value)} placeholder="NISM Series XV, CFP" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea className="input min-h-20" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : isNew ? 'Add RM' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
