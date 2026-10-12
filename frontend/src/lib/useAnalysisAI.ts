// Shared hooks so the Analysis page and the Report use the same (cached) Grok output.
import { useRef } from 'react'
import { useAI } from './grok'
import { grokExplanation, grokInsights } from './ai'
import { clientExplanation, generateInsights } from './insights'
import type { ClientProfile, ProductTerms, SuitabilityResult } from './types'

const keyOf = (c: ClientProfile, p: ProductTerms) => JSON.stringify([c, p])

export function useInsights(c: ClientProfile, p: ProductTerms, suit: SuitabilityResult[]) {
  return useAI(`insights:${keyOf(c, p)}`, () => grokInsights(c, p, suit), () => generateInsights(c, p, suit))
}

export function useExplanation(c: ClientProfile, p: ProductTerms, suit: SuitabilityResult[]) {
  // In demo mode, Regenerate cycles through template phrasings.
  const variant = useRef(0)
  const ai = useAI(`explain:${keyOf(c, p)}`, () => grokExplanation(c, p, suit), () => clientExplanation(c, p, suit, variant.current++).paragraph)
  return ai
}
