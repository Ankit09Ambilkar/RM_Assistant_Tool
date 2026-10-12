// Product-term validation shared by Configure and Explore Alternatives. Mirrors the backend rules.
import type { ProductTerms } from './types'
import { UNDERLYINGS } from './market'
import { MAX_AMOUNT } from './discovery'

export function validateProduct(p: ProductTerms): Partial<Record<keyof ProductTerms, string>> {
  const e: Partial<Record<keyof ProductTerms, string>> = {}
  const ok = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi
  if (!UNDERLYINGS.some((u) => u.ticker === p.underlying)) e.underlying = 'Choose a supported underlying.'
  if (!ok(p.notional, 1000, MAX_AMOUNT)) e.notional = 'Between ₹1,000 and ₹10,000 Cr.'
  if (!(Number.isFinite(p.couponPct) && p.couponPct > 0 && p.couponPct <= 30)) e.couponPct = 'Coupon must be above 0% and at most 30%.'
  if (!ok(p.barrierPct, 40, 100)) e.barrierPct = 'Barrier must be between 40% and 100%.'
  if (!ok(p.strikePct, 50, 120)) e.strikePct = 'Strike must be between 50% and 120%.'
  if (!e.barrierPct && !e.strikePct && p.barrierPct > p.strikePct) e.barrierPct = 'Barrier cannot be above the strike.'
  return e
}
