// Client discovery question engine.
// Fixed foundation questions come first; then "AI" follow-ups chosen from what the client already said.
// The follow-up logic is a rule-based stand-in for Grok. To plug in a real model, replace
// `nextQuestion` with an API call that returns the same Question shape (validated before display).
import type { ClientProfile, Experience, Goal, Horizon, Level, RiskAppetite } from './types'
import { UNDERLYINGS, getUnderlying } from './market'

export type Answers = Record<string, string>

export interface Question {
  id: string
  text: string
  type: 'single' | 'number' | 'text' | 'select'
  options?: string[]
  source: 'fixed' | 'ai'
  why?: string
  context?: string
  placeholder?: string
  suffix?: string
}

const FIXED: Question[] = [
  { id: 'name', text: "What is the client's name?", type: 'text', source: 'fixed', placeholder: 'e.g. John Mathew' },
  {
    id: 'goal',
    text: "What is the client's main investment goal?",
    type: 'single',
    options: ['Regular Income', 'Growth', 'Preserve Capital', 'Combination'],
    source: 'fixed',
  },
  { id: 'amount', text: 'How much does the client plan to invest?', type: 'number', source: 'fixed', placeholder: '500000', suffix: '₹' },
  {
    id: 'horizon',
    text: 'How long can the money remain invested?',
    type: 'single',
    options: ['< 1 Year', '1–3 Years', '3–5 Years', '5+ Years'],
    source: 'fixed',
  },
  {
    id: 'maxLoss',
    text: 'What level of loss would make the client uncomfortable?',
    type: 'single',
    options: ['5%', '10%', '15%', '20%', '30% or more'],
    source: 'fixed',
  },
  {
    id: 'underlying',
    text: 'Which underlying or market is the client interested in?',
    type: 'select',
    options: UNDERLYINGS.map((u) => `${u.name} (${u.ticker})`),
    source: 'fixed',
  },
]

export const MAX_AI_QUESTIONS = 4

function tickerFrom(answer: string) {
  const m = answer.match(/\(([^)]+)\)$/)
  return m ? m[1] : 'NVDA'
}

function aiCandidatesAll(a: Answers): Question[] {
  const qs: Question[] = []
  const u = getUnderlying(tickerFrom(a.underlying ?? ''))
  const maxLoss = parseInt(a.maxLoss ?? '15')

  if (u.kind === 'Stock') {
    qs.push({
      id: 'sectorExposure',
      text: `Approximately what percentage of the client's portfolio is already exposed to ${u.sector.toLowerCase()}?`,
      type: 'number',
      suffix: '%',
      placeholder: '28',
      source: 'ai',
      context: `You selected ${u.name}.`,
      why: `${u.name} is a single ${u.sector.toLowerCase()} stock. Existing sector exposure matters for concentration risk.`,
    })
  }

  if (maxLoss <= 15 && (a.goal === 'Regular Income' || a.goal === 'Growth')) {
    qs.push({
      id: 'tradeoff',
      text: 'How much downside risk would the client accept in exchange for a higher potential coupon?',
      type: 'single',
      options: ['Very little', 'Around 10%', 'Around 20%', 'Comfortable with significant market risk'],
      source: 'ai',
      context: `You selected ${a.goal} with a ${a.maxLoss} loss limit.`,
      why: 'Higher coupons usually come with more downside risk. This checks how the client weighs return against the loss limit.',
    })
  }

  qs.push({
    id: 'behaviour',
    text: "If the client's portfolio dropped 15% in one month, what would they most likely do?",
    type: 'single',
    options: ['Sell everything', 'Sell some', 'Hold and wait', 'Invest more'],
    source: 'ai',
    context: 'Risk labels can be ambiguous, so here is a real-life scenario.',
    why: 'A behavioural scenario reveals risk appetite more reliably than asking "low / medium / high".',
  })

  qs.push({
    id: 'liquidity',
    text:
      a.horizon === '< 1 Year'
        ? 'With a short horizon, how likely is the client to need this money early?'
        : 'How important is it that the client can access this money before maturity?',
    type: 'single',
    options: ['Low', 'Medium', 'High'],
    source: 'ai',
    context: `You selected a ${a.horizon} horizon.`,
    why: 'Structured products can be costly to exit early, so liquidity needs affect which tenor fits.',
  })

  qs.push({
    id: 'experience',
    text: 'How experienced is the client with structured products?',
    type: 'single',
    options: ['None', 'Some', 'Experienced'],
    source: 'ai',
    why: 'Less experienced clients need more explanation of barriers and conditional protection.',
  })

  return qs
}

function aiCandidates(a: Answers): Question[] {
  return aiCandidatesAll(a).slice(0, MAX_AI_QUESTIONS)
}

export function allQuestions(a: Answers): Question[] {
  return [...FIXED, ...aiCandidates(a)]
}

export function nextQuestion(a: Answers): Question | null {
  return allQuestions(a).find((q) => !(q.id in a)) ?? null
}

export const FIXED_COUNT = FIXED.length

export function nextFixedQuestion(a: Answers): Question | null {
  return FIXED.find((q) => !(q.id in a)) ?? null
}

// For Grok: all unanswered AI categories it may choose from (empty once the AI question budget is used).
export function aiPool(a: Answers): { candidates: Question[]; required: string[] } {
  const all = aiCandidatesAll(a)
  const asked = all.filter((q) => q.id in a).length
  if (asked >= MAX_AI_QUESTIONS) return { candidates: [], required: [] }
  const candidates = all.filter((q) => !(q.id in a))
  const required = candidates.filter((q) => q.id === 'sectorExposure').map((q) => q.id)
  return { candidates, required }
}

export function buildProfile(a: Answers): ClientProfile {
  const maxLoss = parseInt(a.maxLoss ?? '15')
  const behaviour = a.behaviour ?? 'Hold and wait'
  let risk: RiskAppetite = 'Moderate'
  if (behaviour === 'Sell everything' || maxLoss <= 5) risk = 'Conservative'
  else if (behaviour === 'Invest more' && maxLoss >= 20) risk = 'Aggressive'
  else if (a.tradeoff === 'Very little') risk = 'Conservative'

  return {
    goal: (a.goal as Goal) ?? 'Regular Income',
    investmentAmount: Number(a.amount) || 500000,
    horizon: (a.horizon as Horizon) ?? '1–3 Years',
    riskAppetite: risk,
    maxLossPct: maxLoss,
    liquidityNeed: (a.liquidity as Level) ?? 'Medium',
    experience: (a.experience as Experience) ?? 'Some',
    preferredUnderlying: tickerFrom(a.underlying ?? ''),
    sectorExposurePct: Number(a.sectorExposure) || 0,
  }
}

export function interpret(p: ClientProfile): string {
  const u = getUnderlying(p.preferredUnderlying)
  const goalLine: Record<Goal, string> = {
    'Regular Income': 'Prefers income over aggressive capital growth',
    Growth: 'Is focused on growing capital over time',
    'Preserve Capital': 'Prioritises protecting the original investment',
    Combination: 'Wants a balance of income and growth',
  }
  const parts = [`${goalLine[p.goal]} and has ${p.riskAppetite.toLowerCase()} downside tolerance (max ${p.maxLossPct}% loss).`]
  if (u.kind === 'Stock' && p.sectorExposurePct >= 25) {
    parts.push(`Existing ${u.sector.toLowerCase()} exposure (${p.sectorExposurePct}%) should be considered before adding ${u.name}-linked exposure.`)
  }
  if (p.liquidityNeed === 'High') parts.push('High liquidity need, so shorter tenors are preferable.')
  if (p.experience === 'None') parts.push('New to structured products. Explain barriers carefully.')
  return parts.join(' ')
}

// Validation for free-text / number answers. Returns an error message, or null if the answer is fine.
export const MAX_AMOUNT = 1e11 // ₹10,000 Cr: same cap as the backend

export function validateAnswer(q: Question, raw: string): string | null {
  const v = raw.trim()
  if (!v) return 'Please answer to continue.'
  if (q.id === 'name') {
    if (v.length < 2 || v.length > 100) return 'Name must be 2–100 characters.'
    if (!/\p{L}/u.test(v)) return 'Name must contain letters.'
  }
  if (q.type === 'number') {
    const n = Number(v)
    if (!Number.isFinite(n)) return 'Enter a number.'
    if (q.id === 'amount' && (n < 1000 || n > MAX_AMOUNT)) return 'Amount must be between ₹1,000 and ₹10,000 Cr.'
    if (q.suffix === '%' && (n < 0 || n > 100)) return 'Percentage must be between 0 and 100.'
  }
  return null
}
