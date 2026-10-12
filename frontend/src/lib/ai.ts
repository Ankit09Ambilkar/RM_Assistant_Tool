// Grok-powered versions of the AI features. Each one validates Grok's JSON before it is shown.
// The rule-based functions in discovery.ts / insights.ts are the fallbacks.
import { grokJSON, isStr, neutral } from './grok'
import type { Answers, Question } from './discovery'
import type { ClientProfile, Insight, ProductTerms, SuitabilityResult } from './types'
import { getUnderlying } from './market'
import { couponAmount, presetScenarios } from './payoff'

// 1. Discovery: Grok picks the next category (from an allowed list) and phrases the question.
//    Option values stay fixed so answers still map to profile fields deterministically.
export async function grokNextQuestion(answers: Answers, candidates: Question[], required: string[]): Promise<Question | null> {
  const allowed = candidates.map((q) => ({ category: q.id, default_question: q.text, type: q.type, options: q.options ?? null }))
  const res = await grokJSON(
    `Choose the single most relevant NEXT client-discovery question for the RM to ask, based on what the client already answered.
Pick exactly one "category" from ALLOWED_CATEGORIES. Rephrase the question naturally so it references the client's earlier answers.
Do NOT change the options; they are fixed. You may set "is_profile_complete": true only if no category in REQUIRED_CATEGORIES remains and further questions add little value.
Return JSON: {"category": string, "next_question": string, "context": string (one short sentence starting "You selected..." or similar, referencing an earlier answer), "why_asked": string (one sentence), "is_profile_complete": boolean}`,
    { answers_so_far: answers, ALLOWED_CATEGORIES: allowed, REQUIRED_CATEGORIES: required },
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
