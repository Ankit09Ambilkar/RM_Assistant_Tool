// AI insights + client explanation (template-based demo mode).
// Everything here only references values already computed by the payoff and suitability engines.
import type { ClientProfile, Insight, ProductTerms, SuitabilityResult } from './types'
import { getUnderlying } from './market'
import { couponAmount, presetScenarios } from './payoff'
import { formatINR, formatLakh } from './format'

export function considerations(c: ClientProfile, p: ProductTerms): string[] {
  const u = getUnderlying(p.underlying)
  const out: string[] = []
  if (u.kind === 'Stock' && getUnderlying(c.preferredUnderlying).sector === u.sector && c.sectorExposurePct >= 25)
    out.push(`Existing ${u.sector.toLowerCase()} exposure is ${c.sectorExposurePct}%.`)
  if (c.maxLossPct <= 15) out.push(`Client's loss limit is ${c.maxLossPct}%. Check the barrier level.`)
  if (c.liquidityNeed === 'High') out.push('High liquidity need. Prefer shorter tenors.')
  if (p.notional > c.investmentAmount) out.push('Investment amount exceeds what the client planned to invest.')
  if (out.length === 0) out.push('No obvious conflicts with the profile yet. Run the analysis to confirm.')
  return out
}

export function generateInsights(c: ClientProfile, p: ProductTerms, suit: SuitabilityResult[]): Insight[] {
  const u = getUnderlying(p.underlying)
  const insights: Insight[] = []
  const byDim = Object.fromEntries(suit.map((s) => [s.dimension, s]))

  if (byDim['Loss Tolerance']?.status === 'MISMATCH') {
    insights.push({
      title: 'Loss tolerance',
      text: `This product may expose the client to losses beyond ${c.maxLossPct}%. ${byDim['Loss Tolerance'].reason}`,
      why: `The client entered ${c.maxLossPct}% as their maximum comfortable loss.`,
    })
  }
  if (byDim['Concentration']?.status !== 'MATCH') {
    insights.push({
      title: 'Portfolio concentration',
      text: `Consider existing ${u.sector.toLowerCase()} exposure before adding ${u.name}-linked exposure.`,
      why: `The client reported ${c.sectorExposurePct}% existing ${u.sector.toLowerCase()} exposure.`,
    })
  }
  if (byDim['Investment Horizon']?.status !== 'MATCH') {
    insights.push({
      title: 'Horizon & liquidity',
      text: byDim['Investment Horizon'].reason,
      why: `The client's horizon is ${c.horizon} with ${c.liquidityNeed.toLowerCase()} liquidity need.`,
    })
  }
  if (byDim['Risk Appetite']?.status === 'MISMATCH') {
    insights.push({
      title: 'Risk appetite',
      text: byDim['Risk Appetite'].reason,
      why: `The client's risk appetite was assessed as ${c.riskAppetite}.`,
    })
  }
  insights.push({
    title: 'Product structure',
    text: 'Explore how changing the barrier, tenor or underlying affects the fit. A lower barrier or an index underlying usually reduces risk, at the cost of a lower coupon.',
  })
  return insights
}

const OPENERS = [
  (amt: string, t: number, name: string) => `You are considering investing ${amt} for ${t} months in a product linked to ${name}.`,
  (amt: string, t: number, name: string) => `This is a ${t}-month investment of ${amt} whose outcome depends on how ${name} performs.`,
]

export function clientExplanation(c: ClientProfile, p: ProductTerms, suit: SuitabilityResult[], variant = 0) {
  const u = getUnderlying(p.underlying)
  const coupon = couponAmount(p)
  const scenarios = presetScenarios(p)
  const down40 = scenarios.find((s) => s.movePct === -40)!
  const concern = suit.find((s) => s.status === 'MISMATCH') ?? suit.find((s) => s.status === 'WARNING')

  const paragraph = [
    OPENERS[variant % OPENERS.length](formatINR(p.notional), p.tenorMonths, u.name),
    `It pays a coupon of ${p.couponPct}% a year (about ${formatINR(coupon)} in total), but your original investment is not fully protected if ${u.name} falls substantially.`,
    `As long as ${u.name} ends above ${p.barrierPct}% of its starting level, you get your full ${formatINR(p.notional)} back plus the coupon.`,
    `If it ends below that level, you share in the fall. For example, a 40% drop would leave you with about ${formatLakh(down40.finalValue)}.`,
  ].join(' ')

  return {
    paragraph,
    rows: [
      ['Potential Return', `${p.couponPct}% coupon (${formatINR(coupon)})`],
      ['Main Risk', 'Capital loss if the barrier is breached'],
      ['Important Level', `${p.barrierPct}% barrier`],
      ['Client Concern', concern ? concern.dimension + ': ' + concern.reason : 'No major concerns identified'],
    ] as [string, string][],
  }
}
