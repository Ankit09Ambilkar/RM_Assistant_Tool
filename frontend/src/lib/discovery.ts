// Client discovery question engine.
// Fixed foundation questions come first; then "AI" follow-ups chosen from what the client already said.
// The follow-up logic is a rule-based stand-in for Grok. To plug in a real model, replace
// `nextQuestion` with an API call that returns the same Question shape (validated before display).
import type { ClientProfile, Experience, ExtractedFact, ExtractionResult, Goal, Horizon, Level, MissingFieldInfo, RiskAppetite } from './types'
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

// ---------- Free-text Fact Extraction & Follow-Up Logic (Fallback / Deterministic) ----------

export const CORE_DISCOVERY_FIELDS = [
  { field: 'name', label: "Client's Name", reason: 'Client name not found.' },
  { field: 'goal', label: 'Investment Goal', reason: 'Investment objective not specified.' },
  { field: 'amount', label: 'Investment Amount', reason: 'Target investment amount (₹) not specified.' },
  { field: 'horizon', label: 'Investment Horizon', reason: 'Time horizon not specified.' },
  { field: 'maxLoss', label: 'Maximum Acceptable Loss', reason: 'Downside loss limit not specified.' },
  { field: 'underlying', label: 'Preferred Underlying', reason: 'Underlying asset or market not selected.' },
  { field: 'liquidity', label: 'Liquidity Need', reason: 'Early withdrawal requirement not specified.' },
  { field: 'experience', label: 'Structured Product Experience', reason: 'Structured product familiarity not specified.' },
] as const

export function getMissingFields(answers: Answers = {}, extracted: ExtractedFact[] = []): MissingFieldInfo[] {
  const captured = new Set<string>()
  for (const k of Object.keys(answers)) captured.add(k)
  for (const f of extracted) captured.add(f.field)

  return CORE_DISCOVERY_FIELDS.filter((cf) => !captured.has(cf.field)).map((cf) => ({
    field: cf.field,
    label: cf.label,
    reason: cf.reason,
  }))
}

export function extractFactsRuleBased(notes: string, answersSoFar: Answers = {}): ExtractionResult {
  const text = (notes ?? '').trim()
  const facts: ExtractedFact[] = []

  if (!text) {
    return {
      facts: [],
      missingFields: getMissingFields(answersSoFar, []),
      summary: 'No notes provided. Standard discovery questions will guide the profile.',
      source: 'demo',
    }
  }

  // 1. Client Name
  const titleMatch = text.match(/\b(Dr\.|Mr\.|Mrs\.|Ms\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/)
  const nameKeywordMatch = text.match(/\b(?:client(?:'s)?\s*name\s*(?:is|:)?|named|client\s*is|client\s*:)\s*(?:Dr\.|Mr\.|Mrs\.|Ms\.)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/)
  const rawName = titleMatch ? `${titleMatch[1]} ${titleMatch[2]}`.trim() : nameKeywordMatch ? nameKeywordMatch[1].trim() : null
  const nameSource = titleMatch ? titleMatch[0] : nameKeywordMatch ? nameKeywordMatch[0] : null

  if (rawName && rawName.length >= 2 && rawName.length <= 100) {
    facts.push({
      field: 'name',
      label: "Client's Name",
      value: rawName,
      displayValue: rawName,
      confidence: 'high',
      confirmed: false, // Per Requirement 5: never auto-confirmed
      sourceText: nameSource || rawName,
    })
  }

  // 2. Goal
  if (/\b(regular\s*income|income|dividend|dividends|quarterly\s*payout|cash\s*flow|yield)\b/i.test(text)) {
    facts.push({
      field: 'goal',
      label: 'Investment Goal',
      value: 'Regular Income',
      displayValue: 'Regular Income',
      confidence: 'high',
      confirmed: false,
      sourceText: text.match(/\b(regular\s*income|income|dividend|dividends|quarterly\s*payout|cash\s*flow|yield)\b/i)?.[0],
    })
  } else if (/\b(capital\s*growth|growth|grow\s*capital|wealth\s*(?:creation|accumulation)|appreciation)\b/i.test(text)) {
    facts.push({
      field: 'goal',
      label: 'Investment Goal',
      value: 'Growth',
      displayValue: 'Growth',
      confidence: 'high',
      confirmed: false,
      sourceText: text.match(/\b(capital\s*growth|growth|grow\s*capital|wealth\s*(?:creation|accumulation)|appreciation)\b/i)?.[0],
    })
  } else if (/\b(preserve|preservation|protect|protection|safe|safety|fixed\s*deposit|fd|principal)\b/i.test(text)) {
    facts.push({
      field: 'goal',
      label: 'Investment Goal',
      value: 'Preserve Capital',
      displayValue: 'Preserve Capital',
      confidence: 'high',
      confirmed: false,
      sourceText: text.match(/\b(preserve|preservation|protect|protection|safe|safety|fixed\s*deposit|fd|principal)\b/i)?.[0],
    })
  } else if (/\b(combination|balanced|both\s*income\s*and\s*growth)\b/i.test(text)) {
    facts.push({
      field: 'goal',
      label: 'Investment Goal',
      value: 'Combination',
      displayValue: 'Combination',
      confidence: 'medium',
      confirmed: false,
      sourceText: text.match(/\b(combination|balanced|both\s*income\s*and\s*growth)\b/i)?.[0],
    })
  }

  // 3. Investment Amount
  const crMatch = text.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:cr|crore|crores)\b/i)
  const lakhMatch = text.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs|l)\b/i)
  const rawNumMatch = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\b/i) || text.match(/\b([\d,]{5,})\b/)

  if (crMatch) {
    const val = Number(crMatch[1]) * 10000000
    if (val >= 1000 && val <= MAX_AMOUNT) {
      facts.push({
        field: 'amount',
        label: 'Investment Amount',
        value: val,
        displayValue: `₹${crMatch[1]} Cr`,
        confidence: 'high',
        confirmed: false,
        sourceText: crMatch[0],
      })
    }
  } else if (lakhMatch) {
    const val = Number(lakhMatch[1]) * 100000
    if (val >= 1000 && val <= MAX_AMOUNT) {
      facts.push({
        field: 'amount',
        label: 'Investment Amount',
        value: val,
        displayValue: `₹${lakhMatch[1]} Lakh`,
        confidence: 'high',
        confirmed: false,
        sourceText: lakhMatch[0],
      })
    }
  } else if (rawNumMatch) {
    const cleanNum = Number(rawNumMatch[1].replace(/,/g, ''))
    if (Number.isFinite(cleanNum) && cleanNum >= 1000 && cleanNum <= MAX_AMOUNT) {
      facts.push({
        field: 'amount',
        label: 'Investment Amount',
        value: cleanNum,
        displayValue: `₹${cleanNum.toLocaleString('en-IN')}`,
        confidence: 'medium',
        confirmed: false,
        sourceText: rawNumMatch[0],
      })
    }
  }

  // 4. Horizon
  if (/\b(?:<|less\s+than|under)?\s*1\s*year\b|\b\d+\s*months?\b/i.test(text) && !/\b(?:1[\s–-]3|1\s*to\s*3|2|3|4|5)\s*years?\b/i.test(text)) {
    facts.push({
      field: 'horizon',
      label: 'Investment Horizon',
      value: '< 1 Year',
      displayValue: '< 1 Year',
      confidence: 'medium',
      confirmed: false,
      sourceText: text.match(/\b(?:<|less\s+than|under)?\s*1\s*year\b|\b\d+\s*months?\b/i)?.[0],
    })
  } else if (/\b(?:1[\s–-]3|1\s*to\s*3|2)\s*years?\b|\b(?:18|24)\s*months?\b/i.test(text)) {
    facts.push({
      field: 'horizon',
      label: 'Investment Horizon',
      value: '1–3 Years',
      displayValue: '1–3 Years',
      confidence: 'high',
      confirmed: false,
      sourceText: text.match(/\b(?:1[\s–-]3|1\s*to\s*3|2)\s*years?\b|\b(?:18|24)\s*months?\b/i)?.[0],
    })
  } else if (/\b(?:3[\s–-]5|3\s*to\s*5|4)\s*years?\b|\b(?:36|48)\s*months?\b/i.test(text)) {
    facts.push({
      field: 'horizon',
      label: 'Investment Horizon',
      value: '3–5 Years',
      displayValue: '3–5 Years',
      confidence: 'high',
      confirmed: false,
      sourceText: text.match(/\b(?:3[\s–-]5|3\s*to\s*5|4)\s*years?\b|\b(?:36|48)\s*months?\b/i)?.[0],
    })
  } else if (/\b(?:5\+|5\s*years?\s*or\s*more|10\s*years?|retirement|long\s*term)\b/i.test(text)) {
    facts.push({
      field: 'horizon',
      label: 'Investment Horizon',
      value: '5+ Years',
      displayValue: '5+ Years',
      confidence: 'high',
      confirmed: false,
      sourceText: text.match(/\b(?:5\+|5\s*years?\s*or\s*more|10\s*years?|retirement|long\s*term)\b/i)?.[0],
    })
  }

  // 5. Risk Appetite
  if (/\b(conservative|low\s*risk|cautious|defensive|risk\s*averse)\b/i.test(text)) {
    facts.push({
      field: 'riskAppetite',
      label: 'Risk Appetite',
      value: 'Conservative',
      displayValue: 'Conservative',
      confidence: 'high',
      confirmed: false,
      sourceText: text.match(/\b(conservative|low\s*risk|cautious|defensive|risk\s*averse)\b/i)?.[0],
    })
  } else if (/\b(aggressive|high\s*risk|risk\s*tolerant|bold|growth\s*oriented)\b/i.test(text)) {
    facts.push({
      field: 'riskAppetite',
      label: 'Risk Appetite',
      value: 'Aggressive',
      displayValue: 'Aggressive',
      confidence: 'high',
      confirmed: false,
      sourceText: text.match(/\b(aggressive|high\s*risk|risk\s*tolerant|bold|growth\s*oriented)\b/i)?.[0],
    })
  } else if (/\b(moderate|balanced\s*risk|medium\s*risk)\b/i.test(text)) {
    facts.push({
      field: 'riskAppetite',
      label: 'Risk Appetite',
      value: 'Moderate',
      displayValue: 'Moderate',
      confidence: 'high',
      confirmed: false,
      sourceText: text.match(/\b(moderate|balanced\s*risk|medium\s*risk)\b/i)?.[0],
    })
  }

  // 6. Max Loss
  const lossMatch = text.match(/(?:max(?:imum)?\s*loss|loss\s*(?:tolerance|limit)?|uncomfortable\s*with)\s*(?:of\s*)?(\d{1,2})\s*%/i)
    || text.match(/\b(5|10|15|20|25|30)\s*%\s*(?:loss|downside|drop)\b/i)
  if (lossMatch) {
    const pct = Number(lossMatch[1])
    if (pct >= 0 && pct <= 100) {
      facts.push({
        field: 'maxLoss',
        label: 'Maximum Comfortable Loss',
        value: `${pct}%`,
        displayValue: `${pct}%`,
        confidence: 'high',
        confirmed: false,
        sourceText: lossMatch[0],
      })
    }
  }

  // 7. Preferred Underlying
  for (const u of UNDERLYINGS) {
    const reg = new RegExp(`\\b(${u.name}|${u.ticker})\\b`, 'i')
    const match = text.match(reg)
    if (match) {
      facts.push({
        field: 'underlying',
        label: 'Preferred Underlying',
        value: `${u.name} (${u.ticker})`,
        displayValue: `${u.name} (${u.ticker})`,
        confidence: 'high',
        confirmed: false,
        sourceText: match[0],
      })
      break
    }
  }

  // 8. Liquidity Need
  if (/\b(need\s*(?:the\s*)?money\s*early|emergency|high\s*liquidity|liquid\s*funds?|may\s*withdraw)\b/i.test(text)) {
    facts.push({
      field: 'liquidity',
      label: 'Liquidity Need',
      value: 'High',
      displayValue: 'High',
      confidence: 'high',
      confirmed: false,
      sourceText: text.match(/\b(need\s*(?:the\s*)?money\s*early|emergency|high\s*liquidity|liquid\s*funds?|may\s*withdraw)\b/i)?.[0],
    })
  } else if (/\b(no\s*early\s*withdrawal|lock(?:ed)?\s*in|low\s*liquidity|patient\s*money)\b/i.test(text)) {
    facts.push({
      field: 'liquidity',
      label: 'Liquidity Need',
      value: 'Low',
      displayValue: 'Low',
      confidence: 'high',
      confirmed: false,
      sourceText: text.match(/\b(no\s*early\s*withdrawal|lock(?:ed)?\s*in|low\s*liquidity|patient\s*money)\b/i)?.[0],
    })
  }

  // 9. Experience
  if (/\b(first\s*time|never\s*invested|beginner|no\s*prior\s*experience|new\s*to\s*structured)\b/i.test(text)) {
    facts.push({
      field: 'experience',
      label: 'Structured Product Experience',
      value: 'None',
      displayValue: 'None',
      confidence: 'high',
      confirmed: false,
      sourceText: text.match(/\b(first\s*time|never\s*invested|beginner|no\s*prior\s*experience|new\s*to\s*structured)\b/i)?.[0],
    })
  } else if (/\b(experienced|veteran|seasoned|regularly\s*invests|trades\s*derivatives)\b/i.test(text)) {
    facts.push({
      field: 'experience',
      label: 'Structured Product Experience',
      value: 'Experienced',
      displayValue: 'Experienced',
      confidence: 'high',
      confirmed: false,
      sourceText: text.match(/\b(experienced|veteran|seasoned|regularly\s*invests|trades\s*derivatives)\b/i)?.[0],
    })
  }

  // 10. Sector Exposure
  const expMatch = text.match(/(?:already\s*has|existing|current)\s*(\d{1,2})\s*%\s*(?:exposure|in\s*tech|in\s*energy|in\s*financials)/i)
  if (expMatch) {
    const pct = Number(expMatch[1])
    if (pct >= 0 && pct <= 100) {
      facts.push({
        field: 'sectorExposure',
        label: 'Existing Sector Exposure',
        value: pct,
        displayValue: `${pct}%`,
        confidence: 'high',
        confirmed: false,
        sourceText: expMatch[0],
      })
    }
  }

  const missing = getMissingFields(answersSoFar, facts)

  const summary = facts.length > 0
    ? `Extracted ${facts.length} candidate fact${facts.length === 1 ? '' : 's'} from notes (${facts.map((f) => f.label).join(', ')}). ${missing.length} dimension${missing.length === 1 ? '' : 's'} remain unaddressed.`
    : `Could not identify structured investment parameters from notes. Regular discovery questions will apply.`

  return {
    facts,
    missingFields: missing,
    summary,
    source: 'demo',
  }
}

export function fallbackFollowUpQuestionsFromNotes(
  notes: string,
  answers: Answers,
  candidates: Question[]
): Question[] {
  const extracted = extractFactsRuleBased(notes, answers).facts
  const missing = getMissingFields(answers, extracted)
  const qs: Question[] = []

  // Check if any candidate directly answers a missing field
  for (const m of missing) {
    const candidate = candidates.find((c) => c.id === m.field)
    if (candidate && !qs.some((q) => q.id === candidate.id)) {
      qs.push({
        ...candidate,
        context: notes.trim()
          ? `Addressing missing detail from notes: ${m.reason}`
          : candidate.context,
      })
    }
  }

  // If none matched directly, take from candidates with notes context
  if (qs.length === 0) {
    return candidates.slice(0, 3).map((c) => ({
      ...c,
      context: notes.trim()
        ? `Clarifying question based on client notes.`
        : c.context,
    }))
  }

  return qs.slice(0, 3)
}
