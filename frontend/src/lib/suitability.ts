// Rule-based suitability engine. Four dimensions, each returns a status + human-readable reason.
import type { ClientProfile, ProductTerms, SuitabilityResult } from './types'
import { getUnderlying } from './market'
import { scenario, stressMovePct, worstCaseLossPct } from './payoff'

const HORIZON_MAX_MONTHS: Record<ClientProfile['horizon'], number> = {
  '< 1 Year': 12,
  '1–3 Years': 36,
  '3–5 Years': 60,
  '5+ Years': 120,
}

const RISK_SCORE = { Conservative: 1, Moderate: 2, Aggressive: 3 } as const

export function productRisk(p: ProductTerms) {
  const u = getUnderlying(p.underlying)
  let score = u.kind === 'Index' ? 1 : 2
  if (p.barrierPct >= 80) score += 1
  const label = score <= 1 ? 'Conservative' : score === 2 ? 'Moderate' : 'Aggressive'
  return { score, label }
}

export function runSuitability(c: ClientProfile, p: ProductTerms): SuitabilityResult[] {
  const results: SuitabilityResult[] = []
  const u = getUnderlying(p.underlying)

  // 1. Risk appetite
  const pr = productRisk(p)
  const cr = RISK_SCORE[c.riskAppetite]
  results.push(
    pr.score <= cr
      ? {
          dimension: 'Risk Appetite',
          status: 'MATCH',
          reason: `Product risk is ${pr.label.toLowerCase()} (${u.kind.toLowerCase()} underlying, ${p.barrierPct}% barrier), within the client's ${c.riskAppetite.toLowerCase()} risk appetite.`,
        }
      : {
          dimension: 'Risk Appetite',
          status: 'MISMATCH',
          reason: `Product risk is ${pr.label.toLowerCase()} but the client's risk appetite is ${c.riskAppetite.toLowerCase()}.`,
          action: 'Try an index underlying or a lower barrier.',
        },
  )

  // 2. Investment horizon
  const maxMonths = HORIZON_MAX_MONTHS[c.horizon]
  if (p.tenorMonths > maxMonths) {
    results.push({
      dimension: 'Investment Horizon',
      status: 'MISMATCH',
      reason: `${p.tenorMonths}-month maturity is longer than the client's ${c.horizon} horizon.`,
      action: `Choose a tenor of ${maxMonths} months or less.`,
    })
  } else if (c.liquidityNeed === 'High' && p.tenorMonths > 12) {
    results.push({
      dimension: 'Investment Horizon',
      status: 'WARNING',
      reason: `Tenor fits the ${c.horizon} horizon, but the client has a high liquidity need and early exit may be costly.`,
      action: 'Consider a 12-month or shorter tenor.',
    })
  } else {
    results.push({
      dimension: 'Investment Horizon',
      status: 'MATCH',
      reason: `${p.tenorMonths}-month maturity fits the client's ${c.horizon} horizon.`,
    })
  }

  // 3. Loss tolerance: loss in an illustrative stress scenario vs the client's stated limit
  const stress = stressMovePct(u.kind)
  const stressLoss = Math.max(0, -scenario(p, '', stress).returnPct)
  const worst = worstCaseLossPct(p)
  if (stressLoss > c.maxLossPct) {
    results.push({
      dimension: 'Loss Tolerance',
      status: 'MISMATCH',
      reason: `If ${u.name} falls ${-stress}% (stress scenario), the ${p.barrierPct}% barrier is breached and the product loses about ${stressLoss.toFixed(0)}%, above the client's stated ${c.maxLossPct}% limit.`,
      action: 'Lower the barrier, use an index underlying, or reduce the amount.',
    })
  } else if (stressLoss > 0) {
    results.push({
      dimension: 'Loss Tolerance',
      status: 'WARNING',
      reason: `In a ${-stress}% stress scenario the loss is about ${stressLoss.toFixed(0)}%, within the ${c.maxLossPct}% limit, but a deeper fall could lose up to ${worst.toFixed(0)}%.`,
      action: 'Make sure the client understands the deep-crash scenario.',
    })
  } else {
    results.push({
      dimension: 'Loss Tolerance',
      status: 'MATCH',
      reason: `The ${p.barrierPct}% barrier holds in a ${-stress}% stress scenario, so there is no capital loss. A fall below the barrier could still lose up to ${worst.toFixed(0)}%.`,
    })
  }

  // 4. Concentration
  const sameSector = u.kind === 'Stock' && u.sector !== 'Diversified Index'
  const clientSector = getUnderlying(c.preferredUnderlying).sector
  const exposure = clientSector === u.sector ? c.sectorExposurePct : 0
  if (!sameSector) {
    results.push({
      dimension: 'Concentration',
      status: 'MATCH',
      reason: `${u.name} is a diversified index, so it does not add single-sector concentration.`,
    })
  } else if (exposure >= 50) {
    results.push({
      dimension: 'Concentration',
      status: 'MISMATCH',
      reason: `Existing ${u.sector.toLowerCase()} exposure is already ${exposure}%. Adding ${u.name} increases it further.`,
      action: 'Use a diversified index or a different sector.',
    })
  } else if (exposure >= 25) {
    results.push({
      dimension: 'Concentration',
      status: 'WARNING',
      reason: `Existing ${u.sector.toLowerCase()} exposure: ${exposure}%. Underlying: ${u.name} (${u.sector}).`,
      action: 'Consider a diversified index underlying.',
    })
  } else {
    results.push({
      dimension: 'Concentration',
      status: 'MATCH',
      reason: `Existing ${u.sector.toLowerCase()} exposure is ${exposure}%, which is a manageable level.`,
    })
  }

  return results
}

export function concernCount(results: SuitabilityResult[]) {
  return results.filter((r) => r.status !== 'MATCH').length
}
