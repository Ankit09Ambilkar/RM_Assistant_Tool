// Grok-powered versions of the AI features. Each one validates Grok's JSON before it is shown.
// The rule-based functions in discovery.ts / insights.ts are the fallbacks.
import { grokJSON, grokStatus, isStr, neutral } from './grok'
import {
  type Answers,
  type Question,
  extractFactsRuleBased,
  fallbackFollowUpQuestionsFromNotes,
  getMissingFields,
} from './discovery'
import type {
  ClientProfile,
  ExtractedFact,
  ExtractionResult,
  Insight,
  MissingFieldInfo,
  ProductTerms,
  SuitabilityResult,
} from './types'
import { UNDERLYINGS, getUnderlying } from './market'
import { couponAmount, presetScenarios } from './payoff'

// 1. Discovery: Grok picks the next category (from an allowed list) and phrases the question.
//    Option values stay fixed so answers still map to profile fields deterministically.
export async function grokNextQuestion(
  answers: Answers,
  candidates: Question[],
  required: string[],
  notes?: string,
): Promise<Question | null> {
  const allowed = candidates.map((q) => ({ category: q.id, default_question: q.text, type: q.type, options: q.options ?? null }))
  const res = await grokJSON(
    `Choose the single most relevant NEXT client-discovery question for the RM to ask, based on what the client already answered and any additional RM notes.
Pick exactly one "category" from ALLOWED_CATEGORIES. Rephrase the question naturally so it references the client's earlier answers or notes.
Do NOT change the options; they are fixed. You may set "is_profile_complete": true only if no category in REQUIRED_CATEGORIES remains and further questions add little value.
Return JSON: {"category": string, "next_question": string, "context": string (one short sentence starting "You selected..." or "Based on your notes...", referencing an earlier answer or note), "why_asked": string (one sentence), "is_profile_complete": boolean}`,
    { answers_so_far: answers, ALLOWED_CATEGORIES: allowed, REQUIRED_CATEGORIES: required, ...(notes ? { rm_notes: notes } : {}) },
    (x) => {
      if (typeof x !== 'object' || !x) return null
      if (x.is_profile_complete === true && required.length === 0) return { complete: true as const }
      const base = candidates.find((q) => q.id === x.category)
      if (!base || !isStr(x.next_question, 300) || !isStr(x.why_asked, 400)) return null
      return {
        complete: false as const,
        q: { ...base, text: x.next_question.trim(), why: x.why_asked.trim(), context: isStr(x.context, 200) ? x.context.trim() : base.context },
      }
    },
  )
  return res.complete ? null : res.q
}

// 1b. Free-Text Fact Extraction: extracts candidate profile facts from the RM's notes using Grok.
export async function grokExtractFacts(notes: string, answersSoFar: Answers = {}): Promise<ExtractionResult> {
  const validUnderlyings = UNDERLYINGS.map((u) => `${u.name} (${u.ticker})`)
  const res = await grokJSON(
    `You are extracting structured client profile facts from the Relationship Manager's free-text notes.
Extract candidate facts ONLY when directly supported by the text. Do not invent numbers or preferences.
Allowed fields and their exact valid values:
- "name": client's full name (string)
- "goal": exactly one of ["Regular Income", "Growth", "Preserve Capital", "Combination"]
- "amount": investment amount as a number in INR (e.g. 500000, 10000000)
- "horizon": exactly one of ["< 1 Year", "1–3 Years", "3–5 Years", "5+ Years"]
- "riskAppetite": exactly one of ["Conservative", "Moderate", "Aggressive"]
- "maxLoss": exactly one of ["5%", "10%", "15%", "20%", "30% or more"]
- "underlying": exactly one of ${JSON.stringify(validUnderlyings)}
- "liquidity": exactly one of ["Low", "Medium", "High"]
- "experience": exactly one of ["None", "Some", "Experienced"]
- "sectorExposure": existing exposure percentage to the sector (number 0-100)

Return JSON with this exact shape:
{
  "facts": [
    {
      "field": string (matching one of the allowed fields above),
      "label": string (human-readable label, e.g. "Investment Goal"),
      "value": string | number (the exact allowed value),
      "displayValue": string (friendly formatted value, e.g. "₹10 Lakh" or "15%"),
      "confidence": "high" | "medium" | "low",
      "sourceText": string (short quote or phrase from the notes that supports this fact)
    }
  ],
  "missing_fields": [
    {
      "field": string,
      "label": string,
      "reason": string (short explanation of why this information is still needed)
    }
  ],
  "summary": string (1-2 sentences summarizing the client background and what was extracted)
}`,
    { rm_notes: notes, answers_so_far: answersSoFar },
    (x) => {
      if (typeof x !== 'object' || !x || !Array.isArray(x.facts)) return null
      const facts: ExtractedFact[] = []
      for (const f of x.facts) {
        if (!isStr(f?.field, 50) || !isStr(f?.label, 100)) continue
        // ENFORCE REQUIREMENT 5: NEVER auto-confirm extracted facts!
        facts.push({
          field: f.field.trim(),
          label: f.label.trim(),
          value: f.value,
          displayValue: isStr(f.displayValue, 100) ? f.displayValue.trim() : String(f.value),
          confidence: f.confidence === 'high' || f.confidence === 'low' ? f.confidence : 'medium',
          confirmed: false,
          sourceText: isStr(f.sourceText, 200) ? f.sourceText.trim() : undefined,
        })
      }
      const missingFields: MissingFieldInfo[] = []
      if (Array.isArray(x.missing_fields)) {
        for (const m of x.missing_fields) {
          if (isStr(m?.field, 50) && isStr(m?.label, 100)) {
            missingFields.push({
              field: m.field.trim(),
              label: m.label.trim(),
              reason: isStr(m.reason, 200) ? m.reason.trim() : 'Information needed.',
            })
          }
        }
      }
      return {
        facts,
        missingFields: missingFields.length > 0 ? missingFields : getMissingFields(answersSoFar, facts),
        summary: isStr(x.summary, 500) ? x.summary.trim() : 'Client facts extracted from notes.',
        source: 'grok' as const,
      }
    },
  )
  return res
}

// 1c. High-level fact extractor with automatic fallback to deterministic extraction
export async function extractClientFacts(notes: string, answersSoFar: Answers = {}): Promise<ExtractionResult> {
  const text = (notes ?? '').trim()
  if (!text) {
    return extractFactsRuleBased(notes, answersSoFar)
  }
  const st = await grokStatus()
  if (!st.configured) {
    return extractFactsRuleBased(notes, answersSoFar)
  }
  try {
    return await grokExtractFacts(notes, answersSoFar)
  } catch {
    const fallback = extractFactsRuleBased(notes, answersSoFar)
    return {
      ...fallback,
      summary: `${fallback.summary} (Grok unavailable, used rule-based extraction)`
    }
  }
}

// 1d. Generate targeted follow-up questions referencing RM notes
export async function grokFollowUpsFromNotes(
  notes: string,
  answers: Answers,
  candidates: Question[]
): Promise<Question[]> {
  const allowed = candidates.map((q) => ({
    category: q.id,
    default_question: q.text,
    type: q.type,
    options: q.options ?? null,
  }))

  const res = await grokJSON(
    `Based on the Relationship Manager's notes and the client answers so far, generate 1 to 3 targeted follow-up discovery questions.
Reference specific details from the client's notes in the context and phrasing.
Select categories ONLY from ALLOWED_CATEGORIES. Do not alter the options.
Return JSON: {
  "questions": [
    {
      "category": string,
      "question": string,
      "context": string (short sentence referencing what was mentioned in the notes or prior answers),
      "why_asked": string (one sentence)
    }
  ]
}`,
    { rm_notes: notes, answers_so_far: answers, ALLOWED_CATEGORIES: allowed },
    (x) => {
      if (!Array.isArray(x?.questions) || x.questions.length === 0) return null
      const out: Question[] = []
      for (const item of x.questions) {
        const base = candidates.find((c) => c.id === item.category)
        if (base && isStr(item.question, 300)) {
          out.push({
            ...base,
            text: item.question.trim(),
            context: isStr(item.context, 200) ? item.context.trim() : base.context,
            why: isStr(item.why_asked, 400) ? item.why_asked.trim() : base.why,
            source: 'ai',
          })
        }
      }
      return out.length > 0 ? out : null
    },
  )
  return res
}

// 1e. High-level follow-up question selector with automatic fallback
export async function getFollowUpQuestions(
  notes: string,
  answers: Answers,
  candidates: Question[]
): Promise<Question[]> {
  const st = await grokStatus()
  if (st.configured && notes.trim()) {
    try {
      const qs = await grokFollowUpsFromNotes(notes, answers, candidates)
      if (qs && qs.length > 0) return qs
    } catch {
      // Fall through to fallback
    }
  }
  return fallbackFollowUpQuestionsFromNotes(notes, answers, candidates)
}

// 2. Profile interpretation
export async function grokInterpretation(name: string, p: ClientProfile): Promise<string> {
  const u = getUnderlying(p.preferredUnderlying)
  return grokJSON(
    `Write a concise AI interpretation (2-3 sentences, max 70 words) of this client's investment profile for the RM.
Mention goal, risk/loss tolerance, and any concentration or liquidity concern. Use only the given fields.
Return JSON: {"interpretation": string}`,
    { client_name: name, profile: p, preferred_underlying: { name: u.name, sector: u.sector, kind: u.kind } },
    (x) => (isStr(x?.interpretation, 800) && neutral(x.interpretation) ? x.interpretation.trim() : null),
  )
}

function analysisInput(c: ClientProfile, p: ProductTerms, suit: SuitabilityResult[]) {
  const u = getUnderlying(p.underlying)
  return {
    client_profile: c,
    product: { ...p, underlying_name: u.name, sector: u.sector, underlying_kind: u.kind, total_coupon_inr: Math.round(couponAmount(p)) },
    payoff_rules: [
      'The coupon is ALWAYS paid at maturity, whether or not the barrier is breached.',
      `The barrier is only checked at maturity: if ${u.name} ends at or above ${p.barrierPct}% of its starting level, the full investment is returned.`,
      `If it ends below ${p.barrierPct}%, the client gets back investment x (final level / ${p.strikePct}%), i.e. they share the full fall, plus the coupon.`,
    ],
    scenarios_at_maturity: presetScenarios(p).map((s) => ({
      scenario: s.name,
      final_value_inr: Math.round(s.finalValue),
      pnl_inr: Math.round(s.pnl),
      return_pct: Math.round(s.returnPct * 10) / 10,
      barrier_breached: s.barrierBreached,
    })),
    suitability_results: suit,
  }
}

// 3. AI insights
export async function grokInsights(c: ClientProfile, p: ProductTerms, suit: SuitabilityResult[]): Promise<Insight[]> {
  return grokJSON(
    `Generate 3-5 AI insights for the RM about this structured product for this client.
Cover each suitability concern (WARNING/MISMATCH) and finish with one insight suggesting which dimensions to explore (barrier, tenor, underlying, amount), with no market-timing predictions.
For every insight that references a client fact, set "why" to the exact profile field and value it is based on (e.g. "Client entered 15% as max comfortable loss."). Use null for "why" on general insights.
Return JSON: {"insights": [{"title": string (2-4 words), "text": string (max 45 words), "why": string | null}]}`,
    analysisInput(c, p, suit),
    (x) => {
      if (!Array.isArray(x?.insights) || x.insights.length === 0) return null
      const out: Insight[] = x.insights
        .filter((i: any) => isStr(i?.title, 80) && isStr(i?.text, 600) && neutral(i.text))
        .slice(0, 6)
        .map((i: any) => ({ title: i.title.trim(), text: i.text.trim(), why: isStr(i.why, 400) ? i.why.trim() : undefined }))
      return out.length ? out : null
    },
  )
}

// 4. Client explanation paragraph
export async function grokExplanation(c: ClientProfile, p: ProductTerms, suit: SuitabilityResult[]): Promise<string> {
  return grokJSON(
    `Write a plain-language explanation the RM can read to the client (second person, "you"), 90-140 words.
It must include: what the product is linked to and for how long, the coupon, that capital is not fully protected, what the barrier level means in simple words, one downside example taken from the scenarios provided, and the main client-specific concern from the suitability results (if any). No jargon like "reverse convertible" without explaining it.
Return JSON: {"explanation": string}`,
    analysisInput(c, p, suit),
    (x) => (isStr(x?.explanation, 2000) && neutral(x.explanation) ? x.explanation.trim() : null),
  )
}
