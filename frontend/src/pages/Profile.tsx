// Client Investment Profile: final state of discovery. Every field is editable before continuing.
import { useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { PageHeader } from '../components/ui'
import { MAX_AMOUNT, interpret } from '../lib/discovery'
import { UNDERLYINGS, getUnderlying } from '../lib/market'
import type { Client, ClientProfile } from '../lib/types'
import { useAI } from '../lib/grok'
import { grokInterpretation } from '../lib/ai'
import { PageLoading, Spinner } from '../components/ui'

type Field = {
  key: keyof ClientProfile
  label: string
  type: 'select' | 'number'
  options?: string[]
  suffix?: string
}

const FIELDS: Field[] = [
  { key: 'goal', label: 'Investment Goal', type: 'select', options: ['Regular Income', 'Growth', 'Preserve Capital', 'Combination'] },
  { key: 'investmentAmount', label: 'Investment Amount', type: 'number', suffix: '₹' },
  { key: 'horizon', label: 'Investment Horizon', type: 'select', options: ['< 1 Year', '1–3 Years', '3–5 Years', '5+ Years'] },
  { key: 'riskAppetite', label: 'Risk Appetite', type: 'select', options: ['Conservative', 'Moderate', 'Aggressive'] },
  { key: 'maxLossPct', label: 'Maximum Comfortable Loss', type: 'number', suffix: '%' },
  { key: 'liquidityNeed', label: 'Liquidity Need', type: 'select', options: ['Low', 'Medium', 'High'] },
  { key: 'experience', label: 'Structured Product Experience', type: 'select', options: ['None', 'Some', 'Experienced'] },
  { key: 'preferredUnderlying', label: 'Preferred Underlying', type: 'select', options: UNDERLYINGS.map((u) => u.ticker) },
  { key: 'sectorExposurePct', label: 'Existing Sector Exposure', type: 'number', suffix: '%' },
]

export default function Profile() {
  const { clientId } = useParams()
  const { getClient, loading } = useStore()
  const client = getClient(clientId)
  if (loading) return <PageLoading />
  if (!client) return <Navigate to="/clients" replace />
  return <ProfileForm client={client} />
}

function ProfileForm({ client }: { client: Client }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { updateClient } = useStore()
  const [profile, setProfile] = useState<ClientProfile | undefined>(client?.profile)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  // Grok interpretation is generated for a "snapshot" of the profile; edits show the live rule-based text until refreshed.
  const [aiProfile, setAiProfile] = useState(JSON.stringify(client?.profile ?? {}))
  const ai = useAI(
    `interp:${client?.id}:${aiProfile}`,
    () => grokInterpretation(client!.name, JSON.parse(aiProfile)),
    () => (client ? interpret(JSON.parse(aiProfile)) : ''),
  )

  if (!client || !profile) return <Navigate to="/clients" replace />

  const isNew = params.get('new') === '1'
  const edited = JSON.stringify(profile) !== aiProfile
  const interpretation = edited ? interpret(profile) : ai.data

  function set(key: keyof ClientProfile, value: string, type: Field['type']) {
    // Empty number inputs become NaN (shown blank) so the field can be cleared and is caught by validation.
    setProfile((prev) => ({ ...prev!, [key]: type === 'number' ? (value.trim() === '' ? NaN : Number(value)) : value }))
  }

  const errors = validateProfile(profile)
  const hasErrors = Object.keys(errors).length > 0

  async function save(next: string) {
    if (hasErrors) return
    setSaving(true)
    setSaveError('')
    try {
      await updateClient(client!.id, { profile: profile!, interpretation })
      navigate(next)
    } catch (e) {
      setSaveError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ to: isNew ? '/dashboard' : '/clients', label: isNew ? 'Dashboard' : 'Clients' }}
        title="Client Investment Profile"
        subtitle={`${client.name}${isNew ? ' · Discovery complete. Review and edit any field before continuing.' : ''}`}
      />

      <div className="card divide-y divide-cream-dark">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
            <span className="text-sm text-navy/70">
              {f.key === 'sectorExposurePct' ? `Existing ${getUnderlying(profile.preferredUnderlying).sector} Exposure` : f.label}
            </span>
            <div className="relative w-full sm:w-56">
              {f.type === 'select' ? (
                <select className="input py-2 font-semibold" value={String(profile[f.key])} onChange={(e) => set(f.key, e.target.value, f.type)}>
                  {f.options!.map((o) => (
                    <option key={o} value={o}>
                      {f.key === 'preferredUnderlying' ? `${getUnderlying(o).name} (${o})` : o}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  {f.suffix === '₹' && <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-navy/50">₹</span>}
                  <input
                    type="number"
                    min={0}
                    className={`input py-2 font-semibold ${f.suffix === '₹' ? 'pl-7' : 'pr-8'} ${errors[f.key] ? 'border-bad' : ''}`}
                    value={Number.isNaN(profile[f.key] as number) ? '' : String(profile[f.key])}
                    onChange={(e) => set(f.key, e.target.value, f.type)}
                  />
                  {f.suffix === '%' && <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-navy/50">%</span>}
                </>
              )}
              {errors[f.key] && <p className="mt-1 text-xs text-bad">{errors[f.key]}</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-4 bg-accent p-5 text-[#ffffff]">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold tracking-widest uppercase">
          <span className="rounded bg-[#ffffff] px-1.5 py-0.5 text-[10px] font-bold text-mint">{!edited && ai.source === 'grok' ? 'AI · LIVE' : 'AI · DEMO'}</span> AI interpretation
        </div>
        <p className={`text-sm leading-relaxed text-[#ffffff]/90 ${ai.loading && !edited ? 'opacity-40' : ''}`}>{interpretation}</p>
        {ai.loading && !edited && (
          <div className="mt-2 [&_*]:!text-[#ffffff]/60">
            <Spinner text="AI is summarising the profile…" />
          </div>
        )}
        {ai.error && <p className="mt-2 text-xs text-amber-300">Grok unavailable ({ai.error}). Showing demo text.</p>}
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-[#ffffff]/50">Built only from the answers above.</p>
          <button
            onClick={() => (edited ? setAiProfile(JSON.stringify(profile)) : ai.regenerate())}
            disabled={edited && hasErrors}
            className="cursor-pointer rounded-md border border-[#ffffff]/30 px-2.5 py-1 text-xs font-semibold hover:bg-[#ffffff]/10"
          >
            ↻ {edited ? 'Update interpretation' : 'Regenerate'}
          </button>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        {saveError && <p className="mr-auto self-center text-sm text-bad">Could not save: {saveError}</p>}
        <button onClick={() => save('/clients')} disabled={hasErrors || saving} className="btn-ghost">
          Save
        </button>
        <button onClick={() => save(`/configure/${client.id}`)} disabled={hasErrors || saving} className="btn-primary">
          Continue to product →
        </button>
      </div>
    </div>
  )
}

function validateProfile(p: ClientProfile): Partial<Record<keyof ClientProfile, string>> {
  const e: Partial<Record<keyof ClientProfile, string>> = {}
  const amt = p.investmentAmount
  if (!Number.isFinite(amt) || amt < 1000 || amt > MAX_AMOUNT) e.investmentAmount = 'Between ₹1,000 and ₹10,000 Cr.'
  if (!Number.isFinite(p.maxLossPct) || p.maxLossPct < 0 || p.maxLossPct > 100) e.maxLossPct = 'Between 0 and 100%.'
  if (!Number.isFinite(p.sectorExposurePct) || p.sectorExposurePct < 0 || p.sectorExposurePct > 100) e.sectorExposurePct = 'Between 0 and 100%.'
  return e
}
