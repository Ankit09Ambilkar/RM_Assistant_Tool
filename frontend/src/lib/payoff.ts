// Deterministic payoff engine for a Barrier Reverse Convertible (barrier observed at maturity).
// - Coupon is always paid (annualised rate x tenor).
// - Final level >= barrier: full notional returned.
// - Final level <  barrier: notional x (final / strike), i.e. client takes the underlying's loss.
import type { ProductTerms, ScenarioResult } from './types'

export function couponAmount(p: ProductTerms) {
  return p.notional * (p.couponPct / 100) * (p.tenorMonths / 12)
}

export function finalValueAt(p: ProductTerms, levelPct: number) {
  const coupon = couponAmount(p)
  const breached = levelPct < p.barrierPct
  const capital = breached ? p.notional * (levelPct / p.strikePct) : p.notional
  return { finalValue: capital + coupon, breached }
}

export function scenario(p: ProductTerms, name: string, movePct: number): ScenarioResult {
  const { finalValue, breached } = finalValueAt(p, 100 + movePct)
  const pnl = finalValue - p.notional
  return { name, movePct, finalValue, pnl, returnPct: (pnl / p.notional) * 100, barrierBreached: breached }
}

export function presetScenarios(p: ProductTerms): ScenarioResult[] {
  const breachMove = p.barrierPct - 100 - 1
  return [
    scenario(p, 'Market +10%', 10),
    scenario(p, 'Sideways', 0),
    scenario(p, 'Market −10%', -10),
    scenario(p, 'Market −20%', -20),
    scenario(p, 'Market −30%', -30),
    scenario(p, 'Market −40%', -40),
    scenario(p, `Barrier breach (${breachMove}%)`, breachMove),
  ]
}

export function payoffCurve(p: ProductTerms) {
  const points = []
  for (let level = 0; level <= 150; level += 1) {
    points.push({ level, value: Math.round(finalValueAt(p, level).finalValue) })
  }
  return points
}

// Loss (as positive %) just after the barrier is breached: the "cliff" a client faces.
export function lossJustBelowBarrier(p: ProductTerms) {
  const r = scenario(p, '', p.barrierPct - 100 - 0.01)
  return Math.max(0, -r.returnPct)
}

export function worstCaseLossPct(p: ProductTerms) {
  return Math.max(0, -scenario(p, '', -100).returnPct)
}

// Illustrative stress move: a severe-but-plausible fall (bigger for single stocks than for indices).
export function stressMovePct(kind: 'Stock' | 'Index') {
  return kind === 'Index' ? -25 : -40
}
