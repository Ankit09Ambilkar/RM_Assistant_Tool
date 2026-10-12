// Grok client. Talks to /api/grok (Vite proxy in dev, FastAPI in production), never to xAI directly.
// Every response is parsed + validated; callers fall back to the rule-based demo logic on any failure.
import { useEffect, useState } from 'react'
import { accessToken } from './supabase'

export interface GrokStatus {
  configured: boolean
  model: string
  provider?: string
}

let statusPromise: Promise<GrokStatus> | null = null

export function grokStatus(refresh = false): Promise<GrokStatus> {
  if (!statusPromise || refresh) {
    statusPromise = fetch('/api/grok/status')
      .then((r) => r.json())
      .catch(() => ({ configured: false, model: '' }))
  }
  return statusPromise!
}

export function useGrokStatus() {
  const [status, setStatus] = useState<GrokStatus | null>(null)
  useEffect(() => {
    grokStatus().then(setStatus)
  }, [])
  return status
}

const SYSTEM_RULES = `You are the AI assistant inside a structured-product decision-support tool used by a bank Relationship Manager (RM) in India.
Rules you must always follow:
- Respond ONLY with a single JSON object matching the requested shape. No markdown, no extra keys.
- Never invent market prices, historical returns, probabilities, client holdings or facts not present in the input.
- Only reference numbers that appear in the input. All payoff and suitability results are pre-computed; do not recalculate them.
- Never claim a product is guaranteed, risk-free or certain to outperform. Never give buy/sell instructions.
- Follow any "payoff_rules" in the input exactly when describing how the product works.
- Never use gendered pronouns (he/she/his/her) for the client; use their name, "the client" or "you".
- Use plain, friendly English. Currency is Indian Rupees (₹).`

export async function grokJSON<T>(task: string, input: unknown, validate: (x: any) => T | null, attempts = 2): Promise<T> {
  let lastError = 'Grok response failed validation'
  for (let i = 0; i < attempts; i++) {
    const token = await accessToken()
    const r = await fetch('/api/grok', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_RULES },
          { role: 'user', content: `${task}\n\nINPUT (JSON):\n${JSON.stringify(input, null, 2)}` },
        ],
      }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error ?? `Grok request failed (${r.status})`)
    const text = String(data.content).replace(/^```(json)?|```$/g, '').trim()
    try {
      const parsed = validate(JSON.parse(text))
      if (parsed) return parsed
    } catch {
      lastError = 'Grok returned invalid JSON'
    }
  }
  throw new Error(lastError)
}

// The model is told not to guess a client's gender; enforce it in code too (rejects → retry → rule-based fallback).
const GENDERED = /\b(he|she|his|her|hers|him|himself|herself)\b/i
export const neutral = (text: string) => !GENDERED.test(text)

// Cache AI results per input so tab switches don't re-call the API.
const cache = new Map<string, unknown>()

export type AISource = 'grok' | 'demo'

/**
 * Runs `call` through Grok when configured, otherwise (or on error) returns `fallback()`.
 * `key` must change whenever the underlying inputs change.
 */
export function useAI<T>(key: string, call: () => Promise<T>, fallback: () => T) {
  const [state, setState] = useState<{ data: T; source: AISource; loading: boolean; error?: string }>(() => {
    const hit = cache.get(key) as T | undefined
    return hit ? { data: hit, source: 'grok', loading: false } : { data: fallback(), source: 'demo', loading: true }
  })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    const hit = cache.get(key) as T | undefined
    if (hit && nonce === 0) {
      setState({ data: hit, source: 'grok', loading: false })
      return
    }
    setState((s) => ({ ...s, data: nonce === 0 ? fallback() : s.data, loading: true, error: undefined }))
    grokStatus().then(async (st) => {
      if (!st.configured) {
        if (alive) setState({ data: fallback(), source: 'demo', loading: false })
        return
      }
      try {
        const data = await call()
        cache.set(key, data)
        if (alive) setState({ data, source: 'grok', loading: false })
      } catch (e) {
        if (alive) setState({ data: fallback(), source: 'demo', loading: false, error: String((e as Error).message ?? e) })
      }
    })
    return () => {
      alive = false
    }
  }, [key, nonce])

  return { ...state, regenerate: () => setNonce((n) => n + 1) }
}

// --- small validation helpers ---
export const isStr = (x: unknown, max = 2000): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= max
