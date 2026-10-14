// FastAPI backend client (proxied by Vite at /api/v1 → http://127.0.0.1:8000/api/v1).
import { useEffect, useState } from 'react'
import type { Analysis, Client, ClientProfile, EngineResult, ExtractedFact, MarketData, ProductTerms, RM, ReviewStatus } from './types'
import { payoffCurve, presetScenarios } from './payoff'
import { concernCount, runSuitability } from './suitability'
import { accessToken } from './supabase'

/** Error with the HTTP status, so callers can tell "signed out" (401) from "server down" (network error). */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken()
  const r = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!r.ok) {
    let msg = `Request failed (${r.status})`
    try {
      const d = await r.json()
      // FastAPI 422s return a list of {loc, msg}; turn them into one readable sentence.
      msg = Array.isArray(d.detail)
        ? d.detail.map((e: { loc?: string[]; msg: string }) => `${e.loc?.slice(-1)[0] ?? 'input'}: ${e.msg.replace(/^Value error, /, '')}`).join('; ')
        : typeof d.detail === 'string'
          ? d.detail
          : JSON.stringify(d.detail ?? d)
    } catch {}
    throw new ApiError(msg, r.status)
  }
  return r.json()
}

export interface MeResponse {
  authEnabled: boolean
  email?: string
  isAdmin?: boolean
  rm?: RM | null
}

export interface BreachRisk {
  probability: number
  baselineProbability: number
  factors: { feature: string; label: string; value: number; typical: number; effect: number }[]
  outOfRange: boolean
  asOf: string
  model: {
    name: string
    algorithm: string
    label: string
    nAssets: number
    nExamples: number
    dataFrom: string
    dataTo: string
    testPeriod: string
    auc: number
    baselineAuc: number
    brier: number
    baselineBrier: number
  }
}

export interface RegisterInput {
  name: string
  email: string
  password: string
  phone: string
  employee_id: string
  designation: string
  branch: string
  region: RM['region']
  certifications: string[]
}

const body = (x: unknown) => JSON.stringify(x)

export const api = {
  health: () => req<{ ok: boolean }>('/health'),
  me: () => req<MeResponse>('/me'),
  register: (r: RegisterInput) => req<RM>('/auth/register', { method: 'POST', body: body(r) }),
  analyze: (profile: ClientProfile, product: ProductTerms) =>
    req<EngineResult>('/engine/analyze', { method: 'POST', body: body({ profile, product }) }),
  market: (ticker: string, period = '1y') => req<MarketData>(`/market/${ticker}?period=${period}`),
  breachRisk: (product: ProductTerms) => req<BreachRisk>('/ml/breach-risk', { method: 'POST', body: body(product) }),

  rms: () => req<RM[]>('/rms'),
  createRm: (rm: Partial<RM>) => req<RM>('/rms', { method: 'POST', body: body(rm) }),
  updateRm: (id: string, rm: Partial<RM>) => req<RM>(`/rms/${id}`, { method: 'PUT', body: body(rm) }),

  clients: (rmId?: string) => req<Client[]>(`/clients${rmId ? `?rm_id=${rmId}` : ''}`),
  createClient: (c: {
    rmId: string
    name: string
    profile: ClientProfile
    interpretation: string
    notes?: string
    extractedFacts?: ExtractedFact[]
  }) => req<Client>('/clients', { method: 'POST', body: body(c) }),
  updateClient: (id: string, c: Partial<Client>) => req<Client>(`/clients/${id}`, { method: 'PUT', body: body(c) }),

  analyses: (rmId?: string, includeResults = true) =>
    req<Analysis[]>(`/analyses?include_results=${includeResults}${rmId ? `&rm_id=${rmId}` : ''}`),
  createAnalysis: (clientId: string, product: ProductTerms) =>
    req<Analysis>('/analyses', { method: 'POST', body: body({ clientId, product }) }),
  updateAnalysis: (id: string, product: ProductTerms) => req<Analysis>(`/analyses/${id}`, { method: 'PUT', body: body(product) }),
  review: (id: string, status: ReviewStatus, note: string) =>
    req<Analysis>(`/analyses/${id}/review`, { method: 'PUT', body: body({ status, note }) }),

  adminStats: () => req<AdminStats>('/admin/stats'),
  reset: () => req<{ ok: boolean }>('/admin/reset', { method: 'POST' }),
}

export interface AdminStats {
  rms: { total: number; active: number }
  clients: number
  analyses: number
  reviews: Record<ReviewStatus, number>
  withConcerns: number
  totalAumCr: number
  totalNotional: number
  perRm: { id: string; name: string; analyses: number; clients: number; pending: number }[]
  suitabilityByDimension: Record<string, { MATCH: number; WARNING: number; MISMATCH: number }>
}

// Same engine in the browser, used only when the backend is unreachable.
export function browserEngine(profile: ClientProfile, product: ProductTerms): EngineResult {
  const suitability = runSuitability(profile, product)
  return {
    scenarios: presetScenarios(product),
    curve: payoffCurve(product),
    suitability,
    concerns: concernCount(suitability),
    engine: 'browser',
  }
}

/** Payoff + suitability from the Python engine; falls back to the browser engine if the API is down. */
export function useEngine(profile: ClientProfile, product: ProductTerms) {
  const key = JSON.stringify([profile, product])
  const [state, setState] = useState<{ result: EngineResult; loading: boolean }>(() => ({
    result: browserEngine(profile, product),
    loading: true,
  }))
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    api
      .analyze(profile, product)
      .then((result) => alive && setState({ result: { ...result, engine: 'python' }, loading: false }))
      .catch(() => alive && setState({ result: browserEngine(profile, product), loading: false }))
    return () => {
      alive = false
    }
  }, [key])
  return state
}

const marketCache = new Map<string, MarketData>()

export function useMarket(ticker: string, period = '1y') {
  const key = `${ticker}:${period}`
  const [state, setState] = useState<{ data?: MarketData; loading: boolean; error?: string }>(() => ({
    data: marketCache.get(key),
    loading: !marketCache.has(key),
  }))
  useEffect(() => {
    let alive = true
    const hit = marketCache.get(key)
    if (hit) return setState({ data: hit, loading: false })
    setState({ loading: true })
    api
      .market(ticker, period)
      .then((d) => {
        marketCache.set(key, d)
        if (alive) setState({ data: d, loading: false })
      })
      .catch((e) => alive && setState({ loading: false, error: String(e.message ?? e) }))
    return () => {
      alive = false
    }
  }, [key])
  return state
}
