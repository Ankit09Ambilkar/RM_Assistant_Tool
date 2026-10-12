// App state for the logged-in RM: clients + analyses.
// Online: everything is read/written through the FastAPI backend.
// Offline (backend not running): falls back to localStorage so the demo still works.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Analysis, Client, ProductTerms, RM } from './lib/types'
import { uid } from './lib/format'
import { ApiError, api } from './lib/api'
import { authConfigured, supabase } from './lib/supabase'

interface State {
  rmName: string
  clients: Client[]
  analyses: Analysis[]
}

const KEY = 'mindsparks-state-v1'
const RM_KEY = 'mindsparks-rm'

const SEED: State = {
  rmName: 'Priya Sharma',
  clients: [
    {
      id: 'c-john',
      name: 'John Mathew',
      createdAt: '2026-09-28T10:00:00Z',
      profile: {
        goal: 'Regular Income',
        investmentAmount: 500000,
        horizon: '1–3 Years',
        riskAppetite: 'Moderate',
        maxLossPct: 15,
        liquidityNeed: 'Medium',
        experience: 'Some',
        preferredUnderlying: 'NVDA',
        sectorExposurePct: 28,
      },
      interpretation:
        'Prefers income over aggressive capital growth and has moderate downside tolerance (max 15% loss). Existing technology exposure (28%) should be considered before adding NVIDIA-linked exposure.',
    },
    {
      id: 'c-sarah',
      name: 'Sarah Khan',
      createdAt: '2026-09-25T10:00:00Z',
      profile: {
        goal: 'Growth',
        investmentAmount: 1000000,
        horizon: '3–5 Years',
        riskAppetite: 'Aggressive',
        maxLossPct: 30,
        liquidityNeed: 'Low',
        experience: 'Experienced',
        preferredUnderlying: 'AAPL',
        sectorExposurePct: 15,
      },
      interpretation: 'Is focused on growing capital over time and has aggressive downside tolerance (max 30% loss).',
    },
  ],
  analyses: [
    {
      id: 'a-john',
      clientId: 'c-john',
      createdAt: '2026-09-28T10:30:00Z',
      product: { underlying: 'NVDA', productType: 'Barrier Reverse Convertible', notional: 500000, tenorMonths: 12, couponPct: 10, barrierPct: 70, strikePct: 100 },
    },
    {
      id: 'a-sarah',
      clientId: 'c-sarah',
      createdAt: '2026-09-25T11:00:00Z',
      product: { underlying: 'AAPL', productType: 'Barrier Reverse Convertible', notional: 1000000, tenorMonths: 24, couponPct: 9, barrierPct: 60, strikePct: 100 },
    },
  ],
}

function loadOffline(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return SEED
}

function saveOffline(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {}
}

function readRmId() {
  try {
    return localStorage.getItem(RM_KEY) ?? 'rm-1'
  } catch {
    return 'rm-1'
  }
}

export type AuthMode = 'supabase' | 'demo'

interface Store extends State {
  rm: RM | null
  rmId: string
  online: boolean | null // null = still checking
  loading: boolean
  /** 'supabase' = real email/password accounts; 'demo' = old pick-an-RM sign-in (no keys configured). */
  authMode: AuthMode
  signedIn: boolean
  isAdmin: boolean
  login: (email: string, password?: string) => Promise<RM | null>
  logout: () => Promise<void>
  addClient: (c: Omit<Client, 'id' | 'createdAt'>) => Promise<Client>
  updateClient: (id: string, c: Partial<Client>) => Promise<void>
  addAnalysis: (clientId: string, product: ProductTerms) => Promise<Analysis>
  updateAnalysis: (id: string, product: ProductTerms) => Promise<void>
  getClient: (id?: string) => Client | undefined
  getAnalysis: (id?: string) => Analysis | undefined
  refresh: () => Promise<void>
  resetDemo: () => Promise<void>
}

const Ctx = createContext<Store | null>(null)
const EMPTY: State = { ...SEED, rmName: 'Relationship Manager', clients: [], analyses: [] }

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(EMPTY)
  const [rmId, setRmId] = useState(readRmId)
  const [rm, setRm] = useState<RM | null>(null)
  const [online, setOnline] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [authMode, setAuthMode] = useState<AuthMode>(authConfigured ? 'supabase' : 'demo')
  const [signedIn, setSignedIn] = useState(!authConfigured)
  const [isAdmin, setIsAdmin] = useState(!authConfigured)
  const [sessionKey, setSessionKey] = useState(0) // bumps on sign-in / sign-out to reload data

  // Follow the Supabase session (sign-in, sign-out, token refresh, other tabs).
  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') setSessionKey((k) => k + 1)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const signedOut = () => {
    setSignedIn(false)
    setIsAdmin(false)
    setRm(null)
    setState(EMPTY)
  }

  const refresh = useCallback(async () => {
    try {
      if (supabase) {
        const { data } = await supabase.auth.getSession()
        if (!data.session) {
          signedOut()
          setOnline(true)
          return
        }
      }
      const me = await api.me()
      if (me.authEnabled) {
        // Real accounts: the backend decides who we are and only returns this RM's data.
        setAuthMode('supabase')
        setSignedIn(true)
        setIsAdmin(!!me.isAdmin)
        setRm(me.rm ?? null)
        // Always ask for this RM's own data: admins may see everyone's, but their RM workspace shows only their book.
        const [clients, analyses] = me.rm ? await Promise.all([api.clients(me.rm.id), api.analyses(me.rm.id)]) : [[], []]
        setState({ rmName: me.rm?.name ?? me.email ?? 'Admin', clients, analyses })
      } else {
        // Backend has auth turned off: old demo behaviour (RM picked at sign-in).
        setAuthMode('demo')
        setSignedIn(true)
        setIsAdmin(true)
        const [rms, clients, analyses] = await Promise.all([api.rms(), api.clients(rmId), api.analyses(rmId)])
        const current = rms.find((r) => r.id === rmId) ?? rms[0] ?? null
        setRm(current)
        setState({ rmName: current?.name ?? 'Relationship Manager', clients, analyses })
      }
      setOnline(true)
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        // Expired/invalid session or no RM profile: treat as signed out.
        if (e.status === 401) await supabase?.auth.signOut()
        signedOut()
        setOnline(true)
      } else {
        setOnline(false)
        setRm(null)
        setState(loadOffline())
      }
    } finally {
      setLoading(false)
    }
  }, [rmId, sessionKey])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Offline mode keeps the old localStorage persistence.
  useEffect(() => {
    if (online === false) saveOffline(state)
  }, [state, online])

  const store: Store = {
    ...state,
    rm,
    rmId: rm?.id ?? rmId,
    online,
    loading,
    authMode,
    signedIn,
    isAdmin,
    login: async (email, password) => {
      if (supabase) {
        // Real sign-in. Throws a readable error (e.g. "Invalid login credentials").
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: password ?? '' })
        if (error) throw new Error(error.message)
        setLoading(true)
        const me = await api.me().catch(() => null)
        if (me && me.authEnabled && !me.rm && !me.isAdmin) {
          await supabase.auth.signOut()
          throw new Error('This account has no RM profile yet. Please register first.')
        }
        setSessionKey((k) => k + 1)
        return me?.rm ?? ({ id: 'admin', name: me?.email ?? 'Admin' } as RM)
      }
      // Demo sign-in (no Supabase keys): pick an RM by email, any password.
      try {
        const rms = await api.rms()
        const found = rms.find((r) => r.email.toLowerCase() === email.trim().toLowerCase()) ?? null
        if (!found) return null
        localStorage.setItem(RM_KEY, found.id)
        if (found.id === rmId) {
          await refresh() // same RM: rmId won't change, so reload directly (otherwise loading never clears)
        } else {
          setLoading(true)
          setRmId(found.id)
        }
        return found
      } catch {
        return { id: 'offline', name: SEED.rmName } as RM // backend down: allow offline demo
      }
    },
    logout: async () => {
      if (supabase) await supabase.auth.signOut()
      signedOut()
    },
    addClient: async (c) => {
      if (online) {
        const client = await api.createClient({ rmId: rm?.id ?? rmId, name: c.name, profile: c.profile, interpretation: c.interpretation })
        setState((s) => ({ ...s, clients: [client, ...s.clients] }))
        return client
      }
      const client: Client = { ...c, id: 'c-' + uid(), createdAt: new Date().toISOString() }
      setState((s) => ({ ...s, clients: [client, ...s.clients] }))
      return client
    },
    updateClient: async (id, c) => {
      // Save to the backend first so the screen never shows values the server rejected.
      const saved = online ? await api.updateClient(id, { profile: c.profile, interpretation: c.interpretation }) : null
      setState((s) => ({ ...s, clients: s.clients.map((x) => (x.id === id ? { ...x, ...(saved ?? c) } : x)) }))
    },
    addAnalysis: async (clientId, product) => {
      if (online) {
        const a = await api.createAnalysis(clientId, product)
        setState((s) => ({ ...s, analyses: [a, ...s.analyses] }))
        api.analyses(rm?.id ?? rmId).then((analyses) => setState((s) => ({ ...s, analyses }))).catch(() => {})
        return a
      }
      const a: Analysis = { id: 'a-' + uid(), clientId, product, createdAt: new Date().toISOString() }
      setState((s) => ({ ...s, analyses: [a, ...s.analyses] }))
      return a
    },
    updateAnalysis: async (id, product) => {
      // Editing terms resets review status to Pending (backend rule). Errors propagate to the caller.
      if (online) {
        await api.updateAnalysis(id, product)
        const analyses = await api.analyses(rm?.id ?? rmId)
        setState((s) => ({ ...s, analyses }))
      } else {
        setState((s) => ({ ...s, analyses: s.analyses.map((a) => (a.id === id ? { ...a, product, reviewStatus: 'Pending', reviewNote: null } : a)) }))
      }
    },
    getClient: (id) => state.clients.find((c) => c.id === id),
    getAnalysis: (id) => state.analyses.find((a) => a.id === id),
    refresh,
    resetDemo: async () => {
      if (online) {
        await api.reset()
        await refresh()
      } else setState(SEED)
    },
  }

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore must be inside StoreProvider')
  return s
}
